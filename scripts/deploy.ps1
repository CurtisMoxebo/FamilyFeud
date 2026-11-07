# ==========================================
# Family Feud Online - Continuous Deployment Script
# Idempotent rollout for Windows Home Server (US-24)
# ==========================================

[CmdletBinding()]
param(
    [string]$Branch = "main",
    [string]$Environment = "production",
    [string]$ComposeFile = "docker-compose.yml",
    [string]$HealthCheckUrl = "http://localhost:5000/api/health",
    [string]$FrontendCheckUrl = "http://localhost",
    [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n>>> [CD-DEPLOY] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host ">>> [CD-DEPLOY] SUCCESS: $Message" -ForegroundColor Green
}

function Write-Failure {
    param([string]$Message)
    Write-Host ">>> [CD-DEPLOY] ERROR: $Message" -ForegroundColor Red
}

try {
    Write-Step "Starting Continuous Deployment to Windows Home Server (Environment: $Environment, Branch: $Branch)..."

    # Automatically ensure Docker inside WSL is running and bind dynamic WSL IP
    try {
        $wslStatus = wsl.exe -u root service docker status 2>&1
        if ($LASTEXITCODE -ne 0 -or $wslStatus -notmatch "is running") {
            Write-Host "Waking up Docker daemon inside WSL..." -ForegroundColor Gray
            $null = wsl.exe -u root service docker start 2>&1
        }
        $dynamicWslIp = (wsl.exe hostname -I 2>$null).Trim().Split(" ")[0]
        if ($dynamicWslIp -match "^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$") {
            $env:DOCKER_HOST = "tcp://${dynamicWslIp}:2375"
            Write-Host "Connected to WSL Docker daemon at $env:DOCKER_HOST" -ForegroundColor Gray
        }
    } catch {
        Write-Host "WSL auto-detection skipped (using host Docker)." -ForegroundColor Gray
    }

    # 1. Resolve Compose Command (docker compose or docker-compose)
    $composeCmd = "docker compose"
    $composeWorks = $false
    try {
        $null = docker compose version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $composeWorks = $true
            $composeCmd = "docker compose"
        }
    } catch {}

    if (-not $composeWorks) {
        try {
            $null = docker-compose version 2>&1
            if ($LASTEXITCODE -eq 0) {
                $composeCmd = "docker-compose"
            } else {
                throw "Neither 'docker compose' nor 'docker-compose' is available."
            }
        } catch {
            throw "Neither 'docker compose' nor 'docker-compose' is available on PATH."
        }
    }
    Write-Host "Using Compose command: $composeCmd" -ForegroundColor Gray

    # 2. Verify Server-Managed Unified Root .env
    Write-Step "Checking server-managed environment configuration (.env)..."
    $envPath = Join-Path $PSScriptRoot "..\.env"
    $envExamplePath = Join-Path $PSScriptRoot "..\.env.example"
    
    # Also check parent runner directories for persistent .env (e.g. C:\actions-runner\family_feud\.env)
    $runnerRootEnv = "C:\actions-runner\family_feud\.env"

    if (-not (Test-Path $envPath)) {
        if (Test-Path $runnerRootEnv) {
            Write-Host "Found persistent server configuration at '$runnerRootEnv'. Copying to workspace..." -ForegroundColor Green
            Copy-Item $runnerRootEnv $envPath -Force
        } elseif (Test-Path $envExamplePath) {
            Write-Host "No .env found on server. Initializing template from .env.example..." -ForegroundColor Yellow
            Copy-Item $envExamplePath $envPath
            throw "A new .env file was created at '$((Resolve-Path $envPath).Path)'. Please edit it with your production database passwords and API keys before running deployment."
        } else {
            throw "Required root .env file was not found at '$envPath' or '$runnerRootEnv'. Please create it manually on the server with production secrets."
        }
    }

    # Validate that required secrets are set in the server's .env file
    $envContent = Get-Content $envPath
    $hasRootPass = $false
    $hasUserPass = $false

    foreach ($line in $envContent) {
        $trimmed = $line.Trim()
        if ($trimmed.StartsWith("MYSQL_ROOT_PASSWORD=") -and $trimmed -ne "MYSQL_ROOT_PASSWORD=" -and -not $trimmed.Contains("your_root_password_here")) {
            $hasRootPass = $true
        }
        if ($trimmed.StartsWith("MYSQL_PASSWORD=") -and $trimmed -ne "MYSQL_PASSWORD=" -and -not $trimmed.Contains("your_database_password_here")) {
            $hasUserPass = $true
        }
    }

    if (-not $hasRootPass) {
        throw "MYSQL_ROOT_PASSWORD is not configured in '$envPath'. Please set your root password in the server's .env file."
    }
    if (-not $hasUserPass) {
        throw "MYSQL_PASSWORD is not configured in '$envPath'. Please set your database password in the server's .env file."
    }

    # Resolve ports dynamically from .env for health checks
    $resolvedBackendPort = "5000"
    $resolvedFrontendPort = "80"
    foreach ($line in $envContent) {
        $trimmed = $line.Trim()
        if ($trimmed.StartsWith("BACKEND_PORT=") -or ($trimmed.StartsWith("PORT=") -and $resolvedBackendPort -eq "5000")) {
            $val = $trimmed.Substring($trimmed.IndexOf("=") + 1).Trim().Trim('"').Trim("'")
            if ($val) { $resolvedBackendPort = $val }
        }
        if ($trimmed.StartsWith("FRONTEND_PORT=")) {
            $val = $trimmed.Substring($trimmed.IndexOf("=") + 1).Trim().Trim('"').Trim("'")
            if ($val) { $resolvedFrontendPort = $val }
        }
    }

    # If DOCKER_HOST points to a specific remote or WSL IP (e.g. tcp://172.x.x.x:2375), probe that host directly
    $targetHost = "localhost"
    if ($env:DOCKER_HOST -match "tcp://([^:]+):") {
        $candidateHost = $matches[1]
        if ($candidateHost -ne "127.0.0.1" -and $candidateHost -ne "localhost") {
            $targetHost = $candidateHost
        }
    }

    if ($HealthCheckUrl -eq "http://localhost:5000/api/health") {
        $HealthCheckUrl = "http://${targetHost}:$resolvedBackendPort/api/health"
    }
    if ($FrontendCheckUrl -eq "http://localhost") {
        $FrontendCheckUrl = if ($resolvedFrontendPort -eq "80") { "http://${targetHost}" } else { "http://${targetHost}:$resolvedFrontendPort" }
    }

    Write-Success "Server-managed .env validated (Backend Port: $resolvedBackendPort, Frontend Port: $resolvedFrontendPort)."

    # 3. Pull latest Git updates if inside a repository
    try {
        $gitStatus = git status 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Step "Checking for latest git commits on '$Branch'..."
            git fetch origin $Branch 2>&1 | Out-Null
            git checkout -B $Branch "origin/$Branch" 2>&1 | Out-Null
            git reset --hard "origin/$Branch" 2>&1 | Out-Null
        }
    } catch {
        Write-Host "Git update skipped or already up-to-date." -ForegroundColor Gray
    }

    # 4. Build and Launch Containers
    Write-Step "Building images and launching container stack..."
    if ($composeCmd -eq "docker compose") {
        docker compose -f $ComposeFile up -d --build --remove-orphans
    } else {
        docker-compose -f $ComposeFile up -d --build --remove-orphans
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Docker compose up failed with exit code $LASTEXITCODE."
    }
    Write-Success "Containers built and started in background."

    # 5. Wait for MySQL to become healthy
    Write-Step "Waiting for MySQL database container to report healthy..."
    $dbHealthy = $false
    $dbWaitStart = Get-Date
    while (((Get-Date) - $dbWaitStart).TotalSeconds -lt 45) {
        $dbStatus = docker inspect -f "{{.State.Health.Status}}" familyfeud_db 2>$null
        if ($dbStatus -eq "healthy") {
            $dbHealthy = $true
            break
        }
        Start-Sleep -Seconds 2
    }
    if (-not $dbHealthy) {
        Write-Host "Warning: MySQL container healthcheck did not transition to 'healthy' within 45s. Proceeding with schema push..." -ForegroundColor Yellow
    } else {
        Write-Success "MySQL database is healthy and ready for queries."
    }

    # 6. Apply Prisma Database Schema Synchronization (US-19 & US-24)
    Write-Step "Synchronizing database schema with Prisma migrations..."
    $migrationSucceeded = $false
    try {
        if ($composeCmd -eq "docker compose") {
            docker compose exec -T backend npx prisma migrate deploy --schema=prisma/schema
        } else {
            docker-compose exec -T backend npx prisma migrate deploy --schema=prisma/schema
        }
        if ($LASTEXITCODE -eq 0) {
            $migrationSucceeded = $true
            Write-Success "Prisma migrations applied cleanly."
        }
    } catch {
        Write-Host "prisma migrate deploy encountered a warning. Falling back to prisma db push..." -ForegroundColor Yellow
    }

    if (-not $migrationSucceeded) {
        Write-Host "Synchronizing schema state with prisma db push..." -ForegroundColor Yellow
        if ($composeCmd -eq "docker compose") {
            docker compose exec -T backend npx prisma db push --skip-generate --schema=prisma/schema
        } else {
            docker-compose exec -T backend npx prisma db push --skip-generate --schema=prisma/schema
        }
        if ($LASTEXITCODE -ne 0) {
            throw "Prisma database schema synchronization failed with exit code $LASTEXITCODE."
        }
        Write-Success "Prisma schema synchronized cleanly via db push."
    }

    # 7. Post-Deployment Health Verification
    Write-Step "Verifying application health probe ($HealthCheckUrl)..."
    $healthOk = $false
    $startTime = Get-Date

    while (((Get-Date) - $startTime).TotalSeconds -lt $TimeoutSeconds) {
        try {
            $response = Invoke-RestMethod -Uri $HealthCheckUrl -Method Get -TimeoutSec 5 -ErrorAction SilentlyContinue
            if ($response -and $response.status -eq "ok") {
                $healthOk = $true
                break
            }
        } catch {}

        # Fallback probe to localhost if targetHost was an internal IP
        if ($targetHost -ne "localhost" -and -not $healthOk) {
            try {
                $localFallbackUrl = "http://localhost:$resolvedBackendPort/api/health"
                $altResp = Invoke-RestMethod -Uri $localFallbackUrl -Method Get -TimeoutSec 5 -ErrorAction SilentlyContinue
                if ($altResp -and $altResp.status -eq "ok") {
                    $HealthCheckUrl = $localFallbackUrl
                    $healthOk = $true
                    break
                }
            } catch {}
        }
        Start-Sleep -Seconds 3
    }

    if (-not $healthOk) {
        Write-Failure "Health check probe timed out after $TimeoutSeconds seconds!"
        Write-Host "Dumping recent container logs for diagnostic remediation:" -ForegroundColor Yellow
        if ($composeCmd -eq "docker compose") {
            docker compose logs --tail=100
        } else {
            docker-compose logs --tail=100
        }
        throw "Continuous deployment aborted: Service failed health check."
    }
    Write-Success "Backend health check returned HTTP 200 { status: 'ok' }!"

    # Also verify Frontend Nginx responds
    try {
        $frontendResp = Invoke-WebRequest -Uri $FrontendCheckUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
        if ($frontendResp.StatusCode -eq 200) {
            Write-Success "Frontend Nginx web server responded HTTP 200 OK!"
        }
    } catch {
        Write-Host "Note: Frontend check at $FrontendCheckUrl completed with non-fatal status." -ForegroundColor Gray
    }

    # 8. Clean up dangling images to preserve disk space (US-24 Scenario 6)
    Write-Step "Pruning dangling images to reclaim host disk space..."
    docker image prune -f | Out-Null
    Write-Success "Dangling Docker images pruned successfully."

    # 9. Deployment Summary
    $commitHash = try { (git rev-parse --short HEAD 2>$null) } catch { "latest" }
    Write-Host "`n========================================================" -ForegroundColor Green
    Write-Host "  CONTINUOUS DEPLOYMENT COMPLETE! (Commit: $commitHash)" -ForegroundColor Green
    Write-Host "  Application URLs:" -ForegroundColor Green
    Write-Host "    Web UI:        $FrontendCheckUrl" -ForegroundColor Cyan
    Write-Host "    Backend API:   $HealthCheckUrl" -ForegroundColor Cyan
    Write-Host "========================================================`n" -ForegroundColor Green

} catch {
    Write-Failure "Deployment failed: $_"
    exit 1
}

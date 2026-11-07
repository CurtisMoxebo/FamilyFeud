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

    # 2. Synchronize / Prepare Unified Root .env
    Write-Step "Configuring production environment variables (.env)..."
    $envPath = Join-Path $PSScriptRoot "..\.env"
    $envExamplePath = Join-Path $PSScriptRoot "..\.env.example"

    if (-not (Test-Path $envPath)) {
        if (Test-Path $envExamplePath) {
            Write-Host "No .env found. Initializing from .env.example..." -ForegroundColor Yellow
            Copy-Item $envExamplePath $envPath
        } else {
            New-Item -ItemType File -Path $envPath -Force | Out-Null
        }
    }

    # Inject or update environment variables provided by GitHub Secrets
    $secretsToInject = @{
        "GEMINI_API_KEY"      = $env:GEMINI_API_KEY
        "MYSQL_ROOT_PASSWORD" = $env:MYSQL_ROOT_PASSWORD
        "MYSQL_PASSWORD"      = $env:MYSQL_PASSWORD
        "MYSQL_USER"          = $env:MYSQL_USER
        "MYSQL_DATABASE"      = $env:MYSQL_DATABASE
    }

    $existingEnvLines = if (Test-Path $envPath) { Get-Content $envPath } else { @() }
    $envMap = [ordered]@{}

    foreach ($line in $existingEnvLines) {
        $trimmed = $line.Trim()
        if ($trimmed -and -not $trimmed.StartsWith("#") -and $trimmed.Contains("=")) {
            $splitIndex = $trimmed.IndexOf("=")
            $k = $trimmed.Substring(0, $splitIndex).Trim()
            $v = $trimmed.Substring($splitIndex + 1).Trim()
            $envMap[$k] = $v
        }
    }

    # Apply non-empty secrets from environment
    foreach ($entry in $secretsToInject.GetEnumerator()) {
        if ($entry.Value -and $entry.Value.Trim() -ne "") {
            $envMap[$entry.Key] = $entry.Value
        }
    }

    # Ensure required defaults exist if not already set
    if (-not $envMap.Contains("NODE_ENV")) { $envMap["NODE_ENV"] = "production" }
    if (-not $envMap.Contains("PORT")) { $envMap["PORT"] = "5000" }
    if (-not $envMap.Contains("MYSQL_PORT")) { $envMap["MYSQL_PORT"] = "3306" }
    if (-not $envMap.Contains("MYSQL_USER") -or $envMap["MYSQL_USER"] -eq "your_database_user_here") {
        $envMap["MYSQL_USER"] = "family-feud-user"
    }
    if (-not $envMap.Contains("MYSQL_DATABASE") -or $envMap["MYSQL_DATABASE"] -eq "your_database_name_here") {
        $envMap["MYSQL_DATABASE"] = "family_feud"
    }
    if (-not $envMap.Contains("CLIENT_URL")) { $envMap["CLIENT_URL"] = "http://localhost" }

    # Rewrite .env cleanly
    $newEnvContent = @()
    $newEnvContent += "# =========================================="
    $newEnvContent += "# Family Feud Online - Production .env"
    $newEnvContent += "# Managed by continuous deployment (deploy.ps1)"
    $newEnvContent += "# =========================================="
    foreach ($key in $envMap.Keys) {
        $newEnvContent += "$key=$($envMap[$key])"
    }
    Set-Content -Path $envPath -Value $newEnvContent -Encoding utf8
    Write-Success ".env configured successfully with active secrets."

    # 3. Pull latest Git updates if inside a repository
    try {
        $gitStatus = git status 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Step "Checking for latest git commits on '$Branch'..."
            git fetch origin $Branch
            git checkout $Branch
            git pull origin $Branch
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

    # 6. Apply Prisma Database Schema Synchronization
    Write-Step "Synchronizing database schema with Prisma..."
    if ($composeCmd -eq "docker compose") {
        docker compose exec -T backend npx prisma db push --skip-generate
    } else {
        docker-compose exec -T backend npx prisma db push --skip-generate
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Prisma database schema synchronization failed with exit code $LASTEXITCODE."
    }
    Write-Success "Prisma schema synchronized cleanly."

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
        } catch {
            # Retry after delay
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

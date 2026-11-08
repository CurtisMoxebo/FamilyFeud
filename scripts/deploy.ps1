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

function ConvertTo-WslPath {
    param([string]$WinPath)
    $resolved = (Resolve-Path $WinPath).Path
    $drive = $resolved.Substring(0, 1).ToLower()
    $rest = $resolved.Substring(2).Replace('\', '/')
    return "/mnt/$drive$rest"
}

try {
    Write-Step "Starting Continuous Deployment to Windows Home Server (Environment: $Environment, Branch: $Branch)..."

    $projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    $wslProjectDir = ConvertTo-WslPath $projectRoot
    $useWsl = $false
    $dynamicWslIp = "127.0.0.1"

    # Automatically detect if Linux Docker is available inside WSL
    try {
        $null = wsl.exe -u root service docker status 2>&1
        if ($LASTEXITCODE -ne 0) {
            $null = wsl.exe -u root service docker start 2>&1
        }
        $testPs = wsl.exe -u root docker ps 2>&1
        if ($LASTEXITCODE -eq 0) {
            $useWsl = $true
            $ipCandidate = (wsl.exe hostname -I 2>$null).Trim().Split(" ")[0]
            if ($ipCandidate -match "^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$") {
                $dynamicWslIp = $ipCandidate
            }
            Write-Host "Detected Linux Docker Engine in WSL (WSL IP: $dynamicWslIp)." -ForegroundColor Green
        }
    } catch {}

    # Helper functions to run Docker commands natively on host or in WSL
    function Invoke-DockerCompose {
        param([string]$CommandArgs)
        if ($useWsl) {
            wsl.exe -u root bash -c "cd '$wslProjectDir' && docker compose $CommandArgs"
        } else {
            cmd.exe /c "docker compose $CommandArgs"
        }
    }

    function Invoke-Docker {
        param([string]$CommandArgs)
        if ($useWsl) {
            wsl.exe -u root bash -c "docker $CommandArgs"
        } else {
            cmd.exe /c "docker $CommandArgs"
        }
    }

    # 1. Verify Server-Managed Unified Root .env
    Write-Step "Checking server-managed environment configuration (.env)..."
    $envPath = Join-Path $projectRoot ".env"
    $envExamplePath = Join-Path $projectRoot ".env.example"
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

    # Resolve ports dynamically from .env for health checks & port proxying
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

    $targetHost = if ($useWsl) { $dynamicWslIp } else { "localhost" }

    if ($HealthCheckUrl -eq "http://localhost:5000/api/health") {
        $HealthCheckUrl = "http://${targetHost}:$resolvedBackendPort/api/health"
    }
    if ($FrontendCheckUrl -eq "http://localhost") {
        $FrontendCheckUrl = if ($resolvedFrontendPort -eq "80") { "http://${targetHost}" } else { "http://${targetHost}:$resolvedFrontendPort" }
    }

    # If running in WSL, set up Windows port forwarding so localhost (IPv4 + IPv6) and LAN can reach the app instantly
    if ($useWsl) {
        try {
            Start-Service iphlpsvc -ErrorAction SilentlyContinue
            # IPv4 (LAN & Localhost)
            netsh interface portproxy add v4tov4 listenport=$resolvedFrontendPort listenaddress=0.0.0.0 connectport=$resolvedFrontendPort connectaddress=$dynamicWslIp 2>&1 | Out-Null
            netsh interface portproxy add v4tov4 listenport=$resolvedBackendPort listenaddress=0.0.0.0 connectport=$resolvedBackendPort connectaddress=$dynamicWslIp 2>&1 | Out-Null
            netsh interface portproxy add v4tov4 listenport=$resolvedFrontendPort listenaddress=127.0.0.1 connectport=$resolvedFrontendPort connectaddress=$dynamicWslIp 2>&1 | Out-Null
            netsh interface portproxy add v4tov4 listenport=$resolvedBackendPort listenaddress=127.0.0.1 connectport=$resolvedBackendPort connectaddress=$dynamicWslIp 2>&1 | Out-Null
            # IPv6 Localhost (eliminates the 20-30s browser hang when Windows resolves localhost to [::1])
            netsh interface portproxy add v6tov4 listenport=$resolvedFrontendPort listenaddress=::1 connectport=$resolvedFrontendPort connectaddress=$dynamicWslIp 2>&1 | Out-Null
            netsh interface portproxy add v6tov4 listenport=$resolvedBackendPort listenaddress=::1 connectport=$resolvedBackendPort connectaddress=$dynamicWslIp 2>&1 | Out-Null
        } catch {}
    }

    Write-Success "Server-managed .env validated (Backend Port: $resolvedBackendPort, Frontend Port: $resolvedFrontendPort)."

    # 2. Pull latest Git updates if inside a repository
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

    # 3. Build and Launch Containers
    Write-Step "Building images and launching container stack..."
    Invoke-DockerCompose "-f $ComposeFile up -d --build --remove-orphans"
    if ($LASTEXITCODE -ne 0) {
        throw "Docker compose up failed with exit code $LASTEXITCODE."
    }
    Write-Success "Containers built and started in background."

    # 4. Wait for MySQL to become healthy
    Write-Step "Waiting for MySQL database container to report healthy..."
    $dbHealthy = $false
    $dbWaitStart = Get-Date
    while (((Get-Date) - $dbWaitStart).TotalSeconds -lt 45) {
        $rawStatus = Invoke-Docker 'inspect -f "{{.State.Health.Status}}" familyfeud_db' 2>&1
        if ($rawStatus -and ($rawStatus -join "").Trim() -eq "healthy") {
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

    # 5. Apply Prisma Database Schema Synchronization (US-19 & US-24)
    Write-Step "Synchronizing database schema with Prisma migrations..."
    $migrationSucceeded = $false
    try {
        Invoke-DockerCompose "exec -T backend npx prisma migrate deploy --schema=prisma/schema"
        if ($LASTEXITCODE -eq 0) {
            $migrationSucceeded = $true
            Write-Success "Prisma migrations applied cleanly."
        }
    } catch {
        Write-Host "prisma migrate deploy encountered a warning. Falling back to prisma db push..." -ForegroundColor Yellow
    }

    if (-not $migrationSucceeded) {
        Write-Host "Synchronizing schema state with prisma db push..." -ForegroundColor Yellow
        Invoke-DockerCompose "exec -T backend npx prisma db push --skip-generate --schema=prisma/schema"
        if ($LASTEXITCODE -ne 0) {
            throw "Prisma database schema synchronization failed with exit code $LASTEXITCODE."
        }
        Write-Success "Prisma schema synchronized cleanly via db push."
    }

    # 6. Post-Deployment Health Verification
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
        Invoke-Docker "logs --tail 50 familyfeud_backend"
        Invoke-Docker "logs --tail 50 familyfeud_frontend"
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

    # 7. Clean up dangling images to preserve disk space (US-24 Scenario 6)
    Write-Step "Pruning dangling images to reclaim host disk space..."
    Invoke-Docker "image prune -f" | Out-Null
    Write-Success "Dangling Docker images pruned successfully."

    # 8. Deployment Summary
    $commitHash = try { (git rev-parse --short HEAD 2>$null) } catch { "latest" }
    Write-Host "`n========================================================" -ForegroundColor Green
    Write-Host "  CONTINUOUS DEPLOYMENT COMPLETE! (Commit: $commitHash)" -ForegroundColor Green
    Write-Host "  Application URLs:" -ForegroundColor Green
    Write-Host "    Web UI:        http://localhost:$resolvedFrontendPort (or http://${dynamicWslIp}:$resolvedFrontendPort)" -ForegroundColor Cyan
    Write-Host "    Backend API:   http://localhost:$resolvedBackendPort/api/health" -ForegroundColor Cyan
    Write-Host "========================================================`n" -ForegroundColor Green

} catch {
    Write-Failure "Deployment failed: $_"
    exit 1
}

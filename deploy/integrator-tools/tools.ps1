# tools.ps1 - Gestion de la stack d'outillage intégrateur (Nautobot, Batfish, OPA)
param (
    [Parameter(Position=0)]
    [ValidateSet("up", "down", "status", "seed", "test", "reset", "reset-nautobot")]
    [string]$Command = "status"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Check-Docker {
    $dockerPath = (Get-Command docker -ErrorAction SilentlyContinue).Source
    if (-not $dockerPath) {
        Write-Error "Binaire 'docker' introuvable dans le PATH. Veuillez installer ou vérifier Docker Desktop."
        return $false
    }
    try {
        $null = docker info 2>&1
        return $true
    } catch {
        Write-Host "[ATTENTION] Le démon Docker Desktop n'est pas actif." -ForegroundColor Yellow
        Write-Host "Veuillez lancer 'Docker Desktop' depuis Windows puis relancer cette commande." -ForegroundColor Yellow
        return $false
    }
}

switch ($Command) {
    "up" {
        if (-not (Check-Docker)) { exit 1 }
        Write-Host ">>> Démarrage des conteneurs intégrateur (Nautobot, Batfish, OPA)..." -ForegroundColor Cyan
        Set-Location $ScriptDir
        docker compose -f compose.yml up -d

        Write-Host ">>> Attente de la disponibilité de Nautobot (initialisation de la base)..." -ForegroundColor Cyan
        $attempts = 0
        $maxAttempts = 40
        $ready = $false
        while ($attempts -lt $maxAttempts -and -not $ready) {
            Start-Sleep -Seconds 3
            $attempts++
            try {
                $res = Invoke-RestMethod -Uri "http://127.0.0.1:8080/health/" -Method Get -TimeoutSec 3 -ErrorAction SilentlyContinue
                if ($res) { $ready = $true }
            } catch {
                Write-Host "." -NoNewline
            }
        }
        Write-Host ""

        if ($ready) {
            Write-Host ">>> Nautobot est prêt ! Injection de l'inventaire témoin (seed)..." -ForegroundColor Green
            docker compose -f compose.yml exec -T nautobot python /opt/nautobot/seed-nautobot.py
            Write-Host ">>> Stack intégrateur opérationnelle !" -ForegroundColor Green
            & $MyInvocation.MyCommand.Path status
        } else {
            Write-Host "[AVERTISSEMENT] Nautobot est encore en phase de migration. Exécutez '.\tools.ps1 seed' dans quelques instants." -ForegroundColor Yellow
        }
    }

    "down" {
        if (-not (Check-Docker)) { exit 1 }
        Write-Host ">>> Arrêt des conteneurs..." -ForegroundColor Cyan
        Set-Location $ScriptDir
        docker compose -f compose.yml down
    }

    "reset" {
        if (-not (Check-Docker)) { exit 1 }
        Write-Host ">>> Suppression complète des conteneurs et des volumes..." -ForegroundColor Red
        Set-Location $ScriptDir
        docker compose -f compose.yml down -v
    }

    "reset-nautobot" {
        if (-not (Check-Docker)) { exit 1 }
        Write-Host ">>> Réinitialisation de la base Nautobot (base vierge, prête à hydrater)..." -ForegroundColor Yellow
        Set-Location $ScriptDir
        docker compose -f compose.yml rm -s -f nautobot-worker nautobot nautobot-db
        docker volume rm -f archinex-integrator-tools_nautobot-db-data | Out-Null
        docker compose -f compose.yml up -d nautobot-db nautobot-redis nautobot nautobot-worker

        Write-Host ">>> Attente de la disponibilité de Nautobot (migrations + superuser)..." -ForegroundColor Cyan
        $attempts = 0
        $maxAttempts = 40
        $ready = $false
        while ($attempts -lt $maxAttempts -and -not $ready) {
            Start-Sleep -Seconds 3
            $attempts++
            try {
                $res = Invoke-RestMethod -Uri "http://127.0.0.1:8080/health/" -Method Get -TimeoutSec 3 -ErrorAction SilentlyContinue
                if ($res) { $ready = $true }
            } catch {
                Write-Host "." -NoNewline
            }
        }
        Write-Host ""

        if ($ready) {
            Write-Host ">>> Nautobot est prêt et vide ! (Utilisez '.\tools.ps1 seed' si vous souhaitez réinjecter le jeu témoin.)" -ForegroundColor Green
        } else {
            Write-Host "[AVERTISSEMENT] Nautobot est encore en cours d'initialisation. Vérifiez '.\tools.ps1 status' dans quelques instants." -ForegroundColor Yellow
        }
    }

    "seed" {
        if (-not (Check-Docker)) { exit 1 }
        Write-Host ">>> Exécution du script de seed dans Nautobot..." -ForegroundColor Cyan
        Set-Location $ScriptDir
        docker compose -f compose.yml exec -T nautobot python /opt/nautobot/seed-nautobot.py
    }

    "status" {
        Write-Host "==========================================================" -ForegroundColor Cyan
        Write-Host "   ÉTAT DE L'ENVIRONNEMENT D'INTÉGRATION & OUTILLAGE      " -ForegroundColor Cyan
        Write-Host "==========================================================" -ForegroundColor Cyan

        # 1. Binaire OPA Local
        $localOpa = Join-Path $ScriptDir "..\..\tools\bin\opa.exe"
        if (Test-Path $localOpa) {
            $opaVer = & $localOpa version | Select-Object -First 1
            Write-Host "[LOCAL] OPA CLI        : DISPONIBLE ($opaVer)" -ForegroundColor Green
        } else {
            Write-Host "[LOCAL] OPA CLI        : ABSENT (scripts\install-opa.ps1 pour l'installer)" -ForegroundColor Yellow
        }

        # 2. Démon Docker
        $dockerRunning = Check-Docker
        if (-not $dockerRunning) {
            Write-Host "[DOCKER] Démon Engine   : ARRÊTÉ (Lancer Docker Desktop)" -ForegroundColor Red
            return
        } else {
            Write-Host "[DOCKER] Démon Engine   : OPÉRATIONNEL" -ForegroundColor Green
        }

        # 3. Services Docker
        Set-Location $ScriptDir
        docker compose -f compose.yml ps

        Write-Host "`nPoints d'accès des services :" -ForegroundColor Cyan
        Write-Host " - Nautobot Web UI & API : http://127.0.0.1:8080 (Token: 0123456789abcdef0123456789abcdef01234567)"
        Write-Host " - Nautobot GraphQL      : http://127.0.0.1:8080/api/graphql/"
        Write-Host " - Batfish Service API   : http://127.0.0.1:9997"
        Write-Host " - OPA Server HTTP       : http://127.0.0.1:8181/v1/data"
        Write-Host " - sushy-emulator Redfish: http://127.0.0.1:8001/redfish/v1/Systems"
        Write-Host " - OpenBao (Secrets/PKI) : http://127.0.0.1:8200 (Token: archinex-bao-dev-token)"
        Write-Host " - Keycloak (IdP/OIDC)   : http://127.0.0.1:8085 (admin / adminpassword)"
        Write-Host " - Zot OCI Registry      : http://127.0.0.1:5000/v2/"
        Write-Host " - Trivy Server          : http://127.0.0.1:4954"
        Write-Host " - Technitium DDI/DNS    : http://127.0.0.1:5380 (DNS UDP/TCP: 15353)"
        Write-Host " - Forgejo (GitOps)      : http://127.0.0.1:3001 (SSH: 2222)"
    }

    "test" {
        Write-Host ">>> Test de connectivité des services..." -ForegroundColor Cyan
        # Test Nautobot GraphQL
        try {
            $headers = @{
                "Authorization" = "Token 0123456789abcdef0123456789abcdef01234567"
                "Content-Type"  = "application/json"
            }
            $queryBody = '{"query": "query { devices { name status { name } role { name } } }"}'
            $res = Invoke-RestMethod -Uri "http://127.0.0.1:8080/api/graphql/" -Method Post -Headers $headers -Body $queryBody
            Write-Host "[OK] Nautobot GraphQL : Réponse reçue -> $($res | ConvertTo-Json -Compress)" -ForegroundColor Green
        } catch {
            Write-Host "[FAIL] Nautobot GraphQL non joignable : $_" -ForegroundColor Red
        }

        # Test OPA Server
        try {
            $opaRes = Invoke-RestMethod -Uri "http://127.0.0.1:8181/v1/data" -Method Get
            Write-Host "[OK] OPA Server REST : Réponse reçue" -ForegroundColor Green
        } catch {
            Write-Host "[FAIL] OPA Server REST non joignable : $_" -ForegroundColor Red
        }

        # Test sushy-emulator Redfish
        try {
            $redfishRes = Invoke-RestMethod -Uri "http://127.0.0.1:8001/redfish/v1/Systems" -Method Get
            Write-Host "[OK] sushy-emulator Redfish : $($redfishRes.Members.Count) système(s) exposé(s)" -ForegroundColor Green
        } catch {
            Write-Host "[FAIL] sushy-emulator Redfish non joignable : $_" -ForegroundColor Red
        }

        # Test OpenBao
        try {
            $null = Invoke-RestMethod -Uri "http://127.0.0.1:8200/v1/sys/health" -Method Get
            Write-Host "[OK] OpenBao HTTP API : Opérationnel" -ForegroundColor Green
        } catch {
            Write-Host "[FAIL] OpenBao non joignable : $_" -ForegroundColor Red
        }

        # Test Zot OCI Registry
        try {
            $null = Invoke-RestMethod -Uri "http://127.0.0.1:5000/v2/" -Method Get
            Write-Host "[OK] Zot OCI Registry : API /v2/ joignable" -ForegroundColor Green
        } catch {
            Write-Host "[FAIL] Zot OCI Registry non joignable : $_" -ForegroundColor Red
        }

        # Test Keycloak
        try {
            $null = Invoke-RestMethod -Uri "http://127.0.0.1:8085/realms/master/.well-known/openid-configuration" -Method Get
            Write-Host "[OK] Keycloak OIDC : Discovery endpoint joignable" -ForegroundColor Green
        } catch {
            Write-Host "[FAIL] Keycloak non joignable : $_" -ForegroundColor Red
        }

        # Test Technitium DNS UI/API
        try {
            $null = Invoke-WebRequest -Uri "http://127.0.0.1:5380/" -Method Get -UseBasicParsing
            Write-Host "[OK] Technitium DDI/DNS : Console HTTP joignable" -ForegroundColor Green
        } catch {
            Write-Host "[FAIL] Technitium DDI/DNS non joignable : $_" -ForegroundColor Red
        }

        # Test Forgejo
        try {
            $null = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/version" -Method Get
            Write-Host "[OK] Forgejo GitOps : API REST joignable" -ForegroundColor Green
        } catch {
            Write-Host "[FAIL] Forgejo non joignable : $_" -ForegroundColor Red
        }
    }
}

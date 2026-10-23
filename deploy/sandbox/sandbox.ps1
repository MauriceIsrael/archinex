<#
.SYNOPSIS
    Environnement de test neuf et vierge sous Windows avec Docker Desktop :
    Hub de connaissances (LLMOps) + Archinex, en conteneurs, derrière HTTPS.

.DESCRIPTION
    Commandes disponibles :
      .\sandbox.ps1 up        construit et démarre (génère les secrets au premier lancement)
      .\sandbox.ps1 status    état des conteneurs
      .\sandbox.ps1 creds     URL et comptes de test
      .\sandbox.ps1 smoke     vérifie le Hub, la connexion Archinex -> Hub (assertions signées) et un compte
      .\sandbox.ps1 logs [service] journaux en temps réel
      .\sandbox.ps1 down      arrête, GARDE les données
      .\sandbox.ps1 reset     arrête et EFFACE les données (bases vierges au prochain ' up '), garde les secrets
      .\sandbox.ps1 destroy   comme reset, et efface aussi les secrets (.sandbox\)

    Variables d'environnement facultatives :
      SANDBOX_ORIGIN       URL publique, https obligatoire. Défaut : https://localhost:8443
      LLMOPS_DIR           Copie locale de LLMOps. Défaut : ..\LLMOps à côté d'Archinex, sinon clonée
      LLMOPS_REF           Branche ou étiquette à cloner si LLMOps est absent (défaut : main)
      HUB_LOCAL_PORT       Port local d'écoute du Hub pour curl (défaut : 8000)
      ANTHROPIC_API_KEY    Clé du modèle pour les fonctionnalités IA
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('up', 'status', 'creds', 'smoke', 'logs', 'down', 'reset', 'destroy', 'help', '')]
    [string]$Command = 'help',

    [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
    [string[]]$ExtraArgs
)

$ErrorActionPreference = 'Stop'

$Here = $PSScriptRoot
$Repo = (Resolve-Path (Join-Path $Here '..\..')).Path
$State = Join-Path $Here '.sandbox'
$EnvFile = Join-Path $State 'env'
$ComposeFile = Join-Path $Here 'compose.yml'

function Assert-CommandAvailable([string]$name, [string]$err) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "sandbox: ' $name ' est requis. $err"
    }
}

function Get-RandomHex([int]$bytes = 24) {
    $buffer = New-Object byte[] $bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
    return [System.BitConverter]::ToString($buffer).Replace('-', '').ToLowerInvariant()
}

function Generate-Ed25519Keypair([string]$kid = 'sandbox-1') {
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $nodeScript = @"
const crypto = require('crypto');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: '$kid', use: 'sig' };
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).trim().replace(/\r?\n/g, '\\n');
console.log(JSON.stringify({ pem, jwks: { keys: [jwk] } }));
"@
        $raw = node -e $nodeScript
        return ($raw | ConvertFrom-Json)
    }

    # Secours : OpenSSL si disponible
    $opensslBin = $null
    if (Get-Command openssl -ErrorAction SilentlyContinue) {
        $opensslBin = 'openssl'
    } elseif (Test-Path 'C:\Program Files\Git\usr\bin\openssl.exe') {
        $opensslBin = 'C:\Program Files\Git\usr\bin\openssl.exe'
    } elseif (Test-Path 'C:\Program Files\Git\mingw64\bin\openssl.exe') {
        $opensslBin = 'C:\Program Files\Git\mingw64\bin\openssl.exe'
    }

    if ($opensslBin) {
        $tmpKey = [System.IO.Path]::GetTempFileName()
        try {
            & $opensslBin genpkey -algorithm ed25519 -out $tmpKey 2>$null
            $pemLines = (Get-Content $tmpKey | Where-Object { $_.Trim() -ne '' }) -join '\n'
            $pubDer = & $opensslBin pkey -in $tmpKey -pubout -outform DER 2>$null
            # Derniers 32 octets = clé brute Ed25519
            $rawBytes = $pubDer[($pubDer.Length - 32)..($pubDer.Length - 1)]
            $base64 = [System.Convert]::ToBase64String($rawBytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
            return [pscustomobject]@{
                pem = $pemLines
                jwks = [pscustomobject]@{
                    keys = @(
                        [pscustomobject]@{
                            kty = 'OKP'
                            crv = 'Ed25519'
                            x = $base64
                            kid = $kid
                            use = 'sig'
                        }
                    )
                }
            }
        } finally {
            Remove-Item -Force $tmpKey -ErrorAction SilentlyContinue
        }
    }

    throw 'Node.js (ou OpenSSL) est requis pour générer la clé Ed25519.'
}

function Find-Llmops {
    if ($env:LLMOPS_DIR) {
        $resolved = Resolve-Path $env:LLMOPS_DIR -ErrorAction SilentlyContinue
        if ($resolved) {
            return $resolved.Path.Replace('\', '/')
        }
        return $env:LLMOPS_DIR.Replace('\', '/')
    }

    $adjacent = Join-Path $Repo '..\LLMOps'
    if (Test-Path (Join-Path $adjacent 'Dockerfile')) {
        return (Resolve-Path $adjacent).Path.Replace('\', '/')
    }

    $dir = Join-Path $State 'LLMOps'
    if (-not (Test-Path (Join-Path $dir '.git'))) {
        Assert-CommandAvailable 'git' 'Git est requis pour cloner le Hub LLMOps.'
        $ref = if ($env:LLMOPS_REF) { $env:LLMOPS_REF } else { 'main' }
        Write-Host "Clonage du Hub LLMOps ($ref) dans $dir..."
        git clone --depth 1 --branch $ref https://github.com/MauriceIsrael/LLMOps.git $dir
        if ($LASTEXITCODE -ne 0) {
            throw 'Échec du clonage du Hub LLMOps.'
        }
    }
    return (Resolve-Path $dir).Path.Replace('\', '/')
}

function New-SandboxEnv {
    if (Test-Path $EnvFile) { return }

    if (-not (Test-Path $State)) {
        New-Item -ItemType Directory -Path $State -Force | Out-Null
    }

    $origin = if ($env:SANDBOX_ORIGIN) { $env:SANDBOX_ORIGIN } else { 'https://localhost:8443' }
    if (-not $origin.StartsWith('https://')) {
        throw "SANDBOX_ORIGIN doit commencer par https:// (les cookies de session l'exigent)."
    }

    $hostPort = $origin.Substring('https://'.Length).Split('/')[0]
    $domain = $hostPort.Split(':')[0]
    $httpsPort = 443
    $httpPort = 80
    if ($hostPort.Contains(':')) {
        $httpsPort = [int]($hostPort.Split(':')[1])
        $httpPort = [Math]::Max(1, $httpsPort - 363) # 8443 -> 8080
    }

    $kid = 'sandbox-1'
    $keyData = Generate-Ed25519Keypair -kid $kid
    $pem = $keyData.pem
    $jwksJson = ($keyData.jwks | ConvertTo-Json -Depth 10 -Compress)

    $pAdmin = Get-RandomHex 9
    $pArch = Get-RandomHex 9
    $pSec = Get-RandomHex 9
    $pCiso = Get-RandomHex 9

    $users = @(
        [ordered]@{
            key = 'admin'
            name = 'Administrateur (test)'
            email = 'admin@sandbox.test'
            password = $pAdmin
            role = 'admin'
            kbHandle = '@maintainers'
            kbRoles = @('kb:admin', 'kb:review', 'kb:evaluate', 'kb:maintain')
        },
        [ordered]@{
            key = 'architect'
            name = 'Architecte (test)'
            email = 'architect@sandbox.test'
            password = $pArch
            role = 'user'
            kbHandle = '@core-owner-architecture'
            kbRoles = @('kb:review')
            ownedDomains = @('architecture')
        },
        [ordered]@{
            key = 'security'
            name = 'Sécurité (test)'
            email = 'security@sandbox.test'
            password = $pSec
            role = 'user'
            kbHandle = '@security-compliance-team'
            kbRoles = @('kb:review')
            ownedDomains = @('security-governance')
        },
        [ordered]@{
            key = 'ciso'
            name = 'RSSI (test)'
            email = 'ciso@sandbox.test'
            password = $pCiso
            role = 'user'
            kbHandle = '@ciso-office'
            kbRoles = @('kb:evaluate')
        }
    )
    $usersJson = ($users | ConvertTo-Json -Depth 10 -Compress)

    $serviceToken = Get-RandomHex 24
    $demoToken = Get-RandomHex 24
    $jwtSecret = Get-RandomHex 32
    $hubPersonas = '@maintainers=admin@sandbox.test,@core-owner-architecture=architect@sandbox.test,@security-compliance-team=security@sandbox.test,@ciso-office=ciso@sandbox.test'

    $lines = @(
        '# Secrets du bac à sable : ne pas committer, ne pas partager.',
        "SANDBOX_ORIGIN='$origin'",
        "SANDBOX_DOMAIN='$domain'",
        "SANDBOX_HTTPS_PORT='$httpsPort'",
        "SANDBOX_HTTP_PORT='$httpPort'",
        "SERVICE_TOKEN='$serviceToken'",
        "DEMO_TOKEN='$demoToken'",
        "JWT_SECRET='$jwtSecret'",
        "ARCHINEX_ACTOR_KID='$kid'",
        "ARCHINEX_ACTOR_PRIVATE_KEY='$pem'",
        "ARCHINEX_JWKS='$jwksJson'",
        "SANDBOX_HUB_PERSONAS='$hubPersonas'",
        "SANDBOX_ARCHINEX_USERS='$usersJson'"
    )

    $content = ($lines -join "`n") + "`n"
    [System.IO.File]::WriteAllText($EnvFile, $content, [System.Text.UTF8Encoding]::new($false))
}

function Load-Env {
    if (-not (Test-Path $EnvFile)) {
        throw "Pas d'environnement : lancez d'abord ' .\sandbox.ps1 up '."
    }
    Get-Content $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#') -and ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$')) {
            $name = $matches[1]
            $val = $matches[2]
            if (($val.StartsWith("'") -and $val.EndsWith("'")) -or ($val.StartsWith('"') -and $val.EndsWith('"'))) {
                $val = $val.Substring(1, $val.Length - 2)
            }
            [System.Environment]::SetEnvironmentVariable($name, $val, 'Process')
        }
    }
}

function Invoke-SandboxCompose {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$ComposeArgs)
    & docker compose -f $ComposeFile --env-file $EnvFile --project-directory $Here @ComposeArgs
    return $LASTEXITCODE
}

function Show-Creds {
    Load-Env
    Write-Host "URL Archinex : $env:SANDBOX_ORIGIN"
    if ($env:SANDBOX_DOMAIN -eq 'localhost') {
        Write-Host "  (certificat local : le navigateur avertit, c'est attendu ; sur un domaine public, le certificat est valide)" -ForegroundColor DarkGray
    }
    $hubPort = if ($env:HUB_LOCAL_PORT) { $env:HUB_LOCAL_PORT } else { '8000' }
    Write-Host "Hub (curl, depuis cette machine seulement) : http://127.0.0.1:$hubPort   jeton de service : $env:SERVICE_TOKEN"
    Write-Host "Comptes de test (e-mail / mot de passe) :"

    $users = $env:SANDBOX_ARCHINEX_USERS | ConvertFrom-Json
    foreach ($u in $users) {
        $handle = if ($u.kbHandle) { "[$($u.kbHandle)]" } else { '' }
        Write-Host ("  {0,-24} {1,-20} {2}  {3}" -f $u.email, $u.password, $u.name, $handle)
    }
    Write-Host "Auteur / relecteur : ' architect ' et ' security ' ne peuvent pas relire leurs propres candidats (séparation des tâches)." -ForegroundColor DarkGray
}

function Invoke-Smoke {
    Load-Env
    $ok = $true
    $hubPort = if ($env:HUB_LOCAL_PORT) { $env:HUB_LOCAL_PORT } else { '8000' }

    # 1. Vérification Hub /ready
    $out = (& docker compose -f $ComposeFile --env-file $EnvFile --project-directory $Here exec -T hub curl -fsS http://localhost:8000/ready 2>$null)
    if ($LASTEXITCODE -eq 0 -and $out) {
        Write-Host "Hub prêt : $out" -ForegroundColor Green
    } else {
        Write-Host "Hub : NON prêt" -ForegroundColor Red
        $ok = $false
    }

    # 2. Mode strict : l'en-tête brut doit être refusé (401 signed_actor_required)
    $curlCmd = if (Get-Command curl.exe -ErrorAction SilentlyContinue) { 'curl.exe' } else { 'curl' }
    $code = (& $curlCmd -s -o NUL -w "%{http_code}" -H "Authorization: Bearer $env:SERVICE_TOKEN" -H "X-Actor-Email: admin@sandbox.test" "http://127.0.0.1:$hubPort/api/knowledge/me")
    if ($code -eq '401') {
        Write-Host "Hub : en-tête brut refusé (401) — mode strict actif" -ForegroundColor Green
    } else {
        Write-Host "Hub : en-tête brut -> $code (attendu 401)" -ForegroundColor Red
        $ok = $false
    }

    # 3. Archinex : connexion de l'administrateur de test
    $users = $env:SANDBOX_ARCHINEX_USERS | ConvertFrom-Json
    $admin = $users | Where-Object { $_.key -eq 'admin' }
    $pw = $admin.password
    $body = (@{ email = 'admin@sandbox.test'; password = $pw } | ConvertTo-Json -Compress)
    $domain = $env:SANDBOX_DOMAIN
    $httpsPort = $env:SANDBOX_HTTPS_PORT
    $origin = $env:SANDBOX_ORIGIN

    $code = (& $curlCmd -sk -o NUL -w "%{http_code}" -H "Origin: $origin" -H "Content-Type: application/json" --resolve "${domain}:${httpsPort}:127.0.0.1" -d $body "https://${domain}:${httpsPort}/api/auth/login" 2>$null)
    if ($code -eq '200') {
        Write-Host "Archinex : connexion de l'administrateur de test OK" -ForegroundColor Green
    } else {
        Write-Host "Archinex : connexion -> $code (attendu 200)" -ForegroundColor Red
        $ok = $false
    }

    if ($ok) {
        Write-Host "Smoke : OK" -ForegroundColor Green
    } else {
        Write-Host "Smoke : ÉCHEC (voir ' .\sandbox.ps1 logs ')" -ForegroundColor Red
        exit 1
    }
}

function Show-Help {
    Get-Help $MyInvocation.MyCommand.Path -Detailed
}

# ─── Aiguillage des commandes ──────────────────────────────────────────────────
switch ($Command) {
    'up' {
        Assert-CommandAvailable 'docker' 'Docker Desktop doit être installé et démarré.'
        $versionOut = (& docker compose version 2>&1)
        if ($LASTEXITCODE -ne 0) {
            throw "' docker compose ' (v2) est requis ($versionOut)."
        }

        New-SandboxEnv
        $env:LLMOPS_DIR = Find-Llmops
        Load-Env

        $exitCode = Invoke-SandboxCompose up -d --build --wait
        if ($exitCode -ne 0) {
            throw "Échec du démarrage de docker compose (code : $exitCode)."
        }
        Write-Host ''
        Show-Creds
    }

    'status' {
        Load-Env
        Invoke-SandboxCompose ps
    }

    'creds' {
        Show-Creds
    }

    'smoke' {
        Invoke-Smoke
    }

    'logs' {
        Load-Env
        $logArgs = @('logs', '--tail=200', '-f') + $ExtraArgs
        Invoke-SandboxCompose @logArgs
    }

    'down' {
        Load-Env
        if (-not $env:LLMOPS_DIR) { $env:LLMOPS_DIR = '.' }
        Invoke-SandboxCompose down
    }

    'reset' {
        Load-Env
        if (-not $env:LLMOPS_DIR) { $env:LLMOPS_DIR = '.' }
        Invoke-SandboxCompose down -v
        Write-Host "Données effacées. ' .\sandbox.ps1 up ' repart de bases vierges (mêmes comptes et mots de passe)." -ForegroundColor Yellow
    }

    'destroy' {
        if (Test-Path $EnvFile) {
            Load-Env
            if (-not $env:LLMOPS_DIR) { $env:LLMOPS_DIR = '.' }
            Invoke-SandboxCompose down -v --rmi local
        }
        if (Test-Path $State) {
            Remove-Item -Recurse -Force $State
        }
        Write-Host "Tout est supprimé (conteneurs, volumes, secrets)." -ForegroundColor Yellow
    }

    Default {
        Write-Host @"
Environnement de test neuf et vierge (Windows + Docker Desktop) :
  .\sandbox.ps1 up        construit et démarre (génère les secrets au premier lancement)
  .\sandbox.ps1 status    état des conteneurs
  .\sandbox.ps1 creds     URL et comptes de test
  .\sandbox.ps1 smoke     vérifie le Hub, la connexion Archinex -> Hub et un compte
  .\sandbox.ps1 logs [s]  journaux en direct
  .\sandbox.ps1 down      arrête, GARDE les données
  .\sandbox.ps1 reset     arrête et EFFACE les données (bases vierges au prochain ' up ')
  .\sandbox.ps1 destroy   supprime tout (conteneurs, volumes, secrets .sandbox\)
"@
    }
}

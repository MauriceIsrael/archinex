# Script d'installation securise d'Open Policy Agent (OPA) pour Windows
# Version epinglee : v1.21.4 avec verification d'integrite SHA-256

$ErrorActionPreference = "Stop"

$OpaVersion = "v1.21.4"
$ExpectedSha256 = "efad1c0ee4e3150d213f7babdaff3440b18b93c7368b465fca42cda392947f7c"
$DownloadUrl = "https://github.com/open-policy-agent/opa/releases/download/$OpaVersion/opa_windows_amd64.exe"

$TargetDir = Join-Path $PSScriptRoot "..\tools\bin"
if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

$TargetExe = Join-Path $TargetDir "opa.exe"
$TempFile = Join-Path $TargetDir "opa_temp.exe"

Write-Host "Telechargement d'OPA $OpaVersion depuis GitHub..."
Invoke-WebRequest -Uri $DownloadUrl -OutFile $TempFile -UseBasicParsing

Write-Host "Verification du hachage SHA-256..."
$ActualSha256 = (Get-FileHash -Path $TempFile -Algorithm SHA256).Hash.ToLower()

if ($ActualSha256 -ne $ExpectedSha256) {
    Remove-Item $TempFile -Force -ErrorAction SilentlyContinue
    Write-Error "ECHEC DE SECURITE : La somme de controle SHA-256 ($ActualSha256) ne correspond pas a la valeur attendue ($ExpectedSha256) !"
    exit 1
}

Move-Item -Path $TempFile -Destination $TargetExe -Force
Write-Host "OPA $OpaVersion installe avec succes dans $TargetExe (SHA-256 certifie)"

& $TargetExe version

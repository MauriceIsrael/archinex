#!/usr/bin/env bash
# Script d'installation sécurisé d'Open Policy Agent (OPA) pour Linux / CI
# Version épinglée : v1.21.4 avec vérification d'intégrité SHA-256

set -euo pipefail

OPA_VERSION="v1.21.4"
EXPECTED_SHA256="2ab571f367f293bb19523b76f92f1945bbf245003392c7f392903f95c2b9b630"
DOWNLOAD_URL="https://github.com/open-policy-agent/opa/releases/download/${OPA_VERSION}/opa_linux_amd64_static"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${SCRIPT_DIR}/../tools/bin"
mkdir -p "${TARGET_DIR}"

TARGET_BIN="${TARGET_DIR}/opa"
TEMP_FILE="${TARGET_DIR}/opa_temp"

echo "📥 Téléchargement d'OPA ${OPA_VERSION}..."
curl -fsSL -o "${TEMP_FILE}" "${DOWNLOAD_URL}"

echo "🔒 Vérification de la somme SHA-256..."
ACTUAL_SHA256=$(sha256sum "${TEMP_FILE}" | awk '{print $1}')

if [ "${ACTUAL_SHA256}" != "${EXPECTED_SHA256}" ]; then
  rm -f "${TEMP_FILE}"
  echo "❌ ÉCHEC DE SÉCURITÉ : La somme SHA-256 (${ACTUAL_SHA256}) ne correspond pas à (${EXPECTED_SHA256}) !" >&2
  exit 1
fi

mv "${TEMP_FILE}" "${TARGET_BIN}"
chmod +x "${TARGET_BIN}"
echo "✅ OPA ${OPA_VERSION} installé avec succès dans ${TARGET_BIN}"

"${TARGET_BIN}" version

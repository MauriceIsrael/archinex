#!/usr/bin/env bash
# Script d'installation sécurisé d'Open Policy Agent (OPA) pour Linux / CI
# Version épinglée : v1.21.4 avec vérification d'intégrité SHA-256

set -euo pipefail

OPA_VERSION="v1.21.4"
EXPECTED_SHA256="ed073d3c5a15724e7c3d9c16db22f38cb51ce0e26e7310df1b94f74e06acca3f"
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

#!/usr/bin/env bash
# Gate CI d'architecture EDP (Issue #185)
# Exécute la vérification d'intégrité, d'auto-test, de mutation et d'évaluation OPA.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🛡️  [EDP Architecture Gate] Démarrage de la vérification CI..."

# Vérifier la présence du binaire OPA
if [ -z "${OPA_BIN:-}" ]; then
  if [ -x "$ROOT_DIR/tools/bin/opa" ]; then
    export OPA_BIN="$ROOT_DIR/tools/bin/opa"
  elif [ -x "$ROOT_DIR/tools/bin/opa.exe" ]; then
    export OPA_BIN="$ROOT_DIR/tools/bin/opa.exe"
  elif command -v opa >/dev/null 2>&1; then
    export OPA_BIN="$(command -v opa)"
  else
    echo "❌ Binaire OPA introuvable dans tools/bin ou PATH."
    echo "💡 Exécutez : ./scripts/install-opa.sh (ou scripts/install-opa.ps1 sur Windows)"
    exit 3
  fi
fi

echo "ℹ️  Utilisation de OPA : $OPA_BIN ($($OPA_BIN version | head -n 1))"

# Exécution du script de garde
cd "$ROOT_DIR"
npx tsx scripts/edp-gate.ts "$@"

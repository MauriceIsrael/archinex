#!/usr/bin/env bash
# tools.sh - Gestion de la stack d'outillage intégrateur (Nautobot, Batfish, OPA)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMAND="${1:-status}"

check_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "[ERREUR] Commande 'docker' introuvable."
    return 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "[ERREUR] Démon Docker inactif. Veuillez démarrer Docker."
    return 1
  fi
  return 0
}

case "$COMMAND" in
  up)
    check_docker
    echo ">>> Démarrage des conteneurs intégrateur (Nautobot, Batfish, OPA)..."
    cd "$SCRIPT_DIR"
    docker compose -f compose.yml up -d

    echo ">>> Attente de la disponibilité de Nautobot..."
    for i in {1..30}; do
      if curl -fsS http://127.0.0.1:8080/api/ >/dev/null 2>&1; then
        echo ">>> Nautobot est prêt ! Injection du seed..."
        docker compose -f compose.yml exec -T nautobot nautobot-server nbshell < seed-nautobot.py
        echo ">>> Stack intégrateur opérationnelle !"
        break
      fi
      sleep 3
    done
    ;;

  down)
    check_docker
    echo ">>> Arrêt des conteneurs..."
    cd "$SCRIPT_DIR"
    docker compose -f compose.yml down
    ;;

  reset)
    check_docker
    echo ">>> Suppression complète des conteneurs et des volumes..."
    cd "$SCRIPT_DIR"
    docker compose -f compose.yml down -v
    ;;

  seed)
    check_docker
    echo ">>> Exécution du script de seed dans Nautobot..."
    cd "$SCRIPT_DIR"
    docker compose -f compose.yml exec -T nautobot nautobot-server nbshell < seed-nautobot.py
    ;;

  status)
    echo "=========================================================="
    echo "   ÉTAT DE L'ENVIRONNEMENT D'INTÉGRATION & OUTILLAGE      "
    echo "=========================================================="
    if [ -f "$SCRIPT_DIR/../../tools/bin/opa" ] || [ -f "$SCRIPT_DIR/../../tools/bin/opa.exe" ]; then
      echo "[LOCAL] OPA CLI        : DISPONIBLE"
    else
      echo "[LOCAL] OPA CLI        : ABSENT"
    fi

    if check_docker; then
      echo "[DOCKER] Démon Engine   : OPÉRATIONNEL"
      cd "$SCRIPT_DIR"
      docker compose -f compose.yml ps
      echo ""
      echo "Points d'accès des services :"
      echo " - Nautobot Web UI & API : http://127.0.0.1:8080 (Token: 0123456789abcdef0123456789abcdef01234567)"
      echo " - Nautobot GraphQL      : http://127.0.0.1:8080/api/graphql/"
      echo " - Batfish Service API   : http://127.0.0.1:9997"
      echo " - OPA Server HTTP       : http://127.0.0.1:8181/v1/data"
    fi
    ;;

  *)
    echo "Usage: $0 {up|down|reset|seed|status}"
    exit 1
    ;;
esac

#!/usr/bin/env bash
# Environnement de test neuf et vierge : Hub de connaissances (LLMOps) + Archinex, en conteneurs, derrière HTTPS.
#
#   ./sandbox.sh up        construit et démarre (crée les secrets au premier lancement)
#   ./sandbox.sh status    état des conteneurs
#   ./sandbox.sh creds     URL et comptes de test
#   ./sandbox.sh smoke     vérifie le Hub, la connexion Archinex → Hub (assertions signées) et un compte
#   ./sandbox.sh logs [service]
#   ./sandbox.sh down      arrête, GARDE les données
#   ./sandbox.sh reset     arrête et EFFACE les données (bases vierges au prochain « up »), garde les secrets et les mots de passe
#   ./sandbox.sh destroy   comme reset, et efface aussi les secrets (.sandbox/)
#
# Réglages (variables d'environnement, tous facultatifs) :
#   SANDBOX_ORIGIN       URL publique, https obligatoire. Défaut https://localhost:8443.
#                        Un domaine public (https://test.exemple.org) obtient un certificat Let's Encrypt et utilise les ports 80/443.
#   LLMOPS_DIR           copie locale du dépôt LLMOps. Défaut : ../LLMOps à côté d'Archinex, sinon clonée dans .sandbox/LLMOps.
#   LLMOPS_REF           branche ou étiquette à cloner (défaut main).
#   ANTHROPIC_API_KEY    clé du modèle, pour les fonctions qui en demandent un (sinon indisponibles).
#
# Vierge = le Hub n'a aucun engagement et une base de gouvernance neuve (sa doctrine versionnée, data/kb, est son contenu de
# référence : elle reste) ; Archinex n'a aucun projet ni espace de travail, seulement 4 comptes de test.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
STATE="$HERE/.sandbox"
ENVFILE="$STATE/env"
COMPOSE=(docker compose -f "$HERE/compose.yml" --env-file "$ENVFILE" --project-directory "$HERE")

die() { echo "sandbox: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "« $1 » est requis."; }

to_native_path() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$p"
  elif (cd "$p" 2>/dev/null && pwd -W 2>/dev/null); then
    (cd "$p" && pwd -W)
  else
    echo "$p"
  fi
}

rand() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "${1:-24}"
  elif command -v node >/dev/null 2>&1; then
    node -e "console.log(require('crypto').randomBytes(${1:-24}).toString('hex'))"
  else
    die "openssl ou node est requis pour générer de l'aléa sécurisé."
  fi
}
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

find_llmops() {
  if [ -n "${LLMOPS_DIR:-}" ]; then to_native_path "$LLMOPS_DIR"; return; fi
  if [ -f "$REPO/../LLMOps/Dockerfile" ]; then
    to_native_path "$REPO/../LLMOps"
    return
  fi
  local dir="$STATE/LLMOps"
  if [ ! -d "$dir/.git" ]; then
    need git
    git clone --depth 1 --branch "${LLMOPS_REF:-main}" https://github.com/MauriceIsrael/LLMOps.git "$dir" >&2
  fi
  to_native_path "$dir"
}

make_env() {
  [ -f "$ENVFILE" ] && return
  mkdir -p "$STATE"; chmod 700 "$STATE"
  local origin="${SANDBOX_ORIGIN:-https://localhost:8443}"
  case "$origin" in https://*) ;; *) die "SANDBOX_ORIGIN doit commencer par https:// (les cookies de session l'exigent).";; esac
  local hostport="${origin#https://}"; hostport="${hostport%%/*}"
  local domain="${hostport%%:*}" https_port=443 http_port=80
  case "$hostport" in *:*) https_port="${hostport##*:}"; http_port=$((https_port - 363));; esac  # 8443 → 8080

  # Clé de signature d'Archinex (Ed25519) et sa partie publique, déclarée au Hub.
  local kid="sandbox-1" key pub x pem
  if command -v node >/dev/null 2>&1; then
    local node_out
    node_out="$(node -e "
const crypto = require('crypto');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: '$kid', use: 'sig' };
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).trim().replace(/\\r?\\n/g, '\\\\n');
console.log(JSON.stringify({ x: jwk.x, pem }));
")"
    x="$(printf '%s' "$node_out" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf-8')).x)")"
    pem="$(printf '%s' "$node_out" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf-8')).pem)")"
  else
    need openssl
    key="$(mktemp)"
    openssl genpkey -algorithm ed25519 -out "$key" 2>/dev/null
    x="$(openssl pkey -in "$key" -pubout -outform DER | tail -c 32 | b64url)"
    pem="$(awk 'NF{printf "%s\\n", $0}' "$key")"
    rm -f "$key"
  fi

  local p_admin p_arch p_sec p_ciso
  if [ "$domain" = "localhost" ] || [ "${SANDBOX_SIMPLE_PASSWORDS:-0}" = "1" ]; then
    p_admin="admin123"; p_arch="architect123"; p_sec="security123"; p_ciso="ciso123"
  else
    p_admin="$(rand 9)"; p_arch="$(rand 9)"; p_sec="$(rand 9)"; p_ciso="$(rand 9)"
  fi

  local users
  users=$(cat <<JSON
[{"key":"admin","name":"Administrateur (test)","email":"admin@sandbox.test","password":"$p_admin","role":"admin","kbHandle":"@maintainers","kbRoles":["kb:admin","kb:review","kb:evaluate","kb:maintain"]},
{"key":"architect","name":"Architecte (test)","email":"architect@sandbox.test","password":"$p_arch","role":"user","kbHandle":"@core-owner-architecture","kbRoles":["kb:review"],"ownedDomains":["architecture"]},
{"key":"security","name":"Sécurité (test)","email":"security@sandbox.test","password":"$p_sec","role":"user","kbHandle":"@security-compliance-team","kbRoles":["kb:review"],"ownedDomains":["security-governance"]},
{"key":"ciso","name":"RSSI (test)","email":"ciso@sandbox.test","password":"$p_ciso","role":"user","kbHandle":"@ciso-office","kbRoles":["kb:evaluate"]}]
JSON
)
  users="$(printf '%s' "$users" | tr -d '\n')"
  {
    echo "# Secrets du bac à sable : ne pas committer, ne pas partager."
    echo "SANDBOX_ORIGIN='$origin'"
    echo "SANDBOX_DOMAIN='$domain'"
    echo "SANDBOX_HTTPS_PORT='$https_port'"
    echo "SANDBOX_HTTP_PORT='$http_port'"
    echo "SERVICE_TOKEN='$(rand)'"
    echo "DEMO_TOKEN='$(rand)'"
    echo "JWT_SECRET='$(rand 32)'"
    echo "ARCHINEX_ACTOR_KID='$kid'"
    echo "ARCHINEX_ACTOR_PRIVATE_KEY='$pem'"
    echo "ARCHINEX_JWKS='{\"keys\":[{\"kty\":\"OKP\",\"crv\":\"Ed25519\",\"x\":\"$x\",\"kid\":\"$kid\",\"use\":\"sig\"}]}'"
    echo "SANDBOX_HUB_PERSONAS='@maintainers=admin@sandbox.test,@core-owner-architecture=architect@sandbox.test,@security-compliance-team=security@sandbox.test,@ciso-office=ciso@sandbox.test'"
    echo "SANDBOX_ARCHINEX_USERS='$users'"
  } > "$ENVFILE"
  chmod 600 "$ENVFILE"
}

load_env() { [ -f "$ENVFILE" ] || die "pas d'environnement : lancez d'abord « ./sandbox.sh up »."; set -a; . "$ENVFILE"; set +a; }

py_or_node() {
  if command -v python3 >/dev/null 2>&1; then echo "python3"; return; fi
  if command -v python >/dev/null 2>&1; then echo "python"; return; fi
  if command -v node >/dev/null 2>&1; then echo "node"; return; fi
  die "python3, python ou node est requis."
}

creds() {
  load_env
  echo "URL Archinex : $SANDBOX_ORIGIN"
  [ "$SANDBOX_DOMAIN" = localhost ] && echo "  (certificat local : le navigateur avertit, c'est attendu ; sur un domaine public, le certificat est valide)"
  echo "Hub (curl, depuis cette machine seulement) : http://127.0.0.1:${HUB_LOCAL_PORT:-8000}   jeton de service : $SERVICE_TOKEN"
  echo "Comptes de test (e-mail / mot de passe) :"
  local runner; runner="$(py_or_node)"
  if [ "$runner" = "node" ]; then
    printf '%s' "$SANDBOX_ARCHINEX_USERS" | node -e '
const users = JSON.parse(require("fs").readFileSync(0, "utf-8"));
users.forEach(u => console.log("  " + u.email.padEnd(24) + " " + u.password.padEnd(20) + " " + u.name + (u.kbHandle ? "  [" + u.kbHandle + "]" : "")));'
  else
    printf '%s' "$SANDBOX_ARCHINEX_USERS" | "$runner" -c "
import json, sys
for u in json.load(sys.stdin):
    print('  %-24s %-20s %s  [%s]' % (u['email'], u['password'], u['name'], u.get('kbHandle', '')))"
  fi
  echo "Auteur / relecteur : « architect » et « security » ne peuvent pas relire leurs propres candidats (séparation des tâches)."
}

smoke() {
  load_env
  local ok=1 out
  out="$("${COMPOSE[@]}" exec -T hub curl -fsS http://localhost:8000/ready)" && echo "Hub prêt : $out" || { echo "Hub : NON prêt"; ok=0; }
  # Mode strict : l'en-tête brut doit être refusé (401 signed_actor_required).
  code="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SERVICE_TOKEN" -H 'X-Actor-Email: admin@sandbox.test' "http://127.0.0.1:${HUB_LOCAL_PORT:-8000}/api/knowledge/me")"
  [ "$code" = 401 ] && echo "Hub : en-tête brut refusé (401) — mode strict actif" || { echo "Hub : en-tête brut → $code (attendu 401)"; ok=0; }
  # Archinex : connexion de l'administrateur de test.
  local pw runner; runner="$(py_or_node)"
  if [ "$runner" = "node" ]; then
    pw="$(printf '%s' "$SANDBOX_ARCHINEX_USERS" | node -e 'console.log(JSON.parse(require("fs").readFileSync(0, "utf-8")).find(u => u.key === "admin").password)')"
  else
    pw="$(printf '%s' "$SANDBOX_ARCHINEX_USERS" | "$runner" -c 'import json,sys; print(next(u["password"] for u in json.load(sys.stdin) if u["key"]=="admin"))')"
  fi
  code="$(curl -sk -o /dev/null -w '%{http_code}' -H "Origin: $SANDBOX_ORIGIN" -H 'Content-Type: application/json' \
    --resolve "${SANDBOX_DOMAIN}:${SANDBOX_HTTPS_PORT}:127.0.0.1" -d "{\"email\":\"admin@sandbox.test\",\"password\":\"$pw\"}" "https://${SANDBOX_DOMAIN}:${SANDBOX_HTTPS_PORT}/api/auth/login" 2>/dev/null || true)"
  [ "$code" = 200 ] && echo "Archinex : connexion de l'administrateur de test OK" || { echo "Archinex : connexion → $code (attendu 200)"; ok=0; }
  [ "$ok" = 1 ] && echo "Smoke : OK" || { echo "Smoke : ÉCHEC (voir « ./sandbox.sh logs »)"; return 1; }
}

cmd="${1:-help}"; shift || true
case "$cmd" in
  up)
    need docker; docker compose version >/dev/null 2>&1 || die "« docker compose » (v2) est requis."
    make_env
    export LLMOPS_DIR; LLMOPS_DIR="$(find_llmops)"
    load_env
    "${COMPOSE[@]}" up -d --build --wait
    echo; creds
    ;;
  status) load_env; "${COMPOSE[@]}" ps ;;
  creds) creds ;;
  smoke) smoke ;;
  logs) load_env; "${COMPOSE[@]}" logs --tail=200 -f "$@" ;;
  down) load_env; export LLMOPS_DIR="${LLMOPS_DIR:-.}"; "${COMPOSE[@]}" down ;;
  reset)
    load_env; export LLMOPS_DIR="${LLMOPS_DIR:-.}"
    "${COMPOSE[@]}" down -v
    echo "Données effacées. « ./sandbox.sh up » repart de bases vierges (mêmes comptes et mots de passe)."
    ;;
  destroy)
    if [ -f "$ENVFILE" ]; then load_env; export LLMOPS_DIR="${LLMOPS_DIR:-.}"; "${COMPOSE[@]}" down -v --rmi local || true; fi
    rm -rf "$STATE"
    echo "Tout est supprimé (conteneurs, volumes, secrets)."
    ;;
  *) sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//' ;;
esac

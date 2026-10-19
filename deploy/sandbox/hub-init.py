"""Prépare le registre des experts du Hub du bac à sable, puis rend la main au serveur.

Le registre versionné (data/kb/owners.yaml) porte des adresses de l'auteur : elles sont toutes effacées, et seules les
personnes de test de SANDBOX_HUB_PERSONAS (« @handle=adresse,@handle=adresse ») sont enregistrées. Une adresse identifie UN seul
propriétaire. Exécuté à chaque démarrage du conteneur, donc idempotent.
"""

import os
import sys

import yaml

PATH = os.environ.get("SANDBOX_OWNERS_FILE", "/app/data/kb/owners.yaml")

personas = {}
for item in filter(None, os.environ.get("SANDBOX_HUB_PERSONAS", "").split(",")):
    handle, _, email = item.partition("=")
    if not handle.startswith("@") or "@" not in email:
        sys.exit(f"SANDBOX_HUB_PERSONAS invalide : {item!r}")
    personas[handle] = email

with open(PATH, encoding="utf-8") as f:
    registry = yaml.safe_load(f)

for handle, entry in registry["owners"].items():
    entry["email"] = personas.get(handle)
unknown = sorted(set(personas) - set(registry["owners"]))
if unknown:
    sys.exit(f"propriétaires inconnus du registre : {unknown}")

with open(PATH, "w", encoding="utf-8") as f:
    yaml.safe_dump(registry, f, sort_keys=False, allow_unicode=True)
print(f"[sandbox] registre des experts : {len(personas)} personne(s) de test", flush=True)

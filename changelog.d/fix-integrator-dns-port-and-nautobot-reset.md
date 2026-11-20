### Corrigé
- **Port DNS hôte Technitium (`deploy/integrator-tools/compose.yml`)** : déplacement du port hôte `5353` (réservé par mDNS sous Windows) vers `15353` (UDP et TCP).
- **Port hôte `sushy-emulator` (`deploy/integrator-tools/compose.yml`, `.github/workflows/twin-ci.yml`)** : déplacement du port hôte `8000` (qui entrait en conflit avec le Knowledge Hub LLMOps sur `http://127.0.0.1:8000`) vers `8001` (`127.0.0.1:8001:8000`).

### Ajouté
- **Commande `reset-nautobot` (`deploy/integrator-tools/tools.ps1`, `tools.sh`)** : réinitialise uniquement la base PostgreSQL de Nautobot (`nautobot-db-data`) et relance les migrations avec le superuser/token par défaut pour obtenir une base vierge prête à ré-hydrater sans toucher aux autres conteneurs.

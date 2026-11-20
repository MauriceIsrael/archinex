### Corrigé
- **Port DNS hôte Technitium (`deploy/integrator-tools/compose.yml`)** : déplacement du port hôte `5353` (réservé par mDNS sous Windows) vers `15353` (UDP et TCP).

### Ajouté
- **Commande `reset-nautobot` (`deploy/integrator-tools/tools.ps1`, `tools.sh`)** : réinitialise uniquement la base PostgreSQL de Nautobot (`nautobot-db-data`) et relance les migrations avec le superuser/token par défaut pour obtenir une base vierge prête à ré-hydrater sans toucher aux autres conteneurs.

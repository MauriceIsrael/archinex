/**
 * Marqueurs d'automatisation d'une exigence (français et anglais).
 *
 * Pourquoi : « le système crée / corrige / bascule automatiquement » n'est jamais qu'une fonction standard d'outillage. Le niveau
 * d'intervention humaine dans la boucle d'exploitation est un choix d'architecture et de responsabilité, surtout en contexte régalien
 * ou de sécurité publique. Un modèle qui évacue une telle clause comme « commodité » la sort du débat sans que personne ne l'ait lue
 * (jalon J0, REQ-Lot1-216, archinex#132). L'asymétrie des coûts d'erreur le justifie : à qualifier par un humain.
 *
 * C'est une famille de formulations, pas un identifiant ni le vocabulaire d'un dossier. Elle ne remplace pas le jugement du modèle :
 * elle l'empêche seulement d'évacuer seul. Compromis assumé : une clause qui n'est qu'une commodité automatisée (bascule d'alimentation,
 * sauvegarde planifiée) est aussi renvoyée à un humain ; le coût est une qualification en plus, pas une exigence perdue.
 */

const MARKERS: RegExp[] = [
	/\bautomat\w*/i, // automatic(ally), automated, automation, automatique(ment), automatisé(e)(s), automatisation
	/\bclosed[- ]loop\b/i,
	/\bboucle[s]? ferm[ée]e[s]?\b/i,
	/\bself[- ]?(?:heal|remediat|correct|repair)\w*/i,
	/\bauto[- ]?(?:remediat|heal|creat|assign|correct|scal|repair)\w*/i,
	/\bauto-?r[ée]m[ée]diation\b/i,
	/\b(?:without|no)\s+(?:any\s+)?(?:human|manual|operator)\s+(?:intervention|action|approval|validation|involvement)\b/i,
	/\bsans\s+(?:aucune\s+)?(?:intervention|action|validation|approbation)\s+(?:humaine|manuelle|d['’]un\s+op[ée]rateur)\b/i
];

/** Premier marqueur d'automatisation trouvé dans le texte, tel qu'écrit, ou `null`. */
export function findAutomationMarker(text: string): string | null {
	for (const re of MARKERS) {
		const m = re.exec(text);
		if (m) return m[0].trim();
	}
	return null;
}

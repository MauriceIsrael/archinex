/**
 * Séparation des tâches de la gouvernance KB (Hub, contrat 1.37) : l'auteur d'un candidat ne peut pas le relire.
 * Le Hub compare l'auteur à l'identité de l'acteur (identifiant d'expert ou adresse e-mail) ; l'écran de revue
 * fait la même comparaison pour ne pas proposer une action qui sera refusée.
 */
export function isCandidateAuthor(
	author: string | null | undefined,
	actor: { handle?: string | null; email?: string | null }
): boolean {
	const norm = (v: string | null | undefined) => (v ?? '').trim().replace(/^@/, '').toLowerCase();
	const a = norm(author);
	if (a === '') return false;
	return a === norm(actor.handle) || a === norm(actor.email);
}

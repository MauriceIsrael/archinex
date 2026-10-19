import { describe, it, expect } from 'vitest';
import { isCandidateAuthor } from '../../src/lib/domain/candidateAuthorship';

describe('Séparation des tâches (Hub 1.37) : qui est l’auteur d’un candidat', () => {
	const me = { handle: '@sec-lead', email: 'expert@archinex.local' };

	it('reconnaît l’auteur par identifiant d’expert, avec ou sans arobase, sans tenir compte de la casse', () => {
		expect(isCandidateAuthor('@sec-lead', me)).toBe(true);
		expect(isCandidateAuthor('sec-lead', me)).toBe(true);
		expect(isCandidateAuthor('  @SEC-Lead ', me)).toBe(true);
	});

	it('reconnaît l’auteur par adresse e-mail', () => {
		expect(isCandidateAuthor('Expert@Archinex.local', me)).toBe(true);
	});

	it('ne confond pas deux personnes, et un auteur absent ne bloque personne', () => {
		expect(isCandidateAuthor('peer@archinex.local', me)).toBe(false);
		expect(isCandidateAuthor('@peer-reviewer', me)).toBe(false);
		expect(isCandidateAuthor('', me)).toBe(false);
		expect(isCandidateAuthor(undefined, me)).toBe(false);
		expect(isCandidateAuthor('x@y.z', { handle: '', email: '' })).toBe(false);
	});
});

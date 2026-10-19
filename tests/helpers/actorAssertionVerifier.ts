/**
 * Vérification d'une assertion d'acteur signée, du côté d'un faux Hub : même règles et mêmes codes que
 * `mcp_server/core/assertion.py` (LLMOps 1.37) — EdDSA seul, clé connue par `kid`, signature, expiration, émetteur,
 * destinataire, `jti` obligatoire et jamais rejoué.
 */
import { createPublicKey, verify, type KeyObject } from 'node:crypto';

export class AssertionRejected extends Error {
	constructor(
		public code: string,
		public reason: string
	) {
		super(`${code}: ${reason}`);
	}
}

export interface ActorAssertionPolicy {
	/** Clés publiques de confiance, par `kid`. */
	publicKeys: Record<string, KeyObject | string>;
	issuer?: string;
	audience?: string;
	/** Mode strict du Hub : l'en-tête brut `X-Actor-Email` est refusé. */
	strict?: boolean;
	/** `jti` déjà vus (anti-rejeu). */
	seen?: Set<string>;
	/** Horloge, en secondes (tests). */
	nowSeconds?: () => number;
}

const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function decodeAssertion(token: string): { header: any; payload: any; signingInput: string; signature: Buffer } {
	const parts = token.trim().split('.');
	if (parts.length !== 3) throw new AssertionRejected('malformed_token', 'JWT compact attendu : trois segments');
	try {
		return {
			header: JSON.parse(fromB64url(parts[0]).toString('utf8')),
			payload: JSON.parse(fromB64url(parts[1]).toString('utf8')),
			signingInput: `${parts[0]}.${parts[1]}`,
			signature: fromB64url(parts[2])
		};
	} catch {
		throw new AssertionRejected('malformed_token', 'en-tête ou claims illisibles');
	}
}

export function verifyActorAssertion(token: string, policy: ActorAssertionPolicy): Record<string, any> {
	const { header, payload, signingInput, signature } = decodeAssertion(token);
	if (header.alg !== 'EdDSA') throw new AssertionRejected('invalid_algorithm', `algorithme « ${header.alg} » : seul EdDSA est permis`);

	const keys = policy.publicKeys;
	const kid: string | undefined = header.kid;
	const keyList = Object.keys(keys);
	const raw = (kid && keys[kid]) || (keyList.length === 1 ? keys[keyList[0]] : undefined);
	if (!raw) throw new AssertionRejected('unknown_key', `clé « ${kid} » inconnue ou non fiable`);
	const key = typeof raw === 'string' ? createPublicKey(raw) : raw;

	if (!verify(null, Buffer.from(signingInput), key, signature)) {
		throw new AssertionRejected('invalid_signature', 'signature invalide');
	}

	const now = policy.nowSeconds ? policy.nowSeconds() : Math.floor(Date.now() / 1000);
	if (typeof payload.exp !== 'number' || payload.exp <= now) throw new AssertionRejected('token_expired', 'assertion expirée');
	if (typeof payload.nbf === 'number' && payload.nbf > now + 5) throw new AssertionRejected('invalid_signature', 'assertion pas encore valide (nbf)');
	if (payload.iss !== (policy.issuer ?? 'archinex')) throw new AssertionRejected('invalid_issuer', `émetteur « ${payload.iss} » inattendu`);
	if (payload.aud !== (policy.audience ?? 'knowledge-hub')) throw new AssertionRejected('invalid_audience', `destinataire « ${payload.aud} » inattendu`);
	if (!payload.jti) throw new AssertionRejected('missing_jti', 'claim jti obligatoire absent');
	if (!payload.sub) throw new AssertionRejected('invalid_signature', 'claim sub obligatoire absent');

	const seen = (policy.seen ??= new Set());
	if (seen.has(payload.jti)) throw new AssertionRejected('replay_detected', `jti « ${payload.jti} » déjà utilisé`);
	seen.add(payload.jti);
	return payload;
}

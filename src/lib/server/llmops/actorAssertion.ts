/**
 * Assertion d'acteur signée (EdDSA / Ed25519) pour la gouvernance de la KB du Hub (LLMOps#7 livrée en 1.37, LLMOps#144).
 *
 * Avec l'en-tête brut `X-Actor-Email`, tout porteur du jeton de service peut se faire passer pour n'importe quel expert.
 * Une assertion prouve que l'appel vient du détenteur de la clé privée d'Archinex : le Hub la vérifie contre la clé publique
 * déclarée (JWKS), refuse le rejeu (`jti` unique) et peut la révoquer.
 *
 * Format attendu par le Hub (`mcp_server/core/assertion.py`) : JWT compact, en-tête `{alg: EdDSA, typ: JWT, kid}`, claims
 * `iss` (« archinex »), `aud` (« knowledge-hub »), `sub`, `email`, `iat`, `nbf`, `exp`, `jti`. Les rôles viennent du registre
 * d'experts du Hub (union avec l'éventuel claim `roles`) : Archinex n'accorde aucun droit par cette assertion.
 *
 * Réglages (environnement) :
 * - `ARCHINEX_ACTOR_PRIVATE_KEY` : clé privée Ed25519 au format PEM PKCS#8 (les `\n` littéraux sont acceptés) ;
 * - `ARCHINEX_ACTOR_KID` : identifiant de la clé (défaut `archinex-1`), le même que dans le JWKS déclaré au Hub ;
 * - `ARCHINEX_ISSUER` / `ARCHINEX_AUDIENCE` : défauts `archinex` / `knowledge-hub`, comme côté Hub ;
 * - `ARCHINEX_ACTOR_TTL_SECONDS` : durée de vie, 60 s par défaut, 300 s au plus ;
 * - `LLMOPS_ACTOR_AUTH` : `auto` (défaut : assertion si une clé est configurée, sinon en-tête brut), `assertion` (clé exigée,
 *   jamais d'en-tête brut) ou `header` (en-tête brut seulement : serveur de contrat, tests).
 */
import { createPrivateKey, randomUUID, sign, type KeyObject } from 'node:crypto';

export type ActorAuthMode = 'auto' | 'assertion' | 'header';

type Env = Record<string, string | undefined>;

export class ActorAssertionConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ActorAssertionConfigError';
	}
}

const DEFAULT_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 300;

const b64url = (input: Buffer | string): string =>
	Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export function actorAuthMode(env: Env = process.env): ActorAuthMode {
	const raw = (env.LLMOPS_ACTOR_AUTH ?? 'auto').trim().toLowerCase();
	if (raw === 'assertion' || raw === 'header' || raw === 'auto') return raw;
	throw new ActorAssertionConfigError(`LLMOPS_ACTOR_AUTH vaut « ${raw} » : valeurs permises auto, assertion, header.`);
}

function loadPrivateKey(env: Env): KeyObject | null {
	const pem = env.ARCHINEX_ACTOR_PRIVATE_KEY?.trim();
	if (!pem) return null;
	let key: KeyObject;
	try {
		key = createPrivateKey(pem.replace(/\\n/g, '\n'));
	} catch {
		throw new ActorAssertionConfigError(
			'ARCHINEX_ACTOR_PRIVATE_KEY n’est pas une clé privée PEM lisible (PKCS#8 attendu). `node scripts/gen-actor-key.mjs` en produit une.'
		);
	}
	if (key.asymmetricKeyType !== 'ed25519') {
		throw new ActorAssertionConfigError(
			`ARCHINEX_ACTOR_PRIVATE_KEY est une clé ${key.asymmetricKeyType} : le Hub n’accepte que Ed25519 (EdDSA).`
		);
	}
	return key;
}

export interface ActorClaims {
	email: string;
	/** Facultatif : le Hub retrouve le handle dans son registre d'experts. */
	handle?: string;
}

/**
 * Assertion signée pour l'acteur, ou `null` si aucune clé n'est configurée (mode `auto`).
 * Chaque appel produit un `jti` neuf : le Hub refuse le rejeu d'une assertion, il en faut une par requête.
 */
export function signActorAssertion(
	actor: ActorClaims,
	options: { env?: Env; nowSeconds?: number } = {}
): string | null {
	const env = options.env ?? process.env;
	const key = loadPrivateKey(env);
	if (!key) return null;

	const email = actor.email.trim();
	if (!email) throw new ActorAssertionConfigError('Une assertion d’acteur exige une adresse e-mail.');

	const ttl = Math.min(
		Math.max(1, Number(env.ARCHINEX_ACTOR_TTL_SECONDS) || DEFAULT_TTL_SECONDS),
		MAX_TTL_SECONDS
	);
	const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
	const header = { alg: 'EdDSA', typ: 'JWT', kid: (env.ARCHINEX_ACTOR_KID ?? 'archinex-1').trim() || 'archinex-1' };
	const payload: Record<string, unknown> = {
		iss: (env.ARCHINEX_ISSUER ?? 'archinex').trim() || 'archinex',
		aud: (env.ARCHINEX_AUDIENCE ?? 'knowledge-hub').trim() || 'knowledge-hub',
		sub: email,
		email,
		iat: now,
		nbf: now,
		exp: now + ttl,
		jti: randomUUID()
	};
	if (actor.handle?.trim()) payload.handle = actor.handle.trim();

	const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
	const signature = sign(null, Buffer.from(signingInput), key);
	return `${signingInput}.${b64url(signature)}`;
}

/**
 * En-tête d'identité à joindre à une requête pour cet acteur : l'assertion (`X-Actor-Token`) ou, selon le mode,
 * l'en-tête brut (`X-Actor-Email`). En mode `assertion`, l'absence de clé est une erreur de configuration : jamais de repli
 * silencieux vers l'en-tête brut, que le Hub peut refuser.
 */
export function actorIdentityHeaders(actorEmail: string, env: Env = process.env): Record<string, string> {
	const mode = actorAuthMode(env);
	if (mode === 'header') return { 'X-Actor-Email': actorEmail };

	const assertion = signActorAssertion({ email: actorEmail }, { env });
	if (assertion) return { 'X-Actor-Token': assertion };

	if (mode === 'assertion') {
		throw new ActorAssertionConfigError(
			'LLMOPS_ACTOR_AUTH=assertion mais ARCHINEX_ACTOR_PRIVATE_KEY est absente : impossible d’authentifier l’expert auprès du Hub.'
		);
	}
	return { 'X-Actor-Email': actorEmail };
}

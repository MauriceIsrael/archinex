import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import {
	actorAuthMode,
	actorIdentityHeaders,
	signActorAssertion,
	ActorAssertionConfigError
} from '../../src/lib/server/llmops/actorAssertion';
import { decodeAssertion, verifyActorAssertion, AssertionRejected } from '../helpers/actorAssertionVerifier';
import { LLMOpsClient } from '../../src/lib/server/llmops/client';
import { startFakeLlmopsServer, type FakeLlmopsServer } from '../helpers/fakeLlmops';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const other = generateKeyPairSync('ed25519');
const pem = (k: KeyObject) => k.export({ type: 'pkcs8', format: 'pem' }).toString();
const ENV = { ARCHINEX_ACTOR_PRIVATE_KEY: pem(privateKey), ARCHINEX_ACTOR_KID: 'archinex-test' };
const policy = () => ({ publicKeys: { 'archinex-test': publicKey }, seen: new Set<string>() });

describe('Assertion d’acteur signée (LLMOps#144) — émission côté Archinex', () => {
	it('produit un JWT EdDSA que le vérificateur du Hub accepte, avec les claims attendus', () => {
		const now = Math.floor(Date.now() / 1000);
		const token = signActorAssertion({ email: 'alice@example.org' }, { env: ENV, nowSeconds: now })!;
		const { header, payload } = decodeAssertion(token);
		expect(header).toEqual({ alg: 'EdDSA', typ: 'JWT', kid: 'archinex-test' });
		expect(payload).toMatchObject({
			iss: 'archinex',
			aud: 'knowledge-hub',
			sub: 'alice@example.org',
			email: 'alice@example.org',
			iat: now,
			nbf: now,
			exp: now + 60
		});
		expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
		expect(verifyActorAssertion(token, policy()).email).toBe('alice@example.org');
	});

	it('un jti neuf par assertion : le Hub refuse le rejeu', () => {
		const a = signActorAssertion({ email: 'a@x.org' }, { env: ENV })!;
		const b = signActorAssertion({ email: 'a@x.org' }, { env: ENV })!;
		expect(decodeAssertion(a).payload.jti).not.toBe(decodeAssertion(b).payload.jti);
		const p = policy();
		verifyActorAssertion(a, p);
		expect(() => verifyActorAssertion(a, p)).toThrowError(/replay_detected/);
		expect(verifyActorAssertion(b, p).email).toBe('a@x.org');
	});

	it('la durée de vie est bornée entre 1 s et 300 s, et 60 s par défaut', () => {
		const now = 1_000_000;
		const long = signActorAssertion({ email: 'a@x.org' }, { env: { ...ENV, ARCHINEX_ACTOR_TTL_SECONDS: '86400' }, nowSeconds: now })!;
		expect(decodeAssertion(long).payload.exp).toBe(now + 300);
		const short = signActorAssertion({ email: 'a@x.org' }, { env: { ...ENV, ARCHINEX_ACTOR_TTL_SECONDS: '-5' }, nowSeconds: now })!;
		expect(decodeAssertion(short).payload.exp).toBe(now + 1);
		const unreadable = signActorAssertion({ email: 'a@x.org' }, { env: { ...ENV, ARCHINEX_ACTOR_TTL_SECONDS: 'abc' }, nowSeconds: now })!;
		expect(decodeAssertion(unreadable).payload.exp).toBe(now + 60);
	});

	it('refuse ce que le Hub refuserait : mauvaise clé, signature altérée, assertion expirée, mauvais destinataire', () => {
		const now = Math.floor(Date.now() / 1000);
		const token = signActorAssertion({ email: 'a@x.org' }, { env: ENV, nowSeconds: now })!;

		const wrongKey = { publicKeys: { 'archinex-test': other.publicKey } };
		expect(() => verifyActorAssertion(token, wrongKey)).toThrowError(/invalid_signature/);

		const [h, p, s] = token.split('.');
		const forged = `${h}.${Buffer.from(JSON.stringify({ ...decodeAssertion(token).payload, email: 'maint@example.org', sub: 'maint@example.org' })).toString('base64url')}.${s}`;
		expect(() => verifyActorAssertion(forged, policy())).toThrowError(/invalid_signature/);
		expect(p).toBeTruthy();

		expect(() => verifyActorAssertion(token, { ...policy(), nowSeconds: () => now + 61 })).toThrowError(/token_expired/);
		expect(() => verifyActorAssertion(token, { ...policy(), audience: 'autre' })).toThrowError(/invalid_audience/);
		expect(() => verifyActorAssertion(token, { publicKeys: {} })).toThrowError(AssertionRejected);
	});

	it('sans clé configurée : pas d’assertion en mode auto (en-tête brut), erreur nette en mode assertion', () => {
		expect(signActorAssertion({ email: 'a@x.org' }, { env: {} })).toBeNull();
		expect(actorIdentityHeaders('a@x.org', {})).toEqual({ 'X-Actor-Email': 'a@x.org' });
		expect(() => actorIdentityHeaders('a@x.org', { LLMOPS_ACTOR_AUTH: 'assertion' })).toThrowError(ActorAssertionConfigError);
	});

	it('mode assertion : jamais d’en-tête brut ; mode header : jamais d’assertion', () => {
		const h = actorIdentityHeaders('a@x.org', { ...ENV, LLMOPS_ACTOR_AUTH: 'assertion' });
		expect(Object.keys(h)).toEqual(['X-Actor-Token']);
		expect(actorIdentityHeaders('a@x.org', { ...ENV, LLMOPS_ACTOR_AUTH: 'header' })).toEqual({ 'X-Actor-Email': 'a@x.org' });
		expect(Object.keys(actorIdentityHeaders('a@x.org', ENV))).toEqual(['X-Actor-Token']); // auto + clé → assertion
	});

	it('refuse une clé illisible, d’un autre type, ou un mode inconnu, en le disant', () => {
		expect(() => signActorAssertion({ email: 'a@x.org' }, { env: { ARCHINEX_ACTOR_PRIVATE_KEY: 'pas une clé' } })).toThrowError(/PEM/);
		const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
		expect(() => signActorAssertion({ email: 'a@x.org' }, { env: { ARCHINEX_ACTOR_PRIVATE_KEY: pem(rsa) } })).toThrowError(/Ed25519/);
		expect(() => actorAuthMode({ LLMOPS_ACTOR_AUTH: 'magique' })).toThrowError(/auto, assertion, header/);
		expect(() => signActorAssertion({ email: '  ' }, { env: ENV })).toThrowError(/e-mail/);
	});

	it('accepte la clé PEM écrite sur une ligne avec des \\n littéraux (variable d’environnement)', () => {
		const oneLine = pem(privateKey).trim().replace(/\n/g, '\\n');
		const token = signActorAssertion({ email: 'a@x.org' }, { env: { ARCHINEX_ACTOR_PRIVATE_KEY: oneLine, ARCHINEX_ACTOR_KID: 'archinex-test' } })!;
		expect(verifyActorAssertion(token, policy()).email).toBe('a@x.org');
	});
});

describe('Assertion d’acteur signée — le client contre un faux Hub qui vérifie la signature', () => {
	let hub: FakeLlmopsServer;
	const saved: Record<string, string | undefined> = {};
	const setEnv = (e: Record<string, string | undefined>) => {
		for (const [k, v] of Object.entries(e)) {
			saved[k] ??= process.env[k];
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
	};

	beforeAll(async () => {
		hub = await startFakeLlmopsServer();
		hub.state.actorAssertion = { publicKeys: { 'archinex-test': publicKey }, seen: new Set() };
	});
	afterAll(async () => {
		await hub.close();
		for (const [k, v] of Object.entries(saved)) {
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
	});

	const client = () => new LLMOpsClient({ baseUrl: hub.url, authToken: 'test-token', timeoutMs: 3000 });

	it('une revue est authentifiée par assertion, et l’identité vue par le Hub est celle de la session', async () => {
		setEnv({ ...ENV, LLMOPS_ACTOR_AUTH: 'assertion' });
		const res = await client().getReviewInbox('expert@archinex.local');
		expect(res.status).toBe('ok');
	});

	it('en mode strict du Hub, l’en-tête brut est refusé et l’assertion acceptée', async () => {
		hub.state.actorAssertion!.strict = true;
		setEnv({ ...ENV, LLMOPS_ACTOR_AUTH: 'assertion' });
		expect((await client().getReviewInbox('expert@archinex.local')).status).toBe('ok');

		setEnv({ ...ENV, LLMOPS_ACTOR_AUTH: 'header' });
		const raw = await client().getReviewInbox('expert@archinex.local');
		expect(raw.status).not.toBe('ok');
	});

	it('une clé qui n’est pas déclarée au Hub est refusée (le client ne le masque pas en succès)', async () => {
		hub.state.actorAssertion!.strict = false;
		setEnv({ ARCHINEX_ACTOR_PRIVATE_KEY: pem(other.privateKey), ARCHINEX_ACTOR_KID: 'archinex-test', LLMOPS_ACTOR_AUTH: 'assertion' });
		const res = await client().getReviewInbox('expert@archinex.local');
		expect(res.status).not.toBe('ok');
	});
});

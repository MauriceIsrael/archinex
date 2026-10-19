#!/usr/bin/env node
/**
 * Génère la paire de clés Ed25519 d'Archinex pour les assertions d'acteur signées (LLMOps#144).
 *
 *   node scripts/gen-actor-key.mjs [kid]
 *
 * Écrit sur la sortie standard :
 *   - la clé PRIVÉE, à placer dans l'environnement d'Archinex (ARCHINEX_ACTOR_PRIVATE_KEY), jamais dans le dépôt ni dans le Hub ;
 *   - le JWKS PUBLIC, à déclarer au Hub (ARCHINEX_JWKS ou le fichier ARCHINEX_JWKS_FILE, selon son déploiement).
 */
import { generateKeyPairSync } from 'node:crypto';

const kid = process.argv[2] || 'archinex-1';
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().trim();
const jwk = { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig' };

console.log('# Côté Archinex (secret) :');
console.log(`ARCHINEX_ACTOR_KID=${kid}`);
console.log(`ARCHINEX_ACTOR_PRIVATE_KEY="${pem.replace(/\n/g, '\\n')}"`);
console.log('');
console.log('# Côté Hub (public) : JWKS à déclarer');
console.log(JSON.stringify({ keys: [jwk] }));

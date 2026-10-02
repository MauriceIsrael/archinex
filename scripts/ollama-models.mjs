#!/usr/bin/env node
/**
 * Inventaire d'un serveur Ollama pour le choix du modèle d'embeddings d'Archinex.
 *
 *   OLLAMA_URL=http://raptor-nino:11434 node scripts/ollama-models.mjs
 *
 * Fonctionne avec l'API native Ollama (/api/tags, /api/embed) ou, à défaut, avec l'API compatible OpenAI
 * (/v1/models, /v1/embeddings) ; l'URL peut se terminer par /v1.
 *
 * Liste les modèles installés (nom, taille, empreinte), signale ceux capables de produire des embeddings, puis, pour
 * chacun d'eux, mesure un test de bon sens FR/EN : la similarité cosinus d'une paire de traductions doit dépasser
 * celle d'une paire de sujets voisins mais différents. Ce n'est PAS la calibration des seuils (voir l'écran
 * /kb/evals, issue A14) : c'est seulement un filtre pour écarter un modèle monolingue.
 */
const base = (process.env.OLLAMA_URL || process.env.EMBEDDING_OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '').replace(/\/v1$/, '');

const PAIRS = {
  translation: [
    'Les remédiations automatiques doivent être approuvées par un humain avant exécution.',
    'Automated remediation must be approved by a human before it runs.'
  ],
  neighbour: [
    'Les remédiations automatiques doivent être approuvées par un humain avant exécution.',
    'Les sauvegardes de configuration doivent être chiffrées et conservées trente jours.'
  ]
};
const NAME_HINT = /embed|bge|e5|minilm|mxbai|gte|nomic|arctic|jina/i;

async function get(path, init) {
  const res = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}
const cosine = (a, b) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return d / (Math.sqrt(na) * Math.sqrt(nb));
};
let mode = 'ollama';
const embed = async (model, input) => {
  const body = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, input }) };
  return mode === 'ollama' ? (await get('/api/embed', body)).embeddings[0] : (await get('/v1/embeddings', body)).data[0].embedding;
};

let models;
try {
  models = (await get('/api/tags')).models ?? [];
} catch {
  try {
    mode = 'openai';
    models = ((await get('/v1/models')).data ?? []).map((m) => ({ name: m.id, size: 0, digest: `created=${m.created ?? '?'}` }));
  } catch (e) {
    console.error(`Serveur de modèles injoignable (${base}) : ${e.message}`);
    process.exit(2);
  }
}
console.log(`${base} (API ${mode === 'ollama' ? 'native Ollama' : 'compatible OpenAI'}) — ${models.length} modèle(s)\n`);
console.log('NOM'.padEnd(36), 'TAILLE'.padEnd(10), 'EMBEDDINGS', 'EMPREINTE');
const embedders = [];
for (const m of models) {
  let capable = NAME_HINT.test(m.name);
  try {
    if (mode !== 'ollama') throw new Error('pas de /api/show');
    const info = await get('/api/show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m.name }) });
    if (Array.isArray(info.capabilities)) capable = info.capabilities.includes('embedding');
  } catch { /* anciennes versions : on garde l'heuristique sur le nom */ }
  if (capable) embedders.push(m.name);
  console.log(m.name.padEnd(36), (m.size ? `${(m.size / 1e9).toFixed(1)} Go` : '?').padEnd(10), (capable ? 'oui' : 'non').padEnd(10), String(m.digest).slice(0, 19));
}

if (embedders.length === 0) {
  console.log('\nAucun modèle d\'embeddings installé. Candidats multilingues FR/EN : `ollama pull bge-m3` ou `ollama pull nomic-embed-text` (anglais surtout).');
  process.exit(0);
}
console.log('\nTest de bon sens FR/EN (cosinus) : la traduction doit être nettement plus proche que le sujet voisin.');
for (const model of embedders) {
  try {
    const [t1, t2] = await Promise.all(PAIRS.translation.map((x) => embed(model, x)));
    const [n1, n2] = await Promise.all(PAIRS.neighbour.map((x) => embed(model, x)));
    const trad = cosine(t1, t2), voisin = cosine(n1, n2);
    console.log(`  ${model.padEnd(30)} dim=${t1.length}  traduction=${trad.toFixed(3)}  voisin=${voisin.toFixed(3)}  écart=${(trad - voisin).toFixed(3)}  ${trad > voisin ? 'OK' : 'ÉCARTÉ (monolingue ?)'}`);
  } catch (e) {
    console.log(`  ${model.padEnd(30)} erreur : ${e.message}`);
  }
}
console.log('\nPour l\'utiliser : EMBEDDING_OLLAMA_URL=' + base + ' EMBEDDING_MODEL=<nom> (voir docs/llmops-integration.md).');

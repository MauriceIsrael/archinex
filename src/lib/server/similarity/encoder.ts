/**
 * Encodeurs d'embeddings d'Archinex (décision D6 : les vecteurs sont calculés ici, LLMOps ne contient aucun modèle).
 *
 * Règle « un modèle = un espace de vecteurs » : le nom envoyé à LLMOps est celui de l'encodeur qui a réellement
 * calculé le vecteur. Un modèle inconnu ou non configuré est REFUSÉ, jamais remplacé en silence par un autre.
 *
 * Configuration (serveur) :
 *  - EMBEDDING_MODEL            modèle par défaut (défaut : `toy-bow`, test uniquement) ;
 *  - EMBEDDING_OLLAMA_URL       URL d'un serveur Ollama (ex. http://localhost:11434) pour tout modèle autre que `toy-bow` ;
 *  - ALLOW_TOY_EMBEDDINGS=1     autorise `toy-bow` hors test/développement (déconseillé : sans valeur sémantique).
 */
import { DEFAULT_SIMILARITY_MODEL, DEFAULT_SIMILARITY_MODEL_VERSION, encodeToyBow } from './embeddings';

export class EncoderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncoderUnavailableError';
  }
}

export interface Encoder {
  /** Identifiant du modèle envoyé à LLMOps. */
  model: string;
  /** Version : empreinte des poids pour Ollama, `1` pour l'encodeur jouet. */
  version(): Promise<string>;
  encode(text: string): Promise<number[]>;
}

export function configuredModel(env: NodeJS.ProcessEnv = process.env): string {
  return (env.EMBEDDING_MODEL || DEFAULT_SIMILARITY_MODEL).trim();
}

export function toyEncoder(): Encoder {
  return {
    model: DEFAULT_SIMILARITY_MODEL,
    version: async () => DEFAULT_SIMILARITY_MODEL_VERSION,
    encode: async (text) => encodeToyBow(text)
  };
}

interface OllamaOptions {
  baseUrl: string;
  model: string;
  timeoutMs?: number;
}

/**
 * Serveur de modèles local : API native Ollama (`/api/tags`, `/api/embed`) ou API compatible OpenAI
 * (`/v1/models`, `/v1/embeddings`, servie aussi par Ollama et par vLLM). Détection automatique, mise en cache.
 *
 * Version déposée : empreinte des poids (`digest`) avec l'API native ; avec l'API compatible OpenAI le serveur
 * n'expose que l'identifiant et la date de création du modèle : un changement de poids sous le même nom n'est alors
 * pas détectable (limite documentée) — recalculer tous les vecteurs après toute mise à jour du modèle.
 */
export function ollamaEncoder({ baseUrl, model, timeoutMs = 60_000 }: OllamaOptions): Encoder {
  const root = baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
  let cachedVersion: string | undefined;
  let mode: 'ollama' | 'openai' | undefined;

  async function call(path: string, init?: RequestInit): Promise<any> {
    let res: Response;
    try {
      res = await fetch(`${root}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e: any) {
      throw new EncoderUnavailableError(`Serveur de modèles injoignable (${root}) : ${e?.message ?? e}`);
    }
    if (!res.ok) {
      throw new EncoderUnavailableError(`${path} a répondu ${res.status} pour le modèle « ${model} »`);
    }
    return res.json();
  }

  const matches = (m: any) => [m.name, m.model, m.id].some((n) => n === model || n === `${model}:latest`);

  async function detect(): Promise<'ollama' | 'openai'> {
    if (mode) return mode;
    try {
      await call('/api/tags');
      return (mode = 'ollama');
    } catch (e) {
      if (!(e instanceof EncoderUnavailableError) || /injoignable/.test(e.message)) throw e;
    }
    await call('/v1/models');
    return (mode = 'openai');
  }

  return {
    model,
    async version() {
      if (cachedVersion) return cachedVersion;
      if ((await detect()) === 'ollama') {
        const found = ((await call('/api/tags')).models ?? []).find(matches);
        if (!found?.digest) throw new EncoderUnavailableError(`Le modèle « ${model} » n'est pas installé sur ${root}`);
        return (cachedVersion = String(found.digest));
      }
      const found = ((await call('/v1/models')).data ?? []).find(matches);
      if (!found) throw new EncoderUnavailableError(`Le modèle « ${model} » n'est pas servi par ${root}`);
      return (cachedVersion = `openai-compat:${found.created ?? 'sans-date'}`);
    },
    async encode(text) {
      const headers = { 'Content-Type': 'application/json' };
      let vector: unknown;
      if ((await detect()) === 'ollama') {
        vector = (await call('/api/embed', { method: 'POST', headers, body: JSON.stringify({ model, input: text }) })).embeddings?.[0];
      } else {
        vector = (await call('/v1/embeddings', { method: 'POST', headers, body: JSON.stringify({ model, input: text }) })).data?.[0]?.embedding;
      }
      if (!Array.isArray(vector) || vector.length === 0 || vector.some((x: unknown) => typeof x !== 'number')) {
        throw new EncoderUnavailableError(`Réponse d'embedding invalide pour le modèle « ${model} »`);
      }
      return vector as number[];
    }
  };
}

export function resolveEncoder(model?: string, env: NodeJS.ProcessEnv = process.env): Encoder {
  const wanted = (model || configuredModel(env)).trim();
  if (wanted === DEFAULT_SIMILARITY_MODEL) {
    const production = env.NODE_ENV === 'production';
    if (production && env.ALLOW_TOY_EMBEDDINGS !== '1') {
      throw new EncoderUnavailableError(
        "L'encodeur jouet « toy-bow » n'a aucune valeur sémantique : configurez EMBEDDING_MODEL et EMBEDDING_OLLAMA_URL " +
          '(ou ALLOW_TOY_EMBEDDINGS=1 pour un usage de démonstration).'
      );
    }
    return toyEncoder();
  }
  const url = env.EMBEDDING_OLLAMA_URL?.trim();
  if (!url) {
    throw new EncoderUnavailableError(
      `Modèle d'embeddings « ${wanted} » non configuré : définissez EMBEDDING_OLLAMA_URL (le modèle n'est jamais remplacé en silence).`
    );
  }
  return ollamaEncoder({ baseUrl: url, model: wanted });
}

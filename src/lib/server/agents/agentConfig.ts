/**
 * Réglages communs aux agents de délibération.
 *
 * Les agents raisonnent (réflexion adaptative) : on leur laisse le temps de répondre, les humains seront de toute
 * façon bien plus longs. Délai réglable par AGENT_TIMEOUT_MS (15 min par défaut).
 */
export const AGENT_TIMEOUT_MS = process.env.NODE_ENV === 'test' ? 300 : Number(process.env.AGENT_TIMEOUT_MS) || 15 * 60_000;

/**
 * Préfixe des contributions de repli (modèle injoignable ou réponse inexploitable) : elles restent utiles comme
 * amorce, mais ne doivent jamais passer pour une analyse réelle du modèle.
 */
export const FALLBACK_PREFIX = "[Repli automatique : le modèle n'a pas répondu] ";

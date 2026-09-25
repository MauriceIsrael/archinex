import { z } from 'zod';
import type {
	ContributionEnvelope,
	EpistemicValidationError,
	Statement,
	StatementTriplet
} from '$lib/types/epistemic';

function rightRotate(value: number, amount: number): number {
	return (value >>> amount) | (value << (32 - amount));
}

/**
 * Implémentation pure-TypeScript universelle de SHA-256 (FIPS 180-2).
 * Compatible SSR Node.js, Cloud Run, et bundles navigateurs (zéro dépendance externe).
 */
export function universalSha256(str: string): string {
	const utf8 = unescape(encodeURIComponent(str));
	const mathPow = Math.pow;
	const maxWord = mathPow(2, 32);
	let i: number, j: number;
	let result = '';
	const words: number[] = [];
	const asciiBitLength = utf8.length * 8;
	let hash: number[] = [];
	const k: number[] = [];
	let primeCounter = 0;
	const isComposite: Record<number, boolean> = {};

	for (let candidate = 2; primeCounter < 64; candidate++) {
		if (!isComposite[candidate]) {
			for (i = 0; i < 313; i += candidate) {
				isComposite[i] = true;
			}
			hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
			k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
		}
	}

	hash = hash.slice(0, 8);
	let ascii = utf8 + '\x80';
	while (ascii.length % 64 - 56) ascii += '\x00';

	for (i = 0; i < ascii.length; i++) {
		j = ascii.charCodeAt(i);
		words[i >> 2] |= j << (((3 - i) % 4) * 8);
	}

	words[words.length] = (asciiBitLength / maxWord) | 0;
	words[words.length] = asciiBitLength;

	for (j = 0; j < words.length; ) {
		const w = words.slice(j, (j += 16));
		const oldHash = hash;
		hash = hash.slice(0, 8);

		for (i = 0; i < 64; i++) {
			const w15 = w[i - 15],
				w2 = w[i - 2];
			const a = hash[0],
				e = hash[4];
			const temp1 =
				hash[7] +
				(rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
				((e & hash[5]) ^ (~e & hash[6])) +
				k[i] +
				(w[i] =
					i < 16
						? w[i]
						: (w[i - 16] +
								(rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
								w[i - 7] +
								(rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
							0);
			const temp2 =
				(rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
				((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

			hash = [(temp1 + temp2) | 0].concat(hash);
			hash[4] = (hash[4] + temp1) | 0;
		}

		for (i = 0; i < 8; i++) {
			hash[i] = (hash[i] + oldHash[i]) | 0;
		}
	}

	for (i = 0; i < 8; i++) {
		for (j = 3; j + 1; j--) {
			const b = (hash[i] >> (j * 8)) & 255;
			result += (b < 16 ? '0' : '') + b.toString(16);
		}
	}

	return result;
}

/**
 * Calcul du SHA-256 canonique d'un triplet pour scellement cryptographique
 */
export function computeTripletSha256(triplet: StatementTriplet): string {
	const canonicalString = JSON.stringify({
		subject: triplet.subject.trim(),
		predicate: triplet.predicate.trim(),
		value: triplet.value,
		unit: triplet.unit ? triplet.unit.trim() : null
	});
	return universalSha256(canonicalString);
}

/**
 * Schéma Zod de validation de l'énoncé et de l'enveloppe
 */
const TripletSchema = z.object({
	subject: z.string().min(1, 'Le sujet est requis'),
	predicate: z.string().min(1, 'Le prédicat est requis'),
	value: z.union([z.string(), z.number(), z.boolean()]),
	unit: z.string().optional()
});

const ValidatorStampSchema = z.object({
	id: z.string().min(1, "L'identifiant du validateur est requis"),
	role: z.string().min(1, 'Le rôle du validateur est requis'),
	timestamp: z.string().datetime({ message: "L'horodatage doit être au format ISO-8601" })
});

export const ContributionEnvelopeSchema = z.object({
	producer: z.object({
		type: z.enum(['human', 'llm']),
		authorId: z.string().min(1),
		model: z.string().optional(),
		provider: z.string().optional(),
		promptSha256: z.string().optional()
	}),
	validator: ValidatorStampSchema.optional(),
	productionMode: z.enum(['human-authored', 'llm-proposed-human-approved', 'llm-derived']),
	payloadSha256: z.string().length(64, 'Le hash SHA-256 doit comporter 64 caractères hexadécimaux'),
	statement: z.object({
		id: z.string().min(1),
		section: z.string().min(1),
		triplet: TripletSchema,
		justification: z.object({
			answersQuestion: z.string().optional(),
			basedOn: z.array(z.string()),
			appliedRule: z.string().optional()
		}),
		authority: z.object({
			author: z.string().min(1),
			role: z.string().min(1),
			productionMode: z.enum(['human-authored', 'llm-proposed-human-approved', 'llm-derived']),
			validator: ValidatorStampSchema.optional()
		}),
		maturity: z.object({
			subjectLevel: z.enum(['L0_named', 'L1_framed', 'L2_decomposed', 'L3_decided', 'L4_specified']),
			confidence: z.enum(['verified', 'designed', 'vendor-stated', 'stated-by-client', 'assumed'])
		}),
		revisability: z.object({
			antecedents: z.array(z.string()),
			dependents: z.array(z.string()).optional(),
			consequencesIfInvalidated: z.string().optional()
		}),
		status: z.enum(['active', 'under_review', 'contested', 'superseded'])
	})
});

export type ValidationResult =
	| { success: true; statement: Statement }
	| { success: false; error: EpistemicValidationError; details: string };

/**
 * Valideur de contrat épistémique pour le portier d'entrée
 */
export function validateInboundEnvelope(envelope: ContributionEnvelope): ValidationResult {
	// 1. Validation de la structure Zod
	const parseResult = ContributionEnvelopeSchema.safeParse(envelope);
	if (!parseResult.success) {
		return {
			success: false,
			error: 'MALFORMED_ENVELOPE',
			details: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
		};
	}

	const data = parseResult.data;

	// 2. Règle Invariant II : Interdiction absolue de verified x llm-derived
	if (data.statement.maturity.confidence === 'verified' && data.productionMode === 'llm-derived') {
		return {
			success: false,
			error: 'INVALID_EPISTEMIC_COMBINATION',
			details:
				'La combinaison confidence="verified" et productionMode="llm-derived" est formellement interdite. Un énoncé sans relecture humaine ne peut être vérifié.'
		};
	}

	// 3. Exigence de validateur pour les modes non humains ou approuvés
	if (data.productionMode === 'llm-proposed-human-approved' && !data.validator) {
		return {
			success: false,
			error: 'VALIDATOR_REQUIRED',
			details:
				'Un énoncé en mode "llm-proposed-human-approved" exige obligatoirement les métadonnées d\'un validateur humain.'
		};
	}

	// 4. Contrôle d'intégrité cryptographique SHA-256
	const expectedSha256 = computeTripletSha256(data.statement.triplet);
	if (data.payloadSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
		return {
			success: false,
			error: 'CHECKSUM_MISMATCH',
			details: `Le condensat SHA-256 calculé (${expectedSha256}) ne correspond pas à payloadSha256 (${data.payloadSha256}).`
		};
	}

	// 5. Normalisation et création du Statement certifié
	const now = new Date().toISOString();
	const statement: Statement = {
		...data.statement,
		authority: {
			...data.statement.authority,
			productionMode: data.productionMode,
			validator: data.validator
		},
		createdAt: now,
		updatedAt: now
	};

	return {
		success: true,
		statement
	};
}

import type { EngagementBundle, BundleCompliance } from './engagementBundle';

export interface OscalComponent {
	uuid: string;
	type: 'software' | 'service' | 'policy' | 'interconnection';
	title: string;
	description: string;
	purpose?: string;
}

export interface OscalByComponent {
	'component-uuid': string;
	'uuid': string;
	'description': string;
	'implementation-status': {
		'state': 'implemented' | 'planned' | 'partially-implemented';
		'remarks'?: string;
	};
}

export interface OscalImplementedRequirement {
	'uuid': string;
	'control-id': string;
	'description': string;
	'status': {
		'state': 'satisfied' | 'not-satisfied' | 'planned' | 'under-review';
		'remarks'?: string;
	};
	'by-components': OscalByComponent[];
	'remarks'?: string;
}

export interface OscalSystemSecurityPlan {
	'system-security-plan': {
		id: string;
		uuid: string;
		metadata: {
			title: string;
			'published': string;
			'last-modified': string;
			version: string;
			'oscal-version': string;
			remarks?: string;
		};
		'system-characteristics': {
			'system-name': string;
			'system-name-short': string;
			'description': string;
			'security-sensitivity-level': string;
			'system-information': {
				'information-types': Array<{
					uuid: string;
					title: string;
					description: string;
					'confidentiality-impact': { base: string };
				}>;
			};
			status: { state: string };
		};
		'system-implementation': {
			components: OscalComponent[];
		};
		'control-implementation': {
			description: string;
			'implemented-requirements': OscalImplementedRequirement[];
		};
	};
}

function generateDeterministicUuid(prefix: string, seed: string): string {
	const hash = Array.from(seed).reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0);
	const hex = Math.abs(hash).toString(16).padStart(8, '0');
	return `${prefix.padEnd(8, '0').slice(0, 8)}-${hex.slice(0, 4)}-4000-8000-${hex.padStart(12, '0').slice(0, 12)}`;
}

/**
 * Exporte la matrice de conformité d'un EngagementBundle au format officiel NIST OSCAL SSP v1.0.0 (A19).
 * Règle d'or : Seul ce qui est 'asserted' est marqué comme 'implemented'.
 * Les propositions IA ou hypothèses sont obligatoirement exportées en 'planned' avec avertissement clair.
 */
export function exportOscalCompliance(bundle: EngagementBundle): OscalSystemSecurityPlan {
	const data = bundle.data;
	const eng = data.engagement;

	const defaultComponentUuid = generateDeterministicUuid('comp0001', eng.id);
	const components: OscalComponent[] = [
		{
			uuid: defaultComponentUuid,
			type: 'software',
			title: 'Plateforme Archinex',
			description: `Socle d architecture pour l engagement ${eng.title}`
		}
	];

	// Ajout des éléments d'architecture comme composants OSCAL
	(data.architecture?.elements || []).forEach((el, idx) => {
		components.push({
			uuid: generateDeterministicUuid(`comp${idx + 2}`, el.id),
			type: el.kind === 'service' ? 'service' : 'software',
			title: el.name,
			description: `Composant d architecture ${el.name} (${el.kind})`
		});
	});

	const implementedRequirements: OscalImplementedRequirement[] = (data.compliance || []).map((c, idx) => {
		const reqUuid = generateDeterministicUuid(`req${idx + 1}`, c.id);
		const byCompUuid = generateDeterministicUuid(`byc${idx + 1}`, c.id);

		const isAsserted = c.assertion_level === 'asserted';
		const isProposed = c.assertion_level === 'proposed';
		const isAssumption = c.assertion_level === 'assumption';

		let state: 'satisfied' | 'not-satisfied' | 'planned' | 'under-review' = 'satisfied';
		let implState: 'implemented' | 'planned' | 'partially-implemented' = 'implemented';
		let remarks = '';

		if (isAsserted) {
			state = 'satisfied';
			implState = 'implemented';
			remarks = `[VALIDÉ] Contrôle affirmé et validé par ${c.provenance.by.join(', ')} (${c.provenance.basis}).`;
		} else if (isProposed) {
			state = 'planned';
			implState = 'planned';
			remarks = '[UNASSERTED PROPOSAL] Proposition IA non confirmée par un validateur humain.';
		} else if (isAssumption) {
			state = 'under-review';
			implState = 'partially-implemented';
			remarks = '[UNVERIFIED ASSUMPTION] Contrôle reposant sur des hypothèses techniques non confirmées.';
		} else {
			state = 'not-satisfied';
			implState = 'planned';
			remarks = `[OPEN] Contrôle au statut ouvert : ${c.epistemic_status}.`;
		}

		return {
			uuid: reqUuid,
			'control-id': c.control_ref || `CTRL-${c.requirement_id}`,
			description: c.implementation_statement || 'Mesure de conformité',
			status: {
				state,
				remarks
			},
			'by-components': [
				{
					'component-uuid': defaultComponentUuid,
					uuid: byCompUuid,
					description: c.implementation_statement,
					'implementation-status': {
						state: implState,
						remarks
					}
				}
			],
			remarks
		};
	});

	return {
		'system-security-plan': {
			id: `oscal-ssp-${eng.id}`,
			uuid: generateDeterministicUuid('ssp00001', eng.id),
			metadata: {
				title: `Matrice de Conformité OSCAL — ${eng.title}`,
				published: bundle.createdAt,
				'last-modified': bundle.createdAt,
				version: bundle.schemaVersion,
				'oscal-version': '1.0.0',
				remarks: `Dossier source ${bundle.snapshotId} (SHA-256: ${bundle.checksum}) - Provisoire: ${data.is_provisional}`
			},
			'system-characteristics': {
				'system-name': eng.title,
				'system-name-short': eng.id,
				description: `Système sous gouvernance Archinex (${eng.client_label})`,
				'security-sensitivity-level': eng.confidentiality,
				'system-information': {
					'information-types': [
						{
							uuid: generateDeterministicUuid('info0001', eng.id),
							title: 'Données d architecture & conformité',
							description: 'Exigences et mesures techniques d architecture',
							'confidentiality-impact': { base: eng.confidentiality }
						}
					]
				},
				status: {
					state: data.is_provisional ? 'draft' : 'operational'
				}
			},
			'system-implementation': {
				components
			},
			'control-implementation': {
				description: 'Matrice de mise en œuvre des exigences et règles doctrinales',
				'implemented-requirements': implementedRequirements
			}
		}
	};
}

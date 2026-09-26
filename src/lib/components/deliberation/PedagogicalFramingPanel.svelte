<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { BookOpen, ArrowRight, Lightbulb } from 'lucide-svelte';

	const activeSubject = $derived(deliberationStore.activeSubject);

	interface StandardBriefing {
		standard: string;
		category: string;
		executiveSummary: string;
		cctpImpact: string;
		keyRequirements: string[];
	}

	const BRIEFINGS: Record<string, StandardBriefing[]> = {
		sub_sync: [
			{
				standard: '3GPP Release 17 / TS 38.300',
				category: 'Télécoms & Radio 5G TDD',
				executiveSummary: 'La 5G New Radio en mode TDD requiert un alignement de phase sub-microseconde (±1.5 µs) entre toutes les stations gNodeB.',
				cctpImpact: 'Un déphasage > 3 µs provoque un brouillage inter-cellulaire direct, coupant les appels d\'urgence et flux prioritaires MCX.',
				keyRequirements: [
					'Synchronisation temporelle absolue avec référence UTC (PRTC-B).',
					'Maintien de phase holdover < 1.5 µs lors de la perte GNSS.',
					'Profil PTP ITU-T G.8275.1 sur chaque nœud intermédiaire.'
				]
			},
			{
				standard: 'Directive NIS2 & Doctrine ANSSI',
				category: 'Cybersécurité & Résilience Réseau Vital',
				executiveSummary: 'Résilience renforcée contre les attaques hybrides et le brouillage GNSS volontaire sur les entités essentielles.',
				cctpImpact: 'Exigence de fonctionnement autonome nominal sans couverture satellite extérieure pendant 30 jours consécutifs.',
				keyRequirements: [
					'Double adduction avec oscillateurs atomiques locaux (Rubidium / OCXO).',
					'Surveillance continue de la dérive d\'horloge et télé-alerte SOC.',
					'Auditabilité et traçabilité formelle du dimensionnement.'
				]
			}
		],
		sub_dc_resilience: [
			{
				standard: 'Uptime Institute Tier Standards & EN 50600',
				category: 'Infrastructure Datacenter',
				executiveSummary: 'Classes de redondance électrique et thermique pour la haute disponibilité.',
				cctpImpact: 'Arbitrage entre Tier III (concurremment maintenable) et Tier IV (tolérant aux pannes).',
				keyRequirements: [
					'Double adduction électrique secourue A/B sans point unique de défaillance (SPOF).',
					'Autonomie groupes électrogènes sur site : 72 heures sous charge continue.',
					'Conformité ICPE (installations classées pour l\'environnement).'
				]
			}
		]
	};

	const currentBriefings = $derived(
		activeSubject && BRIEFINGS[activeSubject.id] ? BRIEFINGS[activeSubject.id] : [
			{
				standard: 'Cadre Général CCTP & Référentiel Technique',
				category: 'Ingénierie Système',
				executiveSummary: `Contraintes contractuelles pour la section ${activeSubject?.section_ref || '§'}.`,
				cctpImpact: 'Clarification préalable des contraintes avant saisie d\'hypothèses.',
				keyRequirements: [
					'Analyse des dépendances d\'interfaces.',
					'Identification des impacts budgétaires.',
					'Respect des principes d\'architecture d\'entreprise (ADR).'
				]
			}
		]
	);

	function switchToDeliberation() {
		deliberationStore.activePosture = 'deliberation';
	}
</script>

<div class="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-xs space-y-4">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-500/20 pb-3">
		<div class="flex items-center gap-2">
			<div class="p-1 rounded-md bg-emerald-600 text-white">
				<BookOpen class="h-4 w-4" />
			</div>
			<div>
				<h3 class="text-sm font-bold tracking-tight text-foreground">
					Référentiel des Normes Applicables · {activeSubject?.section_ref} {activeSubject?.name}
				</h3>
			</div>
		</div>

		<!-- Action vers Délibération -->
		<button
			type="button"
			onclick={switchToDeliberation}
			class="inline-flex items-center gap-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors shrink-0"
		>
			<span>Passer en Délibération</span>
			<ArrowRight class="h-3.5 w-3.5" />
		</button>
	</div>

	<!-- Fiches de Synthèse -->
	<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
		{#each currentBriefings as brief}
			<div class="rounded-lg border border-border/80 bg-card p-3.5 space-y-2.5 shadow-2xs">
				<div class="flex items-start justify-between gap-2">
					<div>
						<span class="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
							{brief.category}
						</span>
						<h4 class="text-xs font-bold text-foreground">
							{brief.standard}
						</h4>
					</div>
				</div>

				<div class="text-xs text-muted-foreground leading-relaxed">
					<strong class="text-foreground">Synthèse :</strong> {brief.executiveSummary}
				</div>

				<div class="rounded bg-muted/60 p-2 text-xs border border-border/50">
					<div class="flex items-start gap-1.5">
						<Lightbulb class="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
						<div>
							<strong class="text-foreground">Impact CCTP :</strong> {brief.cctpImpact}
						</div>
					</div>
				</div>

				<div class="space-y-1 pt-0.5">
					<span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
						Exigences Clés :
					</span>
					<ul class="text-[11px] space-y-0.5 text-muted-foreground list-disc pl-4">
						{#each brief.keyRequirements as req}
							<li>{req}</li>
						{/each}
					</ul>
				</div>
			</div>
		{/each}
	</div>
</div>

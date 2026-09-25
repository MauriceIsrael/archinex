<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { BookOpen, ShieldCheck, HelpCircle, ArrowRight, Lightbulb, FileText, CheckCircle2 } from 'lucide-svelte';

	const activeSubject = $derived(deliberationStore.activeSubject);
	const activeDraft = $derived(deliberationStore.activeDraft);

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
				executiveSummary: 'La 5G New Radio en mode TDD (Time Division Duplex) requiert un alignement de phase sub-microseconde (±1.5 µs) entre toutes les stations de base gNodeB.',
				cctpImpact: 'Tout déphasage supérieur à 3 µs provoque un brouillage inter-cellulaire direct, coupant les appels d\'urgence et les flux prioritaires MCX.',
				keyRequirements: [
					'Synchronisation temporelle absolue avec référence UTC (classe PRTC-B).',
					'Tolérance holdover en cas de perte du signal primaire : maintien de la phase < 1.5 µs sur le temps contractuel.',
					'Conformité stricte au profil PTP ITU-T G.8275.1 sur chaque nœud intermédiaire de transmission.'
				]
			},
			{
				standard: 'Directive NIS2 & Doctrine ANSSI',
				category: 'Cybersécurité & Résilience Réseau Vital',
				executiveSummary: 'Impose une résilience renforcée contre les attaques hybrides et le brouillage GNSS/GPS volontaire sur les entités essentielles.',
				cctpImpact: 'Le client CCTP exige un fonctionnement autonome nominal sans couverture satellite extérieure pendant 30 jours consécutifs.',
				keyRequirements: [
					'Double adduction avec oscillateurs atomiques locaux (Rubidium / OCXO haute performance).',
					'Surveillance continue de la dérive d\'horloge et télé-alerte SOC en cas de désynchronisation.',
					'Auditabilité et scellement formel des choix de dimensionnement d\'infrastructure.'
				]
			}
		],
		sub_dc_resilience: [
			{
				standard: 'Uptime Institute Tier Standards & EN 50600',
				category: 'Infrastructure Datacenter',
				executiveSummary: 'Spécifie les classes de redondance électrique et thermique pour la haute disponibilité opérationnelle.',
				cctpImpact: 'Arbitrage requis entre architecture Tier III (concurremment maintenable) et Tier IV (tolérante aux pannes sans interruption).',
				keyRequirements: [
					'Double adduction électrique secourue A/B sans point unique de défaillance (SPOF).',
					'Autonomie groupes électrogènes sur site : 72 heures sous charge continue avec cuve enterrée.',
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
				executiveSummary: `Appropriation des exigences contractuelles pour la section ${activeSubject?.section_ref || '§'}.`,
				cctpImpact: 'Clarification préalable des contraintes d\'architecture avant saisie d\'hypothèses.',
				keyRequirements: [
					'Analyse des dépendances d\'interfaces.',
					'Identification des impacts budgétaires et dimensionnement matériel.',
					'Respect des principes d\'architecture d\'entreprise (ADR).'
				]
			}
		]
	);

	function switchToDeliberation() {
		deliberationStore.activePosture = 'deliberation';
	}
</script>

<div class="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 shadow-xs space-y-4">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-500/20 pb-4">
		<div>
			<div class="flex items-center gap-2 mb-1">
				<span class="inline-flex items-center gap-1 rounded bg-emerald-600 text-white px-2 py-0.5 text-[11px] font-bold font-mono">
					<BookOpen class="h-3 w-3" />
					POSTURE 1 · APPROPRIATION & PÉDAGOGIE
				</span>
				<span class="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
					Acculturation & Alignement sur les Standards CCTP
				</span>
			</div>
			<h3 class="text-lg font-bold tracking-tight text-foreground">
				Synthèse Pédagogique des Normes · {activeSubject?.section_ref} {activeSubject?.name}
			</h3>
			<p class="text-xs text-muted-foreground mt-0.5">
				Cette phase non-bloquante permet à chaque architecte de s'approprier les règles de l'art à son rythme avant la délibération.
			</p>
		</div>

		<!-- Action de bascule vers Délibération -->
		<button
			type="button"
			onclick={switchToDeliberation}
			class="inline-flex items-center gap-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground px-3.5 py-1.5 text-xs font-bold shadow-xs transition-colors shrink-0"
		>
			<span>Passer en Délibération</span>
			<ArrowRight class="h-3.5 w-3.5" />
		</button>
	</div>

	<!-- Fiches de Synthèse par Standard -->
	<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
		{#each currentBriefings as brief}
			<div class="rounded-lg border border-border/80 bg-card p-4 space-y-3 shadow-xs">
				<div class="flex items-start justify-between gap-2">
					<div>
						<span class="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
							{brief.category}
						</span>
						<h4 class="text-sm font-bold text-foreground">
							{brief.standard}
						</h4>
					</div>
					<span class="rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
						Cadrage Actif
					</span>
				</div>

				<div class="text-xs text-muted-foreground leading-relaxed">
					<strong class="text-foreground">Ce que dit la norme :</strong> {brief.executiveSummary}
				</div>

				<div class="rounded bg-muted/60 p-2.5 text-xs border border-border/50">
					<div class="flex items-start gap-1.5">
						<Lightbulb class="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
						<div>
							<strong class="text-foreground">Impact direct CCTP :</strong> {brief.cctpImpact}
						</div>
					</div>
				</div>

				<div class="space-y-1.5 pt-1">
					<span class="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
						Points Clés d'Attention pour la Délibération :
					</span>
					<ul class="text-xs space-y-1 text-muted-foreground list-disc pl-4">
						{#each brief.keyRequirements as req}
							<li>{req}</li>
						{/each}
					</ul>
				</div>
			</div>
		{/each}
	</div>
</div>

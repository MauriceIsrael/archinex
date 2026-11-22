<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { Criterion, Decision, Option } from '$lib/domain/options';
	import TelegraphicDraftView from '../TelegraphicDraftView.svelte';
	import type { SubjectDoctrineItem } from './types';
	import {
		BookOpen,
		Check,
		CheckCircle2,
		ChevronDown,
		ChevronUp,
		Compass,
		FileText,
		Gavel,
		HelpCircle,
		Lightbulb,
		Scale,
		ShieldAlert,
		Sparkles,
		Split
	} from 'lucide-svelte';

	let {
		subjectId,
		activeSubject = null,
		activeDraft = null,
		subjectDecision = null,
		subjectOptions = [],
		matrixCriteria = [],
		doctrineItems = [],
		citedKbRefs = [],
		relevantDoctrine = [],
		requiredByFramework = [],
		isLoadingDoctrine = false,
		detailedSpecText = $bindable(''),
		onOpenMatrix = () => {},
		onGenerateSpecFromDecision = () => {},
		onSaveDetailedSpec = async () => {},
		onApproveSpecL4 = async () => {}
	}: {
		subjectId: string;
		activeSubject?: any;
		activeDraft?: any;
		subjectDecision?: Decision | null;
		subjectOptions?: Option[];
		matrixCriteria?: Criterion[];
		doctrineItems?: SubjectDoctrineItem[];
		citedKbRefs?: string[];
		relevantDoctrine?: SubjectDoctrineItem[];
		requiredByFramework?: Array<[string, SubjectDoctrineItem[]]>;
		isLoadingDoctrine?: boolean;
		detailedSpecText: string;
		onOpenMatrix?: () => void;
		onGenerateSpecFromDecision?: () => void;
		onSaveDetailedSpec?: () => Promise<unknown> | void;
		onApproveSpecL4?: () => Promise<void> | void;
	} = $props();

	let isDoctrineDrawerOpen = $state(false);
	let showLegacyTelegraphic = $state(false);
	const retainedOpt = $derived(
		subjectOptions.find((o) => o.id === subjectDecision?.retainedOptionId)
	);
</script>

<div class="h-full overflow-y-auto p-4 space-y-4 text-xs" data-testid="unified-doctrines-pane">
	<!-- 1. SPÉCIFICATION HAUT NIVEAU : Décision L3 Opposable (Socle structurant de départ) -->
	{#if subjectDecision}
		<div class="rounded-xl border-2 border-emerald-500/40 bg-gradient-to-r from-emerald-500/15 via-emerald-500/5 to-card p-4 space-y-3 shadow-2xs">
			<div class="flex items-center justify-between flex-wrap gap-2">
				<div class="flex items-center gap-2">
					<div class="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
						<Gavel class="h-4 w-4" />
					</div>
					<div>
						<div class="flex items-center gap-2">
							<span class="text-xs font-bold text-foreground">Spécification Haut Niveau : Décision L3 Opposable</span>
							<span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
								L3 · Décidé
							</span>
						</div>
						<p class="text-[11px] text-muted-foreground mt-0.5">La spécification d'ingénierie détaillée (DLD) ci-dessous découle obligatoirement de cette option retenue.</p>
					</div>
				</div>
				<div class="flex items-center gap-2 flex-wrap">
					<span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
						Option Retenue
					</span>
					<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-muted text-foreground border border-border">
						{subjectDecision.reversibility === 'reversible' ? 'Réversible' : subjectDecision.reversibility === 'costly' ? 'Coûteux' : 'Irréversible'}
					</span>
				</div>
			</div>

			<div class="rounded-lg bg-background/80 border border-border/60 p-3 space-y-1.5">
				<strong class="text-xs font-bold text-foreground block">
					{retainedOpt?.title || subjectDecision.retainedOptionId}
				</strong>
				{#if retainedOpt?.summary}
					<p class="text-muted-foreground text-[11px] leading-relaxed">
						{retainedOpt.summary}
					</p>
				{/if}
				<div class="pt-1.5 border-t border-border/40 text-[11px] text-muted-foreground">
					<strong class="text-foreground">Motivation d'arbitrage (Rationale) :</strong> « {subjectDecision.rationale} »
				</div>
			</div>
		</div>
	{:else}
		<div class="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 flex items-center justify-between gap-3 text-xs">
			<div class="flex items-center gap-2 text-amber-800 dark:text-amber-300">
				<ShieldAlert class="h-4 w-4 shrink-0 text-amber-600" />
				<span>
					<strong>Aucun arbitrage L3 n'est encore acté sur ce sujet.</strong> Vous pouvez préparer une ébauche technique, mais la décision finale doit être prononcée dans la Matrice pour figer le socle.
				</span>
			</div>
			<button
				type="button"
				onclick={onOpenMatrix}
				class="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold shrink-0 cursor-pointer text-[11px]"
			>
				Aller à la Matrice →
			</button>
		</div>
	{/if}

	<div class="rounded-xl border border-indigo-500/25 bg-card/60 overflow-hidden shadow-2xs">
		<button
			type="button"
			data-testid="toggle-doctrine-drawer-btn"
			onclick={() => (isDoctrineDrawerOpen = !isDoctrineDrawerOpen)}
			class="w-full flex items-center justify-between p-3 bg-indigo-500/5 hover:bg-indigo-500/10 transition-colors text-left cursor-pointer"
		>
			<div class="flex items-center gap-2">
				<BookOpen class="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
				<span class="font-bold text-foreground text-xs">
					Doctrines applicables & Règles (#base)
				</span>
				<span class="font-mono text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
					{doctrineItems.length} doctrines · {citedKbRefs.length} citées
				</span>
			</div>
			<div class="flex items-center gap-2 text-[11px] text-muted-foreground">
				<span>{isDoctrineDrawerOpen ? '▲ Masquer la doctrine' : '▼ Déplier la doctrine'}</span>
				{#if isDoctrineDrawerOpen}
					<ChevronUp class="h-4 w-4" />
				{:else}
					<ChevronDown class="h-4 w-4" />
				{/if}
			</div>
		</button>

		{#if isDoctrineDrawerOpen}
			<div class="p-3.5 border-t border-indigo-500/20 space-y-3 bg-background/50 animate-in fade-in duration-150">
				{#if !isLoadingDoctrine && doctrineItems.length === 0}
					<p class="text-muted-foreground italic">Aucune doctrine applicable renvoyée par LLMOps pour ce sujet.</p>
				{/if}

				{#if relevantDoctrine.length}
					<div class="space-y-1.5">
						<p class="text-[11px] font-semibold text-foreground">Doctrines hautement pertinentes pour ce sujet :</p>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
							{#each relevantDoctrine as item (item.id)}
								<div class="rounded-lg border bg-card p-2 space-y-0.5">
									<div class="flex items-center gap-2">
										<span class="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-[10px]">{item.id}</span>
										<span class="text-[9px] text-muted-foreground uppercase">{item.type}</span>
									</div>
									<p class="text-foreground text-[11px] font-medium leading-tight">{item.title}</p>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#each requiredByFramework as [framework, items] (framework)}
					<details class="rounded-lg border bg-muted/20 p-2">
						<summary class="cursor-pointer font-semibold text-[11px]">
							Contrôles {framework} imposés par les référentiels déclarés ({items.length})
						</summary>
						<ul class="mt-2 space-y-1 pl-2">
							{#each items as item (item.id)}
								<li><span class="font-mono font-semibold">{item.id}</span> — {item.title}</li>
							{/each}
						</ul>
					</details>
				{/each}
			</div>
		{/if}
	</div>

	<!-- 3. ATELIER DE SPÉCIFICATION TECHNIQUE DÉTAILLÉE (DLD) -->
	<div class="rounded-xl border bg-card p-4 space-y-4 shadow-2xs">
		<div class="flex items-center justify-between pb-3 border-b flex-wrap gap-2">
			<div class="flex items-center gap-2">
				<FileText class="h-4 w-4 text-primary" />
				<div>
					<h4 class="font-bold text-foreground text-xs">Spécification Technique & Déclinaison d'Ingénierie (DLD)</h4>
					<p class="text-[11px] text-muted-foreground">Formalisation des composants cibles, protocoles, interfaces, matrice de flux et exigences de mise en œuvre.</p>
				</div>
			</div>

			<div class="flex items-center gap-2 flex-wrap">
				{#if subjectDecision}
					<button
						type="button"
						data-testid="bootstrap-spec-ai-btn"
						onclick={onGenerateSpecFromDecision}
						class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
						title="Pré-remplir la spécification technique détaillée à partir de la décision L3"
					>
						<Sparkles class="h-3.5 w-3.5 text-amber-300" />
						<span>✨ Pré-remplir avec l'IA</span>
					</button>
				{/if}

				<button
					type="button"
					data-testid="save-detailed-spec-btn"
					onclick={onSaveDetailedSpec}
					class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-card hover:bg-muted font-semibold text-xs transition-colors cursor-pointer"
				>
					<Check class="h-3.5 w-3.5 text-emerald-600" />
					<span>Enregistrer</span>
				</button>

				<button
					type="button"
					data-testid="validate-l4-spec-btn"
					onclick={onApproveSpecL4}
					class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
					title="Valider la spécification technique et acter le jalon L4"
				>
					<CheckCircle2 class="h-3.5 w-3.5" />
					<span>✅ Homologuer Spécification (L4)</span>
				</button>
			</div>
		</div>

		<!-- RAPPELS STRUCTURANTS : Les 5 Piliers de la Délibération d'Architecture -->
		<div class="rounded-xl border border-border/80 bg-background/60 p-3.5 space-y-3 shadow-2xs">
			<div class="flex items-center justify-between flex-wrap gap-2">
				<div class="flex items-center gap-2">
					<Compass class="h-4 w-4 text-primary" />
					<h5 class="text-xs font-bold text-foreground">
						Fil Directeur : Les 5 Piliers Structurants de la Délibération
					</h5>
				</div>
				<button
					type="button"
					data-testid="toggle-pillars-btn"
					onclick={() => (showLegacyTelegraphic = !showLegacyTelegraphic)}
					class="text-[11px] text-primary hover:underline font-semibold cursor-pointer"
				>
					{showLegacyTelegraphic ? 'Masquer les notes télégraphiques brutes' : 'Consulter les notes télégraphiques brutes (5 colonnes) →'}
				</button>
			</div>

			<p class="text-[11px] text-muted-foreground leading-relaxed">
				Cette spécification détaillée formalise les engagements d'ingénierie qui découlent de l'enchaînement méthodique ci-dessous :
			</p>

			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 pt-1">
				<div class="rounded-lg border border-blue-500/30 bg-blue-500/5 p-2.5 space-y-1">
					<div class="flex items-center gap-1.5 text-blue-700 dark:text-blue-300 font-bold text-[10px] uppercase tracking-wide">
						<HelpCircle class="h-3.5 w-3.5 shrink-0" />
						<span>1. Question (Problème)</span>
					</div>
					<p class="text-[11px] font-semibold text-foreground line-clamp-2" title={activeDraft?.manque?.[0]?.question || activeSubject?.name || "Question d'architecture"}>
						{activeDraft?.manque?.[0]?.question || activeSubject?.name || "Question d'architecture"}
					</p>
					<p class="text-[10px] text-muted-foreground italic">« Quel problème résout-on ? »</p>
				</div>

				<div class="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-2.5 space-y-1">
					<div class="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-bold text-[10px] uppercase tracking-wide">
						<Lightbulb class="h-3.5 w-3.5 shrink-0" />
						<span>2. Cadrage & Hypothèse</span>
					</div>
					<p class="text-[11px] font-semibold text-foreground line-clamp-2" title={activeDraft?.suppose?.[0]?.text || activeSubject?.name || "Hypothèse de cadrage"}>
						{activeDraft?.suppose?.[0]?.text || 'Recommandation initiale de référence'}
					</p>
					<p class="text-[10px] text-muted-foreground italic">« Quelle est la cible initiale ? »</p>
				</div>

				<div class="rounded-lg border border-purple-500/30 bg-purple-500/5 p-2.5 space-y-1">
					<div class="flex items-center justify-between gap-1">
						<div class="flex items-center gap-1.5 text-purple-700 dark:text-purple-300 font-bold text-[10px] uppercase tracking-wide">
							<Split class="h-3.5 w-3.5 shrink-0" />
							<span>3. Options & Variantes</span>
						</div>
						<span class="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-700 font-bold">
							{subjectOptions.length}
						</span>
					</div>
					<p class="text-[11px] font-semibold text-foreground">
						{subjectOptions.length > 0 ? `${subjectOptions.length} alternatives explorées` : 'Alternatives en cours'}
					</p>
					<p class="text-[10px] text-muted-foreground italic">« Quelles alternatives comparées ? »</p>
				</div>

				<div class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-1">
					<div class="flex items-center justify-between gap-1">
						<div class="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-bold text-[10px] uppercase tracking-wide">
							<Scale class="h-3.5 w-3.5 shrink-0" />
							<span>4. Critères & Conformité</span>
						</div>
						<span class="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-700 font-bold">
							{matrixCriteria.length}
						</span>
					</div>
					<p class="text-[11px] font-semibold text-foreground">
						{matrixCriteria.length > 0 ? `${matrixCriteria.length} critères opposables` : 'Grille en cours'}
					</p>
					<p class="text-[10px] text-muted-foreground italic">« Sur quoi juge-t-on le choix ? »</p>
				</div>

				<div class="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 space-y-1 shadow-2xs">
					<div class="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 font-bold text-[10px] uppercase tracking-wide">
						<Gavel class="h-3.5 w-3.5 shrink-0 text-emerald-600" />
						<span>5. Arbitrage L3 Acté</span>
					</div>
					<p class="text-[11px] font-bold text-foreground line-clamp-2" title={retainedOpt?.title || subjectDecision?.retainedOptionId || 'En attente'}>
						{retainedOpt?.title || subjectDecision?.retainedOptionId || 'Arbitrage en attente'}
					</p>
					<p class="text-[10px] text-muted-foreground italic">« Quelle option retenue et pourquoi ? »</p>
				</div>
			</div>

			{#if showLegacyTelegraphic}
				<div class="pt-3 border-t space-y-2 animate-in fade-in duration-150">
					<span class="text-[11px] font-bold text-foreground">Notes télégraphiques brutes :</span>
					<TelegraphicDraftView readOnlyMode={true} />
				</div>
			{/if}
		</div>

		<!-- Éditeur de la Spécification Détaillée -->
		<div class="space-y-2">
			<div class="flex items-center justify-between text-[11px] text-muted-foreground">
				<span class="font-semibold text-foreground">Rédigez ou affinez la spécification d'ingénierie (Markdown supporté) :</span>
				<span class="italic text-[10px]">Persistance automatique locale</span>
			</div>
			<textarea
				data-testid="detailed-spec-textarea"
				bind:value={detailedSpecText}
				oninput={() => deliberationStore.setDetailedSpec(subjectId, detailedSpecText)}
				rows={14}
				placeholder="1. Architecture Cible & Composants :&#10;• Passerelle DEA : ...&#10;• Chiffrement IPsec ESP : ...&#10;&#10;2. Interfaces, Protocoles & Flux :&#10;• Protocoles : IKEv2, AES-256-GCM...&#10;• Ports et liaisons sécurisées : ...&#10;&#10;3. Exploitation & Supervision :&#10;• Intégration NOC et supervision : ...&#10;&#10;4. Points de mise en œuvre résiduels :&#10;• ..."
				class="w-full rounded-lg border bg-background px-3 py-2.5 text-xs text-foreground font-mono leading-relaxed placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary shadow-inner"
			></textarea>
		</div>

		{#if showLegacyTelegraphic}
			<div class="pt-3 border-t space-y-2">
				<span class="text-[11px] font-bold text-foreground">Repères d'affirmation télégraphique :</span>
				<TelegraphicDraftView readOnlyMode={true} />
			</div>
		{/if}
	</div>
</div>

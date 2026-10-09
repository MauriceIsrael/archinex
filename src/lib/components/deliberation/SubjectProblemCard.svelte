<script lang="ts">
	import type { MaturitySubject } from '$lib/domain/maturityBoard';
	import type { TelegraphicDraft } from '$lib/domain/telegraphic';
	import {
		Target,
		Lightbulb,
		AlertTriangle,
		FileText,
		Scissors,
		Sparkles,
		ChevronDown,
		Edit3,
		Check,
		X,
		ArrowDownCircle,
		RotateCcw,
		HelpCircle,
		BookOpen
	} from 'lucide-svelte';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';

	let {
		subject,
		draft = null,
		options = [],
		isInvokingAgent = false,
		onInvokeProposer = () => {},
		onSplit = () => {},
		onUpdateQuestion = (_q: string) => {},
		onUpdateHypothesis = (_h: string) => {},
		onAdoptHypothesis = () => {},
		onSelectOption = (_opt: any) => {},
		onArbitrateOption = (_opt: any) => {},
		isForceEditingQuestion = false
	}: {
		subject: MaturitySubject;
		draft?: TelegraphicDraft | null;
		options?: any[];
		isInvokingAgent?: boolean;
		isForceEditingQuestion?: boolean;
		onInvokeProposer?: () => void;
		onSplit?: () => void;
		onUpdateQuestion?: (newQuestion: string) => void;
		onUpdateHypothesis?: (newHypothesis: string) => void;
		onAdoptHypothesis?: () => void;
		onSelectOption?: (option: any) => void;
		onArbitrateOption?: (option: any) => void;
	} = $props();

	let isExpanded = $state(true);

	// Mode édition de la question
	let isEditingQuestion = $state(false);
	let editedQuestion = $state('');

	$effect(() => {
		if (isForceEditingQuestion) {
			startEditQuestion();
		}
	});

	// Mode édition de l'hypothèse
	let isEditingHypothesis = $state(false);
	let editedHypothesis = $state('');

	const currentQuestion = $derived(
		draft?.manque?.[0]?.question ||
			`Quelle orientation d'architecture retenir pour « ${subject.name} » ?`
	);

	const currentHypothesis = $derived(
		draft?.suppose?.[0]?.text ||
			`Cadrage initial et instruction des exigences pour ${subject.name}`
	);

	const currentConsequence = $derived(
		draft?.suppose?.[0]?.consequence || `Attente d'arbitrage par le rôle ${subject.waiting_for_role}`
	);

	const currentConflict = $derived(draft?.conflit?.[0]?.text || null);
	const rawRetenu = $derived(draft?.retenu || []);

	// Découplage strict : ADRs (décisions d'architecture de référence) vs Clauses réelles du client (RFP / CCTP)
	const adrDecisions = $derived.by(() => {
		const adrs: string[] = [];
		for (const item of rawRetenu) {
			if (/ADR-\d+/i.test(item)) {
				adrs.push(item);
			}
		}
		return adrs;
	});

	const clientClauses = $derived.by(() => {
		// Filtrer tout ce qui mentionne un ADR
		const filtered = rawRetenu.filter(
			(item) => !/ADR-\d+/i.test(item) && !item.toLowerCase().startsWith('adr-')
		);
		if (filtered.length > 0) {
			return filtered;
		}

		// Fallback dynamique si rawRetenu ne contenait que des ADRs ou était vide :
		// Récupérer les vraies exigences issues des documents clients (CCTP / RFP) du projet
		const allClientClauses = deliberationStore.clientDocuments.flatMap((d) => d.keyClauses || []);
		if (allClientClauses.length === 0) return [];

		// 1. Chercher par correspondance avec la section ou le nom du sujet
		const bySection = allClientClauses.filter(
			(c) =>
				c.clauseRef.toLowerCase().includes(subject.section_ref.toLowerCase()) ||
				subject.name.toLowerCase().includes(c.title.toLowerCase())
		);
		if (bySection.length > 0) {
			return bySection.slice(0, 4).map((c) => `[${c.clauseRef}] ${c.title} : ${c.text}`);
		}

		// 2. Chercher par mots-clés significatifs
		const keywords = subject.name
			.toLowerCase()
			.split(/[\s,;:'"()]+/)
			.filter((w) => w.length > 4 && !['pour', 'avec', 'dans', 'plus', 'tous', 'cette'].includes(w));
		if (keywords.length > 0) {
			const byKeyword = allClientClauses.filter((c) =>
				keywords.some((k) => c.title.toLowerCase().includes(k) || c.text.toLowerCase().includes(k))
			);
			if (byKeyword.length > 0) {
				return byKeyword.slice(0, 3).map((c) => `[${c.clauseRef}] ${c.title} : ${c.text}`);
			}
		}

		return [];
	});

	const expertQuestions = $derived.by(() => {
		if (draft?.expertQuestions && draft.expertQuestions.length > 0) {
			return draft.expertQuestions;
		}
		const seedQuestions = (subject as any)?.seed?.expertQuestions;
		if (Array.isArray(seedQuestions) && seedQuestions.length > 0) {
			return seedQuestions;
		}
		return [];
	});

	function startEditQuestion() {
		editedQuestion = currentQuestion;
		isEditingQuestion = true;
	}

	function saveQuestion() {
		if (editedQuestion.trim()) {
			onUpdateQuestion(editedQuestion.trim());
		}
		isEditingQuestion = false;
	}

	function startEditHypothesis() {
		editedHypothesis = currentHypothesis;
		isEditingHypothesis = true;
	}

	function saveHypothesis() {
		if (editedHypothesis.trim()) {
			onUpdateHypothesis(editedHypothesis.trim());
		}
		isEditingHypothesis = false;
	}

	function formatOptionStatus(status?: string): string {
		if (!status) return '';
		switch (status.toLowerCase()) {
			case 'proposed': return 'Proposée';
			case 'identified': return 'À l’étude';
			case 'retained': return 'Retenue';
			case 'rejected': return 'Écartée';
			case 'draft': return 'Brouillon';
			default: return status;
		}
	}

	function scrollToComposer() {
		const composerElem = document.getElementById('compose-claim');
		if (composerElem) {
			composerElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
			composerElem.focus();
		}
	}
</script>

<div
	class="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/5 via-card to-background shadow-xs overflow-hidden transition-all"
	data-testid="subject-problem-card"
>
	<!-- ─── En-tête de la Carte de Cadrage ───────────────────────────────────── -->
	<div class="px-4 py-2.5 bg-primary/10 border-b border-primary/20 flex items-center justify-between gap-3 flex-wrap">
		<div class="flex items-center gap-2">
			<div class="p-1.5 rounded-lg bg-primary text-primary-foreground shadow-2xs">
				<Target class="h-4 w-4" />
			</div>
			<div>
				<div class="flex items-center gap-2">
					<span class="font-bold text-xs text-foreground uppercase tracking-wider">
						Cadrage du Problème & Graine d'Architecture
					</span>
					<span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-background/80 border text-primary">
						{subject.section_ref}
					</span>
					{#if subject.parent_subject_name}
						<span class="text-[10px] text-muted-foreground flex items-center gap-1">
							↳ Issu de : <strong class="text-foreground">{subject.parent_subject_name}</strong>
						</span>
					{/if}
				</div>
			</div>
		</div>

		<div class="flex items-center gap-1.5">
			<!-- Toggle Déplier / Replier -->
			<button
				type="button"
				onclick={() => (isExpanded = !isExpanded)}
				class="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
				aria-label={isExpanded ? 'Replier le cadrage' : 'Déplier le cadrage'}
				title={isExpanded ? 'Replier le cadrage' : 'Déplier le cadrage'}
			>
				<ChevronDown class="h-4 w-4 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}" />
			</button>
		</div>
	</div>

	<!-- ─── Corps de la Carte (Déplié) ──────────────────────────────────────── -->
	{#if isExpanded}
		<div class="p-4 space-y-3.5 text-xs">
			<!-- 1. Question Centrale d'Architecture (Le Problème) -->
			<div class="rounded-xl border bg-background/90 p-3.5 space-y-1.5 shadow-2xs">
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-center gap-1.5 text-[11px] font-bold text-primary uppercase tracking-wider">
						<Target class="h-3.5 w-3.5" />
						<span>Problème d'Architecture à Trancher</span>
					</div>
					{#if !isEditingQuestion}
						<button
							type="button"
							onclick={startEditQuestion}
							class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/60 hover:bg-muted text-xs font-semibold text-foreground cursor-pointer transition-colors border border-border/60 shadow-2xs"
							title="Modifier ou reformuler le problème d'architecture directement in-place"
						>
							<Edit3 class="h-3.5 w-3.5 text-primary" />
							<span>Reformuler (in-place)</span>
						</button>
					{/if}
				</div>

				{#if isEditingQuestion}
					<div class="space-y-2 pt-1">
						<textarea
							bind:value={editedQuestion}
							rows="2"
							class="w-full px-2.5 py-1.5 rounded-lg border bg-background text-foreground text-xs focus:ring-2 focus:ring-primary focus:outline-none resize-none leading-relaxed"
							placeholder="Formulez la question centrale d'architecture..."
						></textarea>
						<div class="flex items-center justify-end gap-1.5">
							<button
								type="button"
								onclick={() => (isEditingQuestion = false)}
								class="px-2.5 py-1 rounded-md border text-[11px] hover:bg-muted cursor-pointer"
							>
								Annuler
							</button>
							<button
								type="button"
								onclick={saveQuestion}
								class="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 cursor-pointer shadow-2xs"
							>
								Enregistrer la reformulation
							</button>
						</div>
					</div>
				{:else}
					<div class="flex items-start justify-between gap-3 group">
						<button
							type="button"
							onclick={startEditQuestion}
							class="text-left text-sm font-semibold text-foreground leading-snug flex-1 cursor-pointer hover:text-primary transition-colors"
							title="Cliquer pour reformuler ce problème directement in-place"
						>
							{currentQuestion}
						</button>
						<button
							type="button"
							onclick={startEditQuestion}
							class="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors shrink-0"
							title="Modifier ou reformuler ce problème (in-place)"
							aria-label="Modifier le problème"
						>
							<Edit3 class="h-3.5 w-3.5 text-primary" />
						</button>
					</div>
				{/if}
			</div>

			<!-- 2. Grille de Cadrage : Hypothèse, Conflit, Clauses RFP -->
			<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
				<!-- Bloc Hypothèse Initiale -->
				<div class="rounded-xl border bg-background/60 p-3 space-y-1.5 flex flex-col">
					<div class="flex items-center justify-between gap-2">
						<div class="flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400">
							<Lightbulb class="h-3.5 w-3.5" />
							<span>Hypothèse pressentie</span>
						</div>
						{#if !isEditingHypothesis}
							<button
								type="button"
								onclick={startEditHypothesis}
								class="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
								title="Modifier l'hypothèse"
							>
								<Edit3 class="h-3 w-3" />
							</button>
						{/if}
					</div>

					{#if isEditingHypothesis}
						<div class="space-y-2 pt-1 flex-1">
							<textarea
								bind:value={editedHypothesis}
								rows="3"
								class="w-full px-2 py-1 rounded-lg border bg-background text-foreground text-[11px] focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none leading-relaxed"
							></textarea>
							<div class="flex items-center justify-end gap-1.5">
								<button
									type="button"
									onclick={() => (isEditingHypothesis = false)}
									class="px-2 py-0.5 rounded border text-[10px] hover:bg-muted cursor-pointer"
								>
									Annuler
								</button>
								<button
									type="button"
									onclick={saveHypothesis}
									class="px-2 py-0.5 rounded bg-blue-600 text-white text-[10px] font-semibold hover:bg-blue-700 cursor-pointer"
								>
									Enregistrer
								</button>
							</div>
						</div>
					{:else}
						<p class="text-xs text-foreground/90 leading-relaxed flex-1">
							{currentHypothesis}
						</p>
						<div class="pt-1.5 flex items-center justify-between gap-1 border-t border-border/40 mt-1 flex-wrap">
							<span class="text-[10px] text-muted-foreground italic truncate max-w-[160px]" title={currentConsequence}>
								{currentConsequence}
							</span>
							<button
								type="button"
								onclick={onAdoptHypothesis}
								class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-semibold transition-colors cursor-pointer shadow-2xs shrink-0"
								title="Valider cette hypothèse comme choix retenu et faire franchir le jalon supérieur"
							>
								<Check class="h-3 w-3" />
								<span>Retenir & Avancer</span>
							</button>
						</div>
					{/if}
				</div>

				<!-- Bloc Dilemme ou Conflit Doctrinal -->
				<div class="rounded-xl border {currentConflict ? 'border-amber-500/30 bg-amber-500/5' : 'bg-background/60'} p-3 space-y-1.5 flex flex-col">
					<div class="flex items-center justify-between gap-1">
						<div class="flex items-center gap-1 text-[11px] font-bold {currentConflict ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}">
							<AlertTriangle class="h-3.5 w-3.5" />
							<span>Dilemme & Arbitrage</span>
						</div>
					</div>

					{#if currentConflict}
						<p class="text-xs text-amber-900 dark:text-amber-200 leading-relaxed flex-1">
							{currentConflict}
						</p>
						<div class="pt-1.5 flex items-center justify-between gap-1 border-t border-amber-500/20 mt-1 flex-wrap">
							<span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">
								⚠️ Nécessite arbitrage formel
							</span>
							<button
								type="button"
								onclick={onSplit}
								class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-semibold transition-colors cursor-pointer shadow-2xs shrink-0"
								title="Découper ce sujet trop vaste ou conflictuel en 2 sous-sujets distincts"
							>
								<Scissors class="h-3 w-3" />
								<span>Scinder en 2</span>
							</button>
						</div>
					{:else}
						<p class="text-xs text-muted-foreground leading-relaxed flex-1">
							Aucun conflit doctrinal bloquant identifié pour l'instant. Le débat permettra de tester la conformité.
						</p>
						<div class="pt-1.5 flex items-center justify-between gap-1 border-t border-border/40 mt-1 flex-wrap">
							<span class="text-[10px] text-muted-foreground">
								Standard : Règles appliquées
							</span>
							<button
								type="button"
								onclick={onSplit}
								class="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border/80 hover:bg-muted text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
								title="Découper ce sujet en 2 sous-sujets distincts"
							>
								<Scissors class="h-3 w-3" />
								<span>Scinder le sujet</span>
							</button>
						</div>
					{/if}
				</div>

				<!-- Bloc Exigences RFP / Clauses Clientes -->
				<div class="rounded-xl border bg-background/60 p-3 space-y-1.5 flex flex-col">
					<div class="flex items-center justify-between gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
						<div class="flex items-center gap-1">
							<FileText class="h-3.5 w-3.5" />
							<span>Exigences Client (RFP)</span>
						</div>
						<span class="text-[10px] font-normal text-muted-foreground">CCTP</span>
					</div>

					{#if clientClauses.length > 0}
						<div class="space-y-1 overflow-y-auto max-h-24 pr-1 flex-1">
							{#each clientClauses as clause}
								<div class="p-1.5 rounded bg-muted/40 border border-border/50 text-[11px] text-foreground leading-tight">
									<span class="text-indigo-600 dark:text-indigo-400 font-bold">§</span> {clause}
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-xs text-muted-foreground leading-relaxed flex-1">
							Cahier des charges initial. Les clauses détaillées sont consultables dans le corpus documentaire.
						</p>
					{/if}
					<div class="text-[10px] font-mono text-muted-foreground border-t pt-1 mt-1 flex justify-between items-center">
						<span>{clientClauses.length} exigence(s) client</span>
						{#if adrDecisions.length > 0}
							<span class="text-blue-600 dark:text-blue-400 font-sans font-semibold">+{adrDecisions.length} ADR</span>
						{/if}
					</div>
				</div>
			</div>

			<!-- 2 bis. Questions au Sachant Métier (Méthodologie ArcKit) -->
			{#if expertQuestions.length > 0}
				<div class="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
					<div class="flex items-center justify-between gap-2">
						<div class="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400">
							<HelpCircle class="h-4 w-4" />
							<span>Questions au Sachant Métier (Prérequis d'Arbitrage)</span>
						</div>
						<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 font-semibold">
							Cadrage ArcKit
						</span>
					</div>
					<p class="text-[11px] text-muted-foreground">
						Ces questions clés doivent être éclairées par le sachant métier ou le donneur d'ordre pour permettre aux architectes de trancher :
					</p>
					<div class="space-y-1.5">
						{#each expertQuestions as q, idx}
							<div class="flex items-start gap-2 p-2 rounded-lg bg-background border border-amber-500/20 text-xs">
								<span class="font-mono font-bold text-amber-600 dark:text-amber-400 shrink-0">Q{idx + 1}.</span>
								<span class="flex-1 font-medium text-foreground">{q}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- 2 ter. Propositions Immédiates & Options à l'Étude -->
			{#if options && options.length > 0}
				<div class="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2 shadow-2xs">
					<div class="flex items-center justify-between gap-2 flex-wrap">
						<div class="flex items-center gap-1.5 text-[11px] font-bold text-primary">
							<Sparkles class="h-3.5 w-3.5" />
							<span>Options & Propositions Immédiates à l'Étude ({options.length})</span>
						</div>
						<span class="text-[10px] text-muted-foreground font-medium">
							À instruire via le fil de discussion ci-dessous
						</span>
					</div>

					<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
						{#each options as opt}
							<div class="p-2.5 rounded-lg border bg-background/90 text-xs space-y-2 shadow-2xs flex flex-col justify-between">
								<div class="space-y-1">
									<div class="flex items-center justify-between gap-1.5">
										<strong class="text-foreground font-semibold truncate">{opt.title}</strong>
										{#if opt.status}
											<span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-muted text-muted-foreground shrink-0 border">
												{formatOptionStatus(opt.status)}
											</span>
										{/if}
									</div>
									{#if opt.summary}
										<p class="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
											{opt.summary}
										</p>
									{/if}
								</div>

								<div class="flex items-center justify-end gap-1.5 pt-1.5 border-t border-border/40">
									<button
										type="button"
										onclick={() => onSelectOption(opt)}
										class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
										title="Débattre de cette option dans le fil"
									>
										<span>💬 Débattre</span>
									</button>
									<button
										type="button"
										onclick={() => onArbitrateOption(opt)}
										class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold text-primary hover:bg-primary/10 transition-colors cursor-pointer"
										title="Retenir ou arbitrer cette option"
									>
										<span>⚖️ Arbitrer</span>
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- 2 bis. Décisions d'Architecture de Référence Mobilisables (ADR du Patrimoine) -->
			{#if adrDecisions.length > 0}
				<div class="rounded-xl border border-blue-500/25 bg-blue-500/5 p-3 space-y-1.5 shadow-2xs">
					<div class="flex items-center justify-between gap-2 flex-wrap">
						<div class="flex items-center gap-1.5 text-[11px] font-bold text-blue-700 dark:text-blue-300">
							<BookOpen class="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
							<span>Décisions d'Architecture de Référence (ADR du Patrimoine)</span>
						</div>
						<span class="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 font-medium">
							Standard interne réutilisable · Non imposé par le client
						</span>
					</div>
					<p class="text-[11px] text-muted-foreground leading-snug">
						Ces décisions d'architecture antérieures (issues du socle d'entreprise ou de projets précédents) sont mobilisables pour répondre aux exigences ci-dessus, mais constituent des choix d'ingénierie et non des contraintes contractuelles client.
					</p>
					<div class="flex flex-wrap gap-1.5 pt-1">
						{#each adrDecisions as adr}
							<div class="px-2.5 py-1 rounded-md bg-background/90 border border-blue-500/30 text-[11px] font-mono text-blue-800 dark:text-blue-200 shadow-2xs flex items-center gap-1.5">
								<span class="text-blue-500 font-bold">🏛️</span>
								<span>{adr}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- 3. Barre d'Actions Rapides pour l'Architecte -->
			<div class="flex items-center justify-between gap-2 pt-1 border-t border-border/40 flex-wrap">
				<div class="flex items-center gap-2 flex-wrap">
					<button
						type="button"
						onclick={onAdoptHypothesis}
						class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-2xs"
						title="Valider l'hypothèse pressentie, l'inscrire au brouillon retenu et franchir le jalon de maturité suivant"
					>
						<Check class="h-3.5 w-3.5" />
						<span>✅ Retenir l'hypothèse & Avancer</span>
					</button>

					<button
						type="button"
						onclick={onInvokeProposer}
						disabled={isInvokingAgent}
						class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
						title="Demander à l'agent IA de poser immédiatement deux options contrastées"
					>
						{#if isInvokingAgent}
							<RotateCcw class="h-3.5 w-3.5 animate-spin" />
							<span>Génération en cours...</span>
						{:else}
							<Sparkles class="h-3.5 w-3.5" />
							<span>💡 Poser 2 options (@proposer)</span>
						{/if}
					</button>
				</div>

				<button
					type="button"
					onclick={scrollToComposer}
					class="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-medium cursor-pointer transition-colors"
				>
					<ArrowDownCircle class="h-3.5 w-3.5 text-primary" />
					<span>Formuler un avis ou une question ci-dessous</span>
				</button>
			</div>
		</div>
	{/if}
</div>

<script lang="ts">
	import type { MaturitySubject } from '$lib/domain/maturityBoard';
	import type { TelegraphicDraft } from '$lib/domain/telegraphic';
	import {
		Target,
		Lightbulb,
		AlertTriangle,
		FileText,
		Scissors,
		ChevronDown,
		Edit3,
		Check,
		HelpCircle,
		BookOpen,
		Scale
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

	// Par défaut : bandeau compact de 2 lignes (dépliable à la demande)
	let isExpanded = $state(false);

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
		const filtered = rawRetenu.filter(
			(item) => !/ADR-\d+/i.test(item) && !item.toLowerCase().startsWith('adr-')
		);
		if (filtered.length > 0) {
			return filtered;
		}

		const allClientClauses = deliberationStore.clientDocuments.flatMap((d) => d.keyClauses || []);
		if (allClientClauses.length === 0) return [];

		const bySection = allClientClauses.filter(
			(c) =>
				c.clauseRef.toLowerCase().includes(subject.section_ref.toLowerCase()) ||
				subject.name.toLowerCase().includes(c.title.toLowerCase())
		);
		if (bySection.length > 0) {
			return bySection.slice(0, 4).map((c) => `[${c.clauseRef}] ${c.title} : ${c.text}`);
		}

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
		isExpanded = true;
	}

	function saveHypothesis() {
		if (editedHypothesis.trim()) {
			onUpdateHypothesis(editedHypothesis.trim());
		}
		isEditingHypothesis = false;
	}

	// Réponse interactive aux questions du sachant métier
	let answeringQuestionIdx = $state<number | null>(null);
	let currentAnswerInput = $state<string>('');

	function startAnswerQuestion(idx: number, existingAnswer?: string) {
		answeringQuestionIdx = idx;
		currentAnswerInput = existingAnswer || '';
	}

	function submitExpertAnswer(q: string, mode: 'hypothesis' | 'retenu' | 'argument') {
		if (!currentAnswerInput.trim()) return;
		deliberationStore.answerExpertQuestion(subject.id, q, currentAnswerInput.trim(), mode);
		answeringQuestionIdx = null;
		currentAnswerInput = '';
	}
</script>

<div
	id="subject-problem-box"
	class="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/5 via-card to-background shadow-2xs overflow-hidden transition-all"
	data-testid="subject-problem-card"
>
	<!-- ─── BANDEAU COMPACT SUR 2 LIGNES (Question + Hypothèse & Pills) ─────── -->
	<div class="p-3 space-y-2 text-xs">
		<!-- Ligne 1 : Badge Cadrage + Question Centrale d'Architecture + Actions rapides -->
		<div class="flex items-start justify-between gap-2 flex-wrap">
			<div class="flex items-start gap-2 flex-1 min-w-0">
				<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary text-primary-foreground font-bold text-[11px] shrink-0 mt-0.5">
					<Target class="h-3 w-3" />
					<span>Cadrage</span>
				</span>

				<div class="flex-1 min-w-0">
					{#if isEditingQuestion}
						<div class="space-y-2">
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
									Enregistrer
								</button>
							</div>
						</div>
					{:else}
						<button
							type="button"
							onclick={startEditQuestion}
							class="text-left text-xs sm:text-sm font-bold text-foreground leading-snug hover:text-primary transition-colors cursor-pointer"
							title="Cliquer pour reformuler la question centrale d'architecture"
						>
							{currentQuestion}
						</button>
					{/if}
				</div>
			</div>

			<div class="flex items-center gap-1.5 shrink-0">
				{#if !isEditingQuestion}
					<button
						type="button"
						onclick={startEditQuestion}
						class="inline-flex items-center gap-1 px-2 py-1 rounded-md border bg-background/80 hover:bg-muted text-[11px] font-semibold text-foreground transition-colors cursor-pointer"
						title="Reformuler le problème in-place"
					>
						<Edit3 class="h-3 w-3 text-primary" />
						<span>Reformuler</span>
					</button>
				{/if}

				<button
					type="button"
					onclick={onSplit}
					class="inline-flex items-center gap-1 px-2 py-1 rounded-md border bg-background/80 hover:bg-muted text-[11px] font-semibold text-foreground transition-colors cursor-pointer"
					title="Découper ce sujet en 2 sous-problèmes distincts"
				>
					<Scissors class="h-3 w-3 text-muted-foreground" />
					<span>Scinder</span>
				</button>

				<button
					type="button"
					data-testid="btn-toggle-framing-details"
					onclick={() => (isExpanded = !isExpanded)}
					class="inline-flex items-center gap-1 px-2 py-1 rounded-md border bg-muted/50 hover:bg-muted text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
					title={isExpanded ? 'Replier les détails du cadrage' : 'Afficher hypothèse détaillée, dilemme, clauses RFP et questions métier'}
				>
					<span>{isExpanded ? 'Réduire' : 'Détails'}</span>
					<ChevronDown class="h-3.5 w-3.5 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}" />
				</button>
			</div>
		</div>

		<!-- Ligne 2 : Pills synthétiques (Hypothèse, Dilemme, Clauses RFP, Questions Métier, Lien Matrice) -->
		<div class="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-border/40">
			<div class="flex items-center gap-1.5 flex-wrap min-w-0">
				<!-- Pill Hypothèse -->
				<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/25 text-blue-900 dark:text-blue-200 max-w-xl">
					<Lightbulb class="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
					<span class="truncate text-[11px]">
						<strong>Hypothèse :</strong> {currentHypothesis}
					</span>
					<button
						type="button"
						onclick={onAdoptHypothesis}
						class="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold transition-colors cursor-pointer shrink-0"
						title="Valider cette hypothèse comme choix retenu et faire progresser le jalon"
					>
						<Check class="h-2.5 w-2.5" />
						<span>Retenir</span>
					</button>
				</div>

				<!-- Pill Dilemme si présent -->
				{#if currentConflict}
					<button
						type="button"
						onclick={() => (isExpanded = true)}
						class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-[11px] font-medium max-w-xs truncate cursor-pointer"
						title={currentConflict}
					>
						<AlertTriangle class="h-3 w-3 shrink-0" />
						<span class="truncate">{currentConflict}</span>
					</button>
				{/if}

				<!-- Pill Clauses RFP / ADR -->
				{#if clientClauses.length > 0 || adrDecisions.length > 0}
					<button
						type="button"
						onclick={() => (isExpanded = !isExpanded)}
						class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-indigo-800 dark:text-indigo-300 text-[11px] font-semibold cursor-pointer"
					>
						<FileText class="h-3 w-3 shrink-0" />
						<span>{clientClauses.length} exigence(s) RFP{adrDecisions.length > 0 ? ` · ${adrDecisions.length} ADR` : ''}</span>
					</button>
				{/if}

				<!-- Pill Questions au Sachant Métier -->
				{#if expertQuestions.length > 0}
					<button
						type="button"
						onclick={() => (isExpanded = !isExpanded)}
						class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-[11px] font-semibold cursor-pointer"
					>
						<HelpCircle class="h-3 w-3 shrink-0" />
						<span>{expertQuestions.length} question(s) métier</span>
					</button>
				{/if}
			</div>

			<!-- Raccourci direct vers le volet Options, Matrice & Arbitrage (sans dupliquer les cartes d'options) -->
			{#if options && options.length > 0}
				<button
					type="button"
					onclick={() => onArbitrateOption(options[0])}
					class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-800 dark:text-purple-300 text-[11px] font-bold transition-colors cursor-pointer shrink-0"
					title="Consulter et évaluer les options dans la Matrice & Arbitrage"
				>
					<Scale class="h-3 w-3" />
					<span>{options.length} option(s) → Matrice</span>
				</button>
			{/if}
		</div>
	</div>

	<!-- ─── VOLET DÉPLIABLE (Édition Hypothèse, Clauses RFP, Questions Métier) ─ -->
	{#if isExpanded}
		<div class="px-3.5 pb-3.5 pt-2 border-t border-primary/15 bg-card/50 space-y-3 text-xs">
			<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
				<!-- 1. Hypothèse éditable -->
				<div class="rounded-xl border bg-background/80 p-2.5 space-y-1.5 flex flex-col">
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
						<div class="pt-1 border-t border-border/40 text-[10px] text-muted-foreground italic truncate" title={currentConsequence}>
							{currentConsequence}
						</div>
					{/if}
				</div>

				<!-- 2. Dilemme & Conflit -->
				<div class="rounded-xl border {currentConflict ? 'border-amber-500/30 bg-amber-500/5' : 'bg-background/80'} p-2.5 space-y-1.5 flex flex-col">
					<div class="flex items-center gap-1 text-[11px] font-bold {currentConflict ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}">
						<AlertTriangle class="h-3.5 w-3.5" />
						<span>Dilemme & Arbitrage</span>
					</div>
					{#if currentConflict}
						<p class="text-xs text-amber-900 dark:text-amber-200 leading-relaxed flex-1">
							{currentConflict}
						</p>
					{:else}
						<p class="text-xs text-muted-foreground leading-relaxed flex-1">
							Aucun conflit doctrinal bloquant identifié.
						</p>
					{/if}
				</div>

				<!-- 3. Exigences Client (RFP) & ADR -->
				<div class="rounded-xl border bg-background/80 p-2.5 space-y-1.5 flex flex-col">
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
							Consultables dans l'onglet Doctrines & Brouillon.
						</p>
					{/if}

					{#if adrDecisions.length > 0}
						<div class="flex flex-wrap gap-1 pt-1 border-t border-border/40">
							{#each adrDecisions as adr}
								<span class="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-[10px] font-mono text-blue-800 dark:text-blue-200 flex items-center gap-1">
									<BookOpen class="h-2.5 w-2.5" />
									<span>{adr}</span>
								</span>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Questions au Sachant Métier (Méthodologie ArcKit) -->
			{#if expertQuestions.length > 0}
				<div class="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2.5">
					<div class="flex items-center justify-between gap-2 flex-wrap">
						<div class="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
							<HelpCircle class="h-4 w-4 text-amber-600 dark:text-amber-400" />
							<span>Questions au Sachant Métier & Donneur d'Ordre ({expertQuestions.length})</span>
						</div>
						<span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-500/30 font-semibold">
							Cadrage ArcKit
						</span>
					</div>

					<div class="space-y-2">
						{#each expertQuestions as q, idx}
							{@const savedAnswer = draft?.expertAnswers?.[q]}
							{@const isAnswering = answeringQuestionIdx === idx}

							<div class="rounded-lg bg-background border {savedAnswer ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-amber-500/25'} p-2.5 space-y-2 text-xs">
								<div class="flex items-start justify-between gap-2">
									<div class="flex items-start gap-2 flex-1">
										<span class="font-mono font-bold {savedAnswer ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'} shrink-0 mt-0.5">
											Q{idx + 1}.
										</span>
										<span class="font-medium text-foreground leading-snug">{q}</span>
									</div>

									{#if savedAnswer && !isAnswering}
										<button
											type="button"
											onclick={() => startAnswerQuestion(idx, savedAnswer.answer)}
											class="text-[11px] text-muted-foreground hover:text-foreground font-medium underline decoration-dotted shrink-0 cursor-pointer ml-2"
										>
											Modifier
										</button>
									{:else if !savedAnswer && !isAnswering}
										<button
											type="button"
											onclick={() => startAnswerQuestion(idx, '')}
											class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold text-amber-800 dark:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition-colors cursor-pointer shrink-0"
										>
											<span>💬 Répondre</span>
										</button>
									{/if}
								</div>

								{#if savedAnswer && !isAnswering}
									<div class="p-2 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-xs">
										<span class="font-bold text-emerald-800 dark:text-emerald-300 text-[10px] uppercase mr-1.5">
											{savedAnswer.mode === 'hypothesis' ? '💡 Hypothèse :' : savedAnswer.mode === 'retenu' ? '📌 Retenu :' : '💬 Argument :'}
										</span>
										<span class="italic">« {savedAnswer.answer} »</span>
									</div>
								{/if}

								{#if isAnswering}
									<div class="space-y-2 pt-1 border-t border-border/50">
										<textarea
											rows={2}
											bind:value={currentAnswerInput}
											placeholder="Saisissez la réponse, l'hypothèse d'architecture ou l'éclairage métier..."
											class="w-full text-xs p-2 rounded-md border border-input bg-background focus:ring-1 focus:ring-primary focus:outline-hidden resize-none"
										></textarea>

										<div class="flex items-center justify-end gap-1.5 flex-wrap">
											<button
												type="button"
												onclick={() => { answeringQuestionIdx = null; currentAnswerInput = ''; }}
												class="px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground border border-border/60 hover:bg-muted cursor-pointer"
											>
												Annuler
											</button>
											<button
												type="button"
												disabled={!currentAnswerInput.trim()}
												onclick={() => submitExpertAnswer(q, 'argument')}
												class="px-2.5 py-1 rounded text-[11px] font-semibold border border-border hover:bg-muted text-foreground cursor-pointer disabled:opacity-50"
											>
												💬 Débattre
											</button>
											<button
												type="button"
												disabled={!currentAnswerInput.trim()}
												onclick={() => submitExpertAnswer(q, 'hypothesis')}
												class="px-2.5 py-1 rounded text-[11px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 border border-amber-500/40 cursor-pointer disabled:opacity-50"
											>
												💡 Poser comme Hypothèse
											</button>
											<button
												type="button"
												disabled={!currentAnswerInput.trim()}
												onclick={() => submitExpertAnswer(q, 'retenu')}
												class="px-2.5 py-1 rounded text-[11px] font-bold bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer disabled:opacity-50"
											>
												📌 Acter comme Retenu
											</button>
										</div>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

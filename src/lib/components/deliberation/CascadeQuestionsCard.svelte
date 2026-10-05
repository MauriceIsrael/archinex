<script lang="ts">
	import type { CascadeQuestion, CascadeResult } from '$lib/domain/cascade';
	import { formatSourceType } from '$lib/domain/cascade';
	import {
		GitFork,
		ExternalLink,
		UserPlus,
		Combine,
		CheckCircle,
		AlertCircle,
		ShieldAlert,
		Sparkles,
		X
	} from 'lucide-svelte';

	let {
		projectId = '',
		subjectId = '',
		cascade = null as CascadeResult | null,
		onNavigateToChild = (childId: string) => {},
		onQuestionUpdated = () => {}
	}: {
		projectId?: string;
		subjectId?: string;
		cascade?: CascadeResult | null;
		onNavigateToChild?: (childId: string) => void;
		onQuestionUpdated?: () => void;
	} = $props();

	let questions = $state<CascadeQuestion[]>([]);
	let selectedQuestionForClose = $state<CascadeQuestion | null>(null);
	let closeJustification = $state('');
	let closeError = $state('');
	let isClosing = $state(false);
	let isProposing = $state(false);
	let isExpanded = $state(false);
	let capitalizeMessage = $state('');

	$effect(() => {
		if (cascade && cascade.questions) {
			questions = [...cascade.questions];
		}
	});

	async function handleProposeComplementaryQuestions() {
		isProposing = true;
		try {
			const res = await fetch(
				`/api/projects/${projectId}/subjects/${subjectId}/cascade/propose`,
				{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
			);
			if (res.ok) {
				const data = await res.json();
				if (data.questions && data.questions.length > 0) {
					questions = [...questions, ...data.questions];
					onQuestionUpdated();
				}
			}
		} catch (err) {
			console.warn('[Cascade] Erreur agent proposeur :', err);
		} finally {
			isProposing = false;
		}
	}

	async function handleCloseQuestion() {
		if (!selectedQuestionForClose) return;
		closeError = '';

		if (selectedQuestionForClose.mandatory && closeJustification.trim().length < 5) {
			closeError =
				'Clôture impossible : une justification détaillée est obligatoirement requise pour clore une question impérative.';
			return;
		}

		isClosing = true;
		try {
			const res = await fetch(
				`/api/projects/${projectId}/subjects/${subjectId}/cascade/actions`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						action: 'close',
						question: selectedQuestionForClose,
						justification: closeJustification
					})
				}
			);

			const data = await res.json();
			if (!res.ok) {
				closeError = data.message || data.error || 'Erreur lors de la clôture';
				return;
			}

			const idx = questions.findIndex((q) => q.id === selectedQuestionForClose?.id);
			if (idx !== -1) {
				questions[idx] = data.question;
			}
			selectedQuestionForClose = null;
			closeJustification = '';
			onQuestionUpdated();
		} catch (err: any) {
			closeError = err.message || 'Erreur réseau';
		} finally {
			isClosing = false;
		}
	}

	async function handleAssignQuestion(q: CascadeQuestion) {
		const assignedTo = prompt('Assigner la question à :', q.assignedTo || 'Lead Architect');
		if (!assignedTo) return;

		try {
			const res = await fetch(
				`/api/projects/${projectId}/subjects/${subjectId}/cascade/actions`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						action: 'assign',
						question: q,
						assignedTo
					})
				}
			);

			if (res.ok) {
				const data = await res.json();
				const idx = questions.findIndex((item) => item.id === q.id);
				if (idx !== -1) questions[idx] = data.question;
				onQuestionUpdated();
			}
		} catch (err) {
			console.warn('[Cascade] Erreur assignation :', err);
		}
	}

	async function handleMergeQuestion(q: CascadeQuestion, targetSubjectId?: string) {
		const mergedWithSubjectId = targetSubjectId || prompt('ID du sujet existant avec lequel fusionner :');
		if (!mergedWithSubjectId) return;

		try {
			const res = await fetch(
				`/api/projects/${projectId}/subjects/${subjectId}/cascade/actions`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						action: 'merge',
						question: q,
						mergedWithSubjectId
					})
				}
			);

			if (res.ok) {
				const data = await res.json();
				const idx = questions.findIndex((item) => item.id === q.id);
				if (idx !== -1) questions[idx] = data.question;
				onQuestionUpdated();
			}
		} catch (err) {
			console.warn('[Cascade] Erreur fusion :', err);
		}
	}

	async function handleCapitalizeQuestion(q: CascadeQuestion) {
		try {
			const res = await fetch(
				`/api/projects/${projectId}/subjects/${subjectId}/cascade/actions`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						action: 'capitalize',
						question: q,
						candidateTitle: `Règle candidate issue de la question : ${q.subjectName}`,
						candidateSummary: q.text,
						candidateRationale: q.grounds || 'Suggestion de l\'agent proposeur remontée au référentiel.'
					})
				}
			);

			if (res.ok) {
				const data = await res.json();
				capitalizeMessage = `Candidature K22 enregistrée (${data.candidateId}) !`;
				setTimeout(() => {
					capitalizeMessage = '';
				}, 4000);
			}
		} catch (err) {
			console.warn('[Cascade] Erreur capitalisation :', err);
		}
	}
</script>

{#if questions.length > 0}
	<div
		class="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-3 my-4 shadow-2xs"
		data-testid="cascade-questions-card"
	>
		<!-- En-tête de la carte de cascade (cliquable pour déplier/replier) -->
		<div class="flex items-center justify-between gap-2 border-b border-indigo-500/20 pb-2.5">
			<button
				type="button"
				onclick={() => (isExpanded = !isExpanded)}
				class="flex items-center gap-2 text-left cursor-pointer group flex-1"
				title={isExpanded ? 'Replier les questions' : 'Déplier les questions'}
			>
				<div class="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-500/25 transition-colors">
					<GitFork class="h-4 w-4" />
				</div>
				<div>
					<h3 class="text-xs font-bold text-foreground flex items-center gap-1.5">
						<span>🔀 Cette décision ouvre {questions.length} questions et sous-sujets</span>
						<span class="text-[10px] font-normal text-muted-foreground underline decoration-dotted ml-1">
							{isExpanded ? '(replier ▲)' : '(déplier ▼)'}
						</span>
					</h3>
					<span class="text-[10px] text-muted-foreground block">
						Dérivé automatiquement par le moteur de cascade suite à l'affirmation des faits (K20)
					</span>
				</div>
			</button>

			<!-- Bouton Agent Proposeur : Angles morts (A29) -->
			<button
				type="button"
				onclick={handleProposeComplementaryQuestions}
				disabled={isProposing}
				class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 font-semibold text-[11px] transition-colors cursor-pointer disabled:opacity-50 shrink-0"
				title="Déclencher l'agent Proposeur pour identifier des angles morts complémentaires (au plus 2, llm-derived)"
				data-testid="btn-propose-angles-morts"
			>
				<Sparkles class="h-3 w-3 {isProposing ? 'animate-spin' : ''}" />
				<span>{isProposing ? 'Analyse...' : 'Angles morts 🤖'}</span>
			</button>
		</div>

		<!-- Notification de capitalisation K22 -->
		{#if capitalizeMessage}
			<div class="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2 font-medium">
				<CheckCircle class="h-4 w-4 text-emerald-600 shrink-0" />
				<span>{capitalizeMessage}</span>
			</div>
		{/if}

		<!-- Liste des questions de cascade (repliée par défaut) -->
		{#if isExpanded}
		<div class="space-y-2.5">
			{#each questions as q (q.id)}
				{@const sourceInfo = formatSourceType(q.sourceType)}
				<div
					class="p-3 rounded-lg border bg-card/70 space-y-2 text-xs transition-colors {q.status ===
					'closed'
						? 'opacity-60 bg-muted/20'
						: ''}"
				>
					<div class="flex items-start justify-between gap-2 flex-wrap">
						<div class="flex items-center gap-1.5 flex-wrap">
							<!-- Badge Source -->
							<span
								class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border {sourceInfo.badgeClass}"
							>
								<span>{sourceInfo.icon}</span>
								<span>{sourceInfo.label}</span>
							</span>

							<!-- Badge Obligatoire -->
							{#if q.mandatory}
								<span
									class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/25"
								>
									Mandatory
								</span>
							{/if}

							<!-- Badge llm-derived pour questions d'agent -->
							{#if q.productionMode === 'llm-derived' || q.sourceType === 'agent'}
								<span
									class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20"
								>
									llm-derived
								</span>
							{/if}

							<!-- Règle de rattachement (si applicable) -->
							{#if q.lineage.ruleRef}
								<span class="font-mono text-[10px] text-muted-foreground">
									§ {q.lineage.ruleRef}
								</span>
							{/if}
						</div>

						<!-- Statut de la question -->
						<div>
							{#if q.status === 'closed'}
								<span
									class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground"
								>
									<CheckCircle class="h-3 w-3" />
									Clos : {q.closedReason || 'Validé'}
								</span>
							{:else if q.status === 'merged'}
								<span
									class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/30"
								>
									<Combine class="h-3 w-3" />
									Fusionné avec {q.mergedWithSubjectId || 'sujet'}
								</span>
							{:else if q.status === 'assigned'}
								<span
									class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20"
								>
									Assigné : {q.assignedTo}
								</span>
							{:else}
								<span
									class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20"
								>
									Ouvert
								</span>
							{/if}
						</div>
					</div>

					<!-- Texte de la question -->
					<h4 class="font-bold text-xs text-foreground leading-snug">
						{q.text}
					</h4>

					<!-- Signalement de doublon sémantique potentiel (A29) -->
					{#if q.possibleDuplicate && q.status !== 'merged'}
						<div
							class="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2 flex-wrap"
							data-testid="badge-possible-duplicate"
						>
							<div class="flex items-center gap-1.5 text-amber-900 dark:text-amber-200 text-[11px]">
								<AlertCircle class="h-4 w-4 text-amber-600 shrink-0" />
								<div>
									<strong>Doublon possible ?</strong>
									<span class="ml-1">
										Similarité {(q.possibleDuplicate.score * 100).toFixed(0)}% (seuil calibré : {(q.possibleDuplicate.threshold * 100).toFixed(0)}%) avec « {q.possibleDuplicate.sectionRef || '§'} {q.possibleDuplicate.subjectName} »
									</span>
								</div>
							</div>

							<button
								type="button"
								onclick={() => handleMergeQuestion(q, q.possibleDuplicate?.subjectId)}
								class="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] transition-colors cursor-pointer shrink-0 shadow-2xs"
								title="Fusionner cette question directement avec le sujet existant"
								data-testid="btn-merge-duplicate"
							>
								<Combine class="h-3 w-3" />
								<span>Fusionner</span>
							</button>
						</div>
					{/if}

					<!-- Pourquoi : Faits déclencheurs ou Fondement de l'agent -->
					<div class="p-2 rounded bg-muted/30 border border-border/40 text-[11px] space-y-1">
						{#if q.grounds}
							<div class="text-muted-foreground">
								<strong class="text-foreground">Fondement (grounds) :</strong>
								<span class="ml-1">{q.grounds}</span>
							</div>
						{:else}
							<div class="flex items-center gap-1 text-muted-foreground">
								<strong class="text-foreground">Pourquoi :</strong>
								<span>{q.lineage.ruleName || q.lineage.ruleRef || 'Cascade de décision'}</span>
							</div>
						{/if}

						{#if q.lineage.triggeringFacts && q.lineage.triggeringFacts.length > 0}
							<div class="flex items-center gap-1 text-[10px] text-muted-foreground font-mono flex-wrap">
								<span>Faits déclencheurs :</span>
								{#each q.lineage.triggeringFacts as tf}
									<span class="px-1 py-0.2 rounded bg-muted text-foreground border">
										{tf.key} = {tf.value}
									</span>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Actions sur la question -->
					{#if q.status !== 'closed' && q.status !== 'merged'}
						<div class="flex items-center justify-end gap-1.5 pt-1 border-t border-border/40 text-xs">
							<!-- Ouvrir le fil de l'enfant -->
							{#if q.childSubjectId}
								<button
									type="button"
									onclick={() => onNavigateToChild(q.childSubjectId!)}
									class="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary text-primary-foreground font-semibold text-[11px] hover:bg-primary/90 transition-colors cursor-pointer"
									title="Ouvrir le fil dédié de ce sous-sujet"
								>
									<ExternalLink class="h-3 w-3" />
									<span>Ouvrir</span>
								</button>
							{/if}

							<!-- Capitaliser vers K22 / K7 -->
							{#if q.sourceType === 'agent'}
								<button
									type="button"
									onclick={() => handleCapitalizeQuestion(q)}
									class="inline-flex items-center gap-1 px-2 py-1 rounded border border-purple-500/30 text-purple-700 dark:text-purple-300 hover:bg-purple-500/10 font-medium text-[11px] transition-colors cursor-pointer"
									title="Remonter cette suggestion comme candidate à une règle de référence (K7/K22)"
									data-testid="btn-capitalize-question"
								>
									<Sparkles class="h-3 w-3 text-purple-500" />
									<span>Capitaliser (K22)</span>
								</button>
							{/if}

							<!-- Assigner -->
							<button
								type="button"
								onclick={() => handleAssignQuestion(q)}
								class="inline-flex items-center gap-1 px-2 py-1 rounded border hover:bg-muted font-medium text-[11px] transition-colors cursor-pointer"
								title="Assigner la question à un membre"
							>
								<UserPlus class="h-3 w-3 text-muted-foreground" />
								<span>Assigner</span>
							</button>

							<!-- Fusionner manuelle -->
							{#if !q.possibleDuplicate}
								<button
									type="button"
									onclick={() => handleMergeQuestion(q)}
									class="inline-flex items-center gap-1 px-2 py-1 rounded border hover:bg-muted font-medium text-[11px] transition-colors cursor-pointer"
									title="Fusionner avec un autre sujet"
								>
									<Combine class="h-3 w-3 text-muted-foreground" />
									<span>Fusionner</span>
								</button>
							{/if}

							<!-- Clore la question -->
							<button
								type="button"
								onclick={() => {
									selectedQuestionForClose = q;
									closeJustification = '';
									closeError = '';
								}}
								class="inline-flex items-center gap-1 px-2 py-1 rounded border border-rose-500/30 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10 font-medium text-[11px] transition-colors cursor-pointer"
								title={q.mandatory
									? 'Clôture sous réserve de justification obligatoire'
									: 'Clore la question'}
							>
								<X class="h-3 w-3" />
								<span>Clore</span>
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Modale / Formulaire de clôture avec justification -->
		{#if selectedQuestionForClose}
			<div
				class="p-3 rounded-lg border border-rose-500/40 bg-card space-y-2 text-xs shadow-md"
				data-testid="close-question-modal"
			>
				<div class="flex items-center justify-between">
					<h5 class="font-bold text-xs text-foreground flex items-center gap-1.5">
						<ShieldAlert class="h-3.5 w-3.5 text-rose-600" />
						<span>Clore la question « {selectedQuestionForClose.subjectName} »</span>
					</h5>
					<button
						type="button"
						onclick={() => (selectedQuestionForClose = null)}
						class="text-muted-foreground hover:text-foreground cursor-pointer"
					>
						<X class="h-3.5 w-3.5" />
					</button>
				</div>

				<p class="text-[11px] text-muted-foreground">
					{#if selectedQuestionForClose.mandatory}
						<strong class="text-rose-600">Question impérative (mandatory) :</strong> Une justification
						détaillée est strictement exigée pour archiver cette question sans traiter le sujet.
					{:else}
						Indiquez le motif de clôture de cette question de cascade.
					{/if}
				</p>

				<textarea
					rows="2"
					bind:value={closeJustification}
					placeholder="Justification de la clôture (ex: déjà couvert par un contrat existant)..."
					class="w-full text-xs p-2 rounded border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
				></textarea>

				{#if closeError}
					<div class="text-[11px] text-rose-600 font-semibold">
						⚠️ {closeError}
					</div>
				{/if}

				<div class="flex items-center justify-end gap-2">
					<button
						type="button"
						onclick={() => (selectedQuestionForClose = null)}
						class="px-2.5 py-1 rounded border text-[11px] hover:bg-muted font-medium cursor-pointer"
					>
						Annuler
					</button>
					<button
						type="button"
						onclick={handleCloseQuestion}
						disabled={isClosing}
						class="px-3 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] transition-colors cursor-pointer disabled:opacity-50"
					>
						<span>{isClosing ? 'Clôture...' : 'Confirmer la clôture'}</span>
					</button>
				</div>
			</div>
		{/if}
		{/if}
	</div>
{/if}

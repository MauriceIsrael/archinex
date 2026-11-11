<script lang="ts">
	import { tick } from 'svelte';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { apiFetch } from '$lib/api/fetch';
	import type { QuickAskCitation, QuickAskResponsePayload, QuickAskVerdict } from '$lib/domain/requirementsQa';
	import {
		Sparkles,
		X,
		Send,
		Maximize2,
		Minimize2,
		Trash2,
		AlertTriangle,
		CheckCircle2,
		HelpCircle,
		Ban,
		ArrowUpRight,
		Loader2,
		FileSearch
	} from 'lucide-svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
	}

	interface ChatTurn {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		verdict?: QuickAskVerdict;
		caveats?: string[];
		citations?: QuickAskCitation[];
		meta?: QuickAskResponsePayload['meta'];
		error?: string;
	}

	let { open, onClose }: Props = $props();

	const SUGGESTIONS = [
		'Les exigences imposent-elles 3 DC ?',
		'Quelles contraintes RPO / RTO ou PRA sont fixées ?',
		'Quelles exigences portent sur le chiffrement ou la souveraineté ?'
	];

	let question = $state('');
	let isLoading = $state(false);
	let isExpanded = $state(false);
	let includeEvacuated = $state(true);
	let threadsByProject = $state<Record<string, ChatTurn[]>>({});

	let inputEl = $state<HTMLTextAreaElement | null>(null);
	let scrollEl = $state<HTMLDivElement | null>(null);

	const projectId = $derived(deliberationStore.activeEngagement.id);
	const turns = $derived(threadsByProject[projectId] ?? []);

	$effect(() => {
		if (open) {
			tick().then(() => {
				inputEl?.focus();
				scrollToBottom();
			});
		}
	});

	function scrollToBottom() {
		if (scrollEl) {
			scrollEl.scrollTop = scrollEl.scrollHeight;
		}
	}

	function appendTurn(pid: string, turn: ChatTurn) {
		const prev = threadsByProject[pid] ?? [];
		threadsByProject = { ...threadsByProject, [pid]: [...prev, turn] };
	}

	function clearHistory() {
		if (!projectId) return;
		threadsByProject = { ...threadsByProject, [projectId]: [] };
	}

	function verdictMeta(verdict: QuickAskVerdict) {
		switch (verdict) {
			case 'imposed':
				return {
					label: 'Exigé',
					classes: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
					icon: CheckCircle2
				};
			case 'partial_or_implicit':
				return {
					label: 'Partiel / Implicite',
					classes: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
					icon: HelpCircle
				};
			case 'contradictory':
				return {
					label: 'Contradictoire',
					classes: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
					icon: AlertTriangle
				};
			case 'not_found':
			default:
				return {
					label: 'Non mentionné',
					classes: 'bg-muted text-muted-foreground border-border',
					icon: Ban
				};
		}
	}

	function dispositionLabel(d: string): string {
		switch (d) {
			case 'deliberated':
				return 'à délibérer';
			case 'evacuated':
				return 'évacuée';
			case 'clarification_needed':
				return 'à clarifier';
			case 'to_qualify':
				return 'à qualifier';
			default:
				return d;
		}
	}

	function openLinkedSubject(subjectId: string) {
		deliberationStore.setPosture('deliberation');
		deliberationStore.selectSubject(subjectId);
	}

	async function submitQuestion(customText?: string) {
		const prompt = (customText ?? question).trim();
		if (prompt.length < 2 || isLoading || !projectId) return;

		const pid = projectId;
		const history = (threadsByProject[pid] ?? [])
			.filter((t) => !t.error)
			.slice(-10)
			.map((t) => ({ role: t.role, content: t.content }));

		question = '';
		appendTurn(pid, {
			id: `u-${Date.now()}`,
			role: 'user',
			content: prompt
		});

		isLoading = true;
		await tick();
		scrollToBottom();

		const { data, error } = await apiFetch<QuickAskResponsePayload>(
			`/api/projects/${encodeURIComponent(pid)}/requirements/ask`,
			{
				method: 'POST',
				body: {
					question: prompt,
					history,
					includeEvacuated
				}
			}
		);

		isLoading = false;

		if (error || !data) {
			appendTurn(pid, {
				id: `e-${Date.now()}`,
				role: 'assistant',
				content: '',
				error: error?.message || "Impossible d'interroger le dossier d'exigences."
			});
		} else {
			appendTurn(pid, {
				id: `a-${Date.now()}`,
				role: 'assistant',
				content: data.answer,
				verdict: data.verdict,
				caveats: data.caveats,
				citations: data.citations,
				meta: data.meta
			});
		}

		await tick();
		scrollToBottom();
	}

	function handleInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
			return;
		}
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void submitQuestion();
		}
	}
</script>

{#if open}
	<div
		data-testid="requirements-quick-ask-panel"
		role="dialog"
		aria-modal="false"
		aria-label="Assistant rapide sur les exigences du projet"
		class="fixed bottom-4 right-4 z-50 flex flex-col rounded-2xl border bg-card/95 backdrop-blur-md shadow-2xl transition-all duration-150 {isExpanded
			? 'w-[min(94vw,680px)] h-[min(82vh,640px)]'
			: 'w-[min(92vw,460px)] max-h-[min(76vh,540px)]'}"
	>
		<!-- En-tête compact -->
		<header class="flex items-center justify-between gap-2 border-b px-3.5 py-2.5">
			<div class="flex items-center gap-2 min-w-0">
				<div class="rounded-lg bg-primary/10 p-1.5 text-primary shrink-0">
					<FileSearch class="h-4 w-4" />
				</div>
				<div class="min-w-0">
					<div class="flex items-center gap-1.5">
						<h2 class="text-xs font-bold text-foreground truncate">Quick-Ask Exigences</h2>
						<kbd class="hidden sm:inline-block rounded border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
							Alt+/
						</kbd>
					</div>
					<p class="text-[11px] text-muted-foreground truncate">
						{deliberationStore.activeEngagement.shortName} · réponses sourcées par clauseRef
					</p>
				</div>
			</div>

			<div class="flex items-center gap-1 shrink-0">
				{#if turns.length > 0}
					<button
						type="button"
						onclick={clearHistory}
						title="Effacer la conversation"
						class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
					>
						<Trash2 class="h-3.5 w-3.5" />
					</button>
				{/if}
				<button
					type="button"
					onclick={() => (isExpanded = !isExpanded)}
					title={isExpanded ? 'Réduire la fenêtre' : 'Agrandir la fenêtre'}
					class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
				>
					{#if isExpanded}
						<Minimize2 class="h-3.5 w-3.5" />
					{:else}
						<Maximize2 class="h-3.5 w-3.5" />
					{/if}
				</button>
				<button
					type="button"
					data-testid="quick-ask-close"
					onclick={onClose}
					title="Fermer (Échap)"
					class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		</header>

		<!-- Fil de conversation -->
		<div bind:this={scrollEl} class="flex-1 overflow-y-auto px-3.5 py-3 space-y-3 text-xs">
			{#if turns.length === 0}
				<div class="space-y-2.5 py-2">
					<p class="text-muted-foreground leading-relaxed">
						Posez une question factuelle sur le dossier d'exigences du projet. Les réponses citent uniquement les clauses enregistrées.
					</p>
					<div class="flex flex-col gap-1.5">
						{#each SUGGESTIONS as suggestion}
							<button
								type="button"
								onclick={() => submitQuestion(suggestion)}
								class="flex items-center justify-between gap-2 rounded-xl border bg-muted/40 hover:bg-muted px-3 py-2 text-left text-xs text-foreground/90 transition-colors cursor-pointer"
							>
								<span class="flex items-center gap-2">
									<Sparkles class="h-3.5 w-3.5 text-primary shrink-0" />
									<span>{suggestion}</span>
								</span>
								<ArrowUpRight class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
							</button>
						{/each}
					</div>
				</div>
			{:else}
				{#each turns as turn (turn.id)}
					{#if turn.role === 'user'}
						<div class="flex justify-end">
							<div class="max-w-[85%] rounded-2xl rounded-br-xs bg-primary px-3 py-2 text-primary-foreground shadow-2xs">
								{turn.content}
							</div>
						</div>
					{:else if turn.error}
						<div class="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-rose-700 dark:text-rose-300 flex items-start gap-2">
							<AlertTriangle class="h-4 w-4 shrink-0 mt-0.5" />
							<span>{turn.error}</span>
						</div>
					{:else}
						{@const v = verdictMeta(turn.verdict ?? 'not_found')}
						{@const VerdictIcon = v.icon}
						<div class="rounded-xl border bg-background/80 p-3 space-y-2.5 shadow-2xs">
							<div class="flex items-center justify-between gap-2 flex-wrap">
								<span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold {v.classes}">
									<VerdictIcon class="h-3 w-3" />
									<span>{v.label}</span>
								</span>
								{#if turn.meta}
									<span class="font-mono text-[10px] text-muted-foreground">
										{turn.meta.evaluatedRequirements}/{turn.meta.totalRequirements} clauses · {turn.meta.mode === 'full_context' ? 'corpus complet' : 'filtré'}
									</span>
								{/if}
							</div>

							<p class="text-foreground leading-relaxed whitespace-pre-wrap">{turn.content}</p>

							{#if turn.caveats && turn.caveats.length > 0}
								<div class="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 space-y-1 text-[11px] text-amber-800 dark:text-amber-200">
									{#each turn.caveats as caveat}
										<div class="flex items-start gap-1.5">
											<AlertTriangle class="h-3.5 w-3.5 shrink-0 mt-0.5" />
											<span>{caveat}</span>
										</div>
									{/each}
								</div>
							{/if}

							{#if turn.citations && turn.citations.length > 0}
								<div class="space-y-1.5 pt-1 border-t">
									<div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
										Clauses citées ({turn.citations.length})
									</div>
									{#each turn.citations as cit}
										<div class="rounded-lg border bg-muted/30 p-2 space-y-1">
											<div class="flex items-center justify-between gap-2 flex-wrap">
												<div class="flex items-center gap-1.5 flex-wrap">
													<span class="font-mono font-bold text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
														{cit.clauseRef}
													</span>
													<span class="font-semibold text-foreground">{cit.title}</span>
												</div>
												<div class="flex items-center gap-1 text-[10px] font-mono">
													<span class="px-1.5 py-0.5 rounded bg-background border text-muted-foreground">
														{cit.criticality}
													</span>
													<span class="px-1.5 py-0.5 rounded bg-background border text-muted-foreground">
														{dispositionLabel(cit.effectiveDisposition)}
													</span>
												</div>
											</div>
											{#if cit.excerpt}
												<p class="text-[11px] text-muted-foreground italic line-clamp-3">
													« {cit.excerpt} »
												</p>
											{/if}
											{#if cit.linkedSubjectIds.length > 0}
												<div class="flex items-center gap-1.5 flex-wrap pt-0.5">
													{#each cit.linkedSubjectIds as subId}
														<button
															type="button"
															onclick={() => openLinkedSubject(subId)}
															class="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
														>
															<span>Ouvrir le sujet</span>
															<ArrowUpRight class="h-3 w-3" />
														</button>
													{/each}
												</div>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				{/each}

				{#if isLoading}
					<div class="flex items-center gap-2 text-muted-foreground py-1">
						<Loader2 class="h-3.5 w-3.5 animate-spin text-primary" />
						<span>Analyse du dossier d'exigences en cours…</span>
					</div>
				{/if}
			{/if}
		</div>

		<!-- Zone de saisie + option -->
		<footer class="border-t p-2.5 space-y-2 bg-muted/20 rounded-b-2xl">
			<div class="flex items-end gap-2">
				<textarea
					bind:this={inputEl}
					bind:value={question}
					onkeydown={handleInputKeydown}
					rows={2}
					placeholder="Ex. : Les exigences imposent-elles 3 DC ?"
					class="flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
				></textarea>
				<button
					type="button"
					data-testid="quick-ask-submit"
					onclick={() => submitQuestion()}
					disabled={isLoading || question.trim().length < 2}
					title="Envoyer (Entrée)"
					class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
				>
					{#if isLoading}
						<Loader2 class="h-4 w-4 animate-spin" />
					{:else}
						<Send class="h-4 w-4" />
					{/if}
				</button>
			</div>

			<div class="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
				<label class="inline-flex items-center gap-1.5 cursor-pointer select-none">
					<input type="checkbox" bind:checked={includeEvacuated} class="rounded border-border" />
					<span>Inclure clauses évacuées</span>
				</label>
				<span class="truncate" title="Invariant II / III : lecture assistée uniquement">
					Lecture assistée — ne vaut pas validation humaine
				</span>
			</div>
		</footer>
	</div>
{/if}

<script lang="ts">
	import type { Stance, Argument } from '$lib/domain/debate';
	import { validateArgument, extractMentions, formatStanceLabel, getStanceBadgeClass } from '$lib/domain/debate';
	import type { Option } from '$lib/domain/options';
	import {
		Send,
		AlertCircle,
		CheckCircle2,
		Bot,
		UserCheck,
		HelpCircle,
		BookOpen,
		Sparkles,
		AtSign,
		Hash,
		Layers,
		CornerDownRight,
		X
	} from 'lucide-svelte';

	let {
		subjectId = '',
		projectId = '',
		options = [],
		allowedKbRefs = [],
		replyingTo = null,
		onCancelReply = () => {},
		onArgumentCreated = (created: Argument, triggeredArgs?: Argument[]) => {},
		onError = (msg: string) => {}
	}: {
		subjectId: string;
		projectId: string;
		options?: Option[];
		allowedKbRefs?: string[];
		replyingTo?: Argument | null;
		onCancelReply?: () => void;
		onArgumentCreated?: (created: Argument, triggeredArgs?: Argument[]) => void;
		onError?: (msg: string) => void;
	} = $props();

	// 1. Posture initiale
	let stance = $state<Stance>('support');
	let selectedOptionId = $state<string>('');
	let claim = $state<string>('');
	let grounds = $state<string>('');
	let isSubmitting = $state<boolean>(false);

	// Mentions autocomplete state
	let activeMentionType = $state<'hash' | 'at' | null>(null);
	let mentionSearch = $state<string>('');
	let activeInputTarget = $state<'claim' | 'grounds'>('claim');

	const availableAgents = [
		{ handle: 'challenger', label: 'Agent Challenger IA', role: 'Objections & failles' },
		{ handle: 'proposer', label: 'Agent Proposeur IA', role: 'Formulation d’options' },
		{ handle: 'verifier', label: 'Agent Vérificateur IA', role: 'Conformité doctrine' },
		{ handle: 'synthesizer', label: 'Agent Synthétiseur IA', role: 'Compromis & arbitrage' }
	];

	// Validation continue pendant la saisie
	const extracted = $derived(extractMentions(`${claim} ${grounds}`));

	const validation = $derived.by(() => {
		if (!claim.trim() && !grounds.trim()) {
			return { valid: false, reason: "Saisissez votre affirmation et son fondement." };
		}
		if (claim.trim().length < 3) {
			return { valid: false, reason: "L'affirmation ('claim') doit contenir au moins 3 caractères." };
		}
		if (!grounds.trim() || grounds.trim().length < 5) {
			return { valid: false, reason: "Le fondement ('grounds') est obligatoire (au moins 5 caractères étayés)." };
		}

		// Validation stricte des références doctrinales (#base)
		return validateArgument(
			{
				claim: claim.trim(),
				grounds: grounds.trim(),
				kbRefs: extracted.kbRefs,
				authorKind: 'human',
				productionMode: 'human-authored'
			},
			allowedKbRefs.length > 0 ? allowedKbRefs : undefined
		);
	});

	// Suggestions filtrées pour autocomplete
	const filteredHashSuggestions = $derived.by(() => {
		if (activeMentionType !== 'hash') return [];
		const q = mentionSearch.toLowerCase().replace(/^#/, '');
		return allowedKbRefs.filter((ref) => ref.toLowerCase().includes(q));
	});

	const filteredAtSuggestions = $derived.by(() => {
		if (activeMentionType !== 'at') return [];
		const q = mentionSearch.toLowerCase().replace(/^@/, '');
		return availableAgents.filter(
			(a) => a.handle.toLowerCase().includes(q) || a.label.toLowerCase().includes(q)
		);
	});

	function handleInputKeyDown(e: KeyboardEvent, target: 'claim' | 'grounds') {
		activeInputTarget = target;
		if (e.key === '#') {
			activeMentionType = 'hash';
			mentionSearch = '';
		} else if (e.key === '@') {
			activeMentionType = 'at';
			mentionSearch = '';
		} else if (e.key === ' ' || e.key === 'Escape') {
			activeMentionType = null;
		}
	}

	function handleInput(e: Event, target: 'claim' | 'grounds') {
		const val = (e.target as HTMLInputElement).value;
		if (target === 'claim') claim = val;
		else grounds = val;

		// Analyse si un mot commence par # ou @ à la fin
		const lastWord = val.split(/\s+/).pop() || '';
		if (lastWord.startsWith('#')) {
			activeMentionType = 'hash';
			mentionSearch = lastWord.slice(1);
		} else if (lastWord.startsWith('@')) {
			activeMentionType = 'at';
			mentionSearch = lastWord.slice(1);
		} else {
			activeMentionType = null;
		}
	}

	function insertMention(textToInsert: string) {
		if (activeInputTarget === 'claim') {
			const words = claim.split(/\s+/);
			words.pop();
			claim = words.length > 0 ? `${words.join(' ')} ${textToInsert} ` : `${textToInsert} `;
		} else {
			const words = grounds.split(/\s+/);
			words.pop();
			grounds = words.length > 0 ? `${words.join(' ')} ${textToInsert} ` : `${textToInsert} `;
		}
		activeMentionType = null;
	}

	async function handleSubmit() {
		if (!validation.valid || isSubmitting || !projectId || !subjectId) return;
		isSubmitting = true;

		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/arguments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					optionId: selectedOptionId || null,
					stance,
					claim: claim.trim(),
					grounds: grounds.trim(),
					confidence: 'designed',
					kbRefs: extracted.kbRefs,
					targetArgumentId: replyingTo?.id || null
				})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || "Erreur lors de l'enregistrement");
			}

			const data = await res.json();
			const created = data;
			const triggered = data.triggeredAgentArguments || [];

			onArgumentCreated(created, triggered);

			// Réinitialisation du formulaire
			claim = '';
			grounds = '';
			activeMentionType = null;
			if (replyingTo) {
				onCancelReply();
			}
		} catch (err: any) {
			onError(err.message);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="rounded-xl border bg-card p-4 space-y-3.5 shadow-2xs relative">
	<!-- BANNIÈRE DE CITATION / RÉPONSE EN COURS -->
	{#if replyingTo}
		<div class="rounded-lg border border-primary/30 bg-primary/5 p-2.5 flex items-start justify-between gap-3 text-xs">
			<div class="space-y-0.5 min-w-0">
				<div class="flex items-center gap-1.5 font-semibold text-primary text-[11px]">
					<CornerDownRight class="h-3.5 w-3.5 shrink-0" />
					<span>En réponse à {replyingTo.author} ({formatStanceLabel(replyingTo.stance)}) :</span>
				</div>
				<p class="text-foreground text-xs italic truncate">
					« {replyingTo.claim} »
				</p>
			</div>
			<button
				type="button"
				onclick={onCancelReply}
				class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer shrink-0"
				title="Annuler la réponse ciblée"
			>
				<X class="h-3.5 w-3.5" />
			</button>
		</div>
	{/if}

	<!-- 1. SÉLECTEUR DE POSTURE & QUICK AGENT CHIPS -->
	<div class="space-y-2">
		<div class="flex items-center justify-between gap-2 flex-wrap">
			<div class="flex items-center gap-1.5 flex-wrap">
				<span class="text-xs font-bold text-foreground mr-1">Posture :</span>

				<button
					type="button"
					onclick={() => (stance = 'support')}
					class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer {stance ===
					'support'
						? 'bg-emerald-600 text-white shadow-xs'
						: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/30'}"
				>
					<CheckCircle2 class="h-3.5 w-3.5" />
					<span>Soutenir</span>
				</button>

				<button
					type="button"
					onclick={() => (stance = 'objection')}
					class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer {stance ===
					'objection'
						? 'bg-rose-600 text-white shadow-xs'
						: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 border border-rose-500/30'}"
				>
					<AlertCircle class="h-3.5 w-3.5" />
					<span>Objecter</span>
				</button>

				<button
					type="button"
					onclick={() => (stance = 'question')}
					class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer {stance ===
					'question'
						? 'bg-amber-600 text-white shadow-xs'
						: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 border border-amber-500/30'}"
				>
					<HelpCircle class="h-3.5 w-3.5" />
					<span>Questionner</span>
				</button>

				<button
					type="button"
					onclick={() => (stance = 'verification')}
					class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer {stance ===
					'verification'
						? 'bg-cyan-600 text-white shadow-xs'
						: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 border border-cyan-500/30'}"
				>
					<BookOpen class="h-3.5 w-3.5" />
					<span>Vérifier</span>
				</button>
			</div>

			<!-- Ciblage d'option (Transverse ou spécifique) -->
			{#if options.length > 0}
				<div class="flex items-center gap-1.5 text-xs">
					<label for="compose-option" class="text-muted-foreground font-medium">Option :</label>
					<select
						id="compose-option"
						bind:value={selectedOptionId}
						class="px-2 py-1 text-xs rounded-md border bg-background text-foreground"
					>
						<option value="">Transverse (toutes options)</option>
						{#each options as opt}
							<option value={opt.id}>{opt.title}</option>
						{/each}
					</select>
				</div>
			{/if}
		</div>

		<!-- Puces d'assistance rapide des Agents LLM -->
		<div class="flex items-center gap-1.5 flex-wrap pt-0.5">
			<span class="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
				<Sparkles class="h-3 w-3 text-purple-600" />
				<span>Solliciter un agent :</span>
			</span>

			<button
				type="button"
				onclick={() => {
					grounds = grounds.includes('@challenger') ? grounds : `${grounds.trim()} @challenger `.trimStart();
				}}
				class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 cursor-pointer transition-colors"
				title="Insère @challenger pour demander à l'agent de trouver les failles"
			>
				<span>@challenger</span>
				<span class="text-muted-foreground font-sans">Attaquer</span>
			</button>

			<button
				type="button"
				onclick={() => {
					grounds = grounds.includes('@proposer') ? grounds : `${grounds.trim()} @proposer `.trimStart();
				}}
				class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 cursor-pointer transition-colors"
				title="Insère @proposer pour suggérer une nouvelle option"
			>
				<span>@proposer</span>
				<span class="text-muted-foreground font-sans">Proposer</span>
			</button>

			<button
				type="button"
				onclick={() => {
					grounds = grounds.includes('@verifier') ? grounds : `${grounds.trim()} @verifier `.trimStart();
				}}
				class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 cursor-pointer transition-colors"
				title="Insère @verifier pour contrôler la conformité doctrine"
			>
				<span>@verifier</span>
				<span class="text-muted-foreground font-sans">Vérifier</span>
			</button>

			<button
				type="button"
				onclick={() => {
					grounds = grounds.includes('@synthesizer') ? grounds : `${grounds.trim()} @synthesizer `.trimStart();
				}}
				class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 cursor-pointer transition-colors"
				title="Insère @synthesizer pour résumer et proposer un compromis"
			>
				<span>@synthesizer</span>
				<span class="text-muted-foreground font-sans">Synthétiser</span>
			</button>
		</div>
	</div>

	<!-- 2. CHAMP AFFIRMATION (claim) -->
	<div class="space-y-1">
		<label for="compose-claim" class="text-xs font-bold text-foreground block">
			Affirmation (Thèse ou constat direct) :
		</label>
		<input
			id="compose-claim"
			type="text"
			value={claim}
			onkeydown={(e) => handleInputKeyDown(e, 'claim')}
			oninput={(e) => handleInput(e, 'claim')}
			placeholder="Ex: Le plan de données requiert une isolation matérielle sous NIS2 (#RULE-SEC-01)..."
			class="w-full px-3 py-2 text-xs rounded-lg border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
		/>
	</div>

	<!-- 3. CHAMP FONDEMENT OBLIGATOIRE (grounds) -->
	<div class="space-y-1">
		<div class="flex items-center justify-between text-xs">
			<label for="compose-grounds" class="font-bold text-foreground flex items-center gap-1">
				<span>Fondement technique ou factuel (Obligatoire) :</span>
				<span class="text-rose-600 font-bold">*</span>
			</label>
			<span class="text-[10px] text-muted-foreground">Tapez # pour citer une règle, @ pour interpeller un agent</span>
		</div>
		<textarea
			id="compose-grounds"
			rows="2"
			value={grounds}
			onkeydown={(e) => handleInputKeyDown(e, 'grounds')}
			oninput={(e) => handleInput(e, 'grounds')}
			placeholder="Démontrez la causalité, le calcul, ou citez la doctrine (@challenger attaque l'option B)..."
			class="w-full px-3 py-2 text-xs rounded-lg border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
		></textarea>
	</div>

	<!-- MENU AUTOCOMPLÉTION POPUP (#base ou @agent) -->
	{#if activeMentionType === 'hash' && filteredHashSuggestions.length > 0}
		<div class="absolute z-20 bg-popover border rounded-lg shadow-lg p-1.5 w-72 max-h-48 overflow-y-auto bottom-16 left-4 text-xs">
			<div class="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 border-b mb-1">
				<Hash class="h-3 w-3 text-primary" />
				<span>Doctrines autorisées (#base)</span>
			</div>
			{#each filteredHashSuggestions as ref}
				<button
					type="button"
					onclick={() => insertMention(`#${ref}`)}
					class="w-full text-left px-2 py-1.5 rounded hover:bg-muted font-mono text-[11px] flex items-center justify-between transition-colors cursor-pointer"
				>
					<span class="font-bold text-foreground">#{ref}</span>
					<span class="text-[10px] text-muted-foreground">Insérer</span>
				</button>
			{/each}
		</div>
	{:else if activeMentionType === 'at' && filteredAtSuggestions.length > 0}
		<div class="absolute z-20 bg-popover border rounded-lg shadow-lg p-1.5 w-80 max-h-48 overflow-y-auto bottom-16 left-4 text-xs">
			<div class="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 border-b mb-1">
				<AtSign class="h-3 w-3 text-primary" />
				<span>Agents & Membres (@)</span>
			</div>
			{#each filteredAtSuggestions as agent}
				<button
					type="button"
					onclick={() => insertMention(`@${agent.handle}`)}
					class="w-full text-left px-2 py-1.5 rounded hover:bg-muted flex items-center justify-between transition-colors cursor-pointer"
				>
					<div class="flex items-center gap-1.5">
						<Bot class="h-3.5 w-3.5 text-purple-600 shrink-0" />
						<div>
							<strong class="text-foreground">@{agent.handle}</strong>
							<span class="text-[10px] text-muted-foreground block">{agent.label} · {agent.role}</span>
						</div>
					</div>
					<span class="text-[10px] text-primary font-semibold">Déclencher</span>
				</button>
			{/each}
		</div>
	{/if}

	<!-- 4. VALIDATION INLINE & BOUTON D'ENVOI -->
	<div class="flex items-center justify-between gap-2 pt-1 border-t border-border/50 text-xs">
		<!-- Feedback de validation en direct -->
		<div class="flex items-center gap-1.5 flex-1 text-[11px]">
			{#if validation.valid}
				<span class="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
					<CheckCircle2 class="h-3.5 w-3.5" />
					<span>Argument conforme aux exigences</span>
				</span>
				{#if extracted.agentMentions.length > 0}
					<span class="text-purple-600 font-mono text-[10px] px-1.5 py-0.2 rounded bg-purple-500/10">
						+ Invoquera @{extracted.agentMentions.join(', @')}
					</span>
				{/if}
			{:else}
				<span class="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
					<AlertCircle class="h-3.5 w-3.5 shrink-0" />
					<span>{validation.reason}</span>
				</span>
			{/if}
		</div>

		<!-- Bouton d'envoi -->
		<button
			type="button"
			disabled={!validation.valid || isSubmitting}
			onclick={handleSubmit}
			class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold shadow-xs transition-colors cursor-pointer shrink-0"
			title={validation.valid ? 'Publier cet argument' : 'Remplissez le fondement requis pour publier'}
		>
			<Send class="h-3.5 w-3.5" />
			<span>{isSubmitting ? 'Publication...' : 'Partager l’argument'}</span>
		</button>
	</div>
</div>

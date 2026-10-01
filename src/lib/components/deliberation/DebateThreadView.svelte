<script lang="ts">
	import {
		MessagesSquare,
		Bot,
		UserCheck,
		AlertTriangle,
		CheckCircle2,
		ShieldCheck,
		Scale,
		HelpCircle,
		Send,
		Play,
		RefreshCw,
		Check,
		X,
		Sparkles,
		Flame,
		ShieldAlert
	} from 'lucide-svelte';
	import type { Argument, Stance, ArgumentResolution } from '$lib/domain/debate';
	import type { Option } from '$lib/domain/options';
	import { groupArgumentsByOption, countOpenObjections } from '$lib/domain/debate';

	let {
		projectId = '',
		subjectId = '',
		options = [],
		argumentsList = $bindable<Argument[]>([]),
		userRole = 'lead_architect',
		onArgumentAdded = () => {},
		onError = (msg: string) => {}
	}: {
		projectId: string;
		subjectId: string;
		options: Option[];
		argumentsList: Argument[];
		userRole?: string;
		onArgumentAdded?: () => void;
		onError?: (msg: string) => void;
	} = $props();

	let isDebating = $state(false);
	let filterOptionId = $state<string | 'all'>('all');

	// Formulaire de contribution humaine
	let humanClaim = $state('');
	let humanGrounds = $state('');
	let humanStance = $state<Stance>('objection');
	let humanOptionId = $state<string>('');
	let formError = $state<string | null>(null);

	// Action de résolution d'objection
	let resolvingArgId = $state<string | null>(null);

	// Feedback sur verdict doctrinal (Lot A9)
	let feedbackArg = $state<Argument | null>(null);
	let feedbackRationale = $state('');
	let feedbackSuggestedAction = $state<'add_test_case' | 'propose_amendment' | 'clarify_rule'>('add_test_case');
	let isSubmittingFeedback = $state(false);
	let feedbackSuccessMsg = $state<string | null>(null);

	function openVerdictFeedbackModal(arg: Argument) {
		feedbackArg = arg;
		feedbackRationale = '';
		feedbackSuggestedAction = 'add_test_case';
		feedbackSuccessMsg = null;
	}

	async function handleSubmitVerdictFeedback() {
		if (!feedbackArg || !feedbackRationale.trim()) {
			return;
		}
		isSubmittingFeedback = true;
		try {
			const res = await fetch('/api/knowledge/verdict-feedback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					subject_id: subjectId,
					option_id: feedbackArg.optionId || 'transverse',
					rule_id: feedbackArg.kbRefs?.[0] || 'RULE-DEF',
					verdict_status: feedbackArg.stance === 'objection' ? 'violates' : 'supports',
					disagree_rationale: feedbackRationale,
					suggested_action: feedbackSuggestedAction
				})
			});
			if (res.ok) {
				feedbackSuccessMsg = 'Votre retour a été transmis à la gouvernance de la doctrine.';
				setTimeout(() => {
					feedbackArg = null;
					feedbackSuccessMsg = null;
				}, 1500);
			} else {
				const err = await res.json().catch(() => ({}));
				alert(err.error || 'Erreur lors de la transmission du retour');
			}
		} catch (err: any) {
			alert(err.message || 'Erreur réseau');
		} finally {
			isSubmittingFeedback = false;
		}
	}

	const grouped = $derived(groupArgumentsByOption(argumentsList));
	const openObjectionsCount = $derived(countOpenObjections(argumentsList));
	const transverseCount = $derived(argumentsList.filter((a) => !a.optionId).length);

	async function handleLaunchDebate() {
		if (isDebating) return;
		isDebating = true;
		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/debate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ maxRounds: 3 })
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || 'Erreur lors du lancement du débat multi-agents');
			}

			// Recharger les arguments
			const argsRes = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/arguments`);
			if (argsRes.ok) {
				argumentsList = await argsRes.json();
			}
			onArgumentAdded();
		} catch (err: any) {
			onError(err.message);
		} finally {
			isDebating = false;
		}
	}

	async function handlePostHumanArgument() {
		const claim = humanClaim.trim();
		const grounds = humanGrounds.trim();

		if (!claim) {
			formError = "L'affirmation courte ('claim') est obligatoire.";
			return;
		}
		if (!grounds) {
			formError = "Le fondement technique ou factuel ('grounds') est obligatoire.";
			return;
		}

		formError = null;

		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/arguments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					optionId: humanOptionId || null,
					stance: humanStance,
					claim,
					grounds,
					confidence: 'verified'
				})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || "Erreur lors de l'envoi de l'argument");
			}

			const created = await res.json();
			argumentsList = [...argumentsList, created];
			humanClaim = '';
			humanGrounds = '';
			onArgumentAdded();
		} catch (err: any) {
			formError = err.message;
		}
	}

	async function handleResolveObjection(arg: Argument, resolution: ArgumentResolution) {
		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/arguments/${arg.id}/resolve`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					resolution,
					expectedVersion: arg.version
				})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || "Impossible de mettre à jour l'objection");
			}

			const updated = await res.json();
			const idx = argumentsList.findIndex((a) => a.id === arg.id);
			if (idx >= 0) {
				argumentsList[idx] = updated;
			}
			resolvingArgId = null;
		} catch (err: any) {
			onError(err.message);
		}
	}

	function getStanceBadge(stance: Stance) {
		switch (stance) {
			case 'support':
				return { label: 'Soutien', bg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20' };
			case 'objection':
				return { label: 'Objection', bg: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20' };
			case 'verification':
				return { label: 'Vérification KB', bg: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20' };
			case 'synthesis':
				return { label: 'Synthèse', bg: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20' };
			case 'question':
				return { label: 'Question', bg: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20' };
			default:
				return { label: stance, bg: 'bg-muted text-muted-foreground' };
		}
	}
</script>

<div class="space-y-4">
	<!-- En-tête du Débat Dialectique -->
	<div class="flex items-center justify-between gap-3 flex-wrap border-b pb-3">
		<div class="flex items-center gap-2">
			<MessagesSquare class="h-4 w-4 text-blue-500" />
			<h4 class="text-xs font-bold text-foreground">
				Débat Dialectique Multi-Agents ({argumentsList.length} arguments)
			</h4>
			{#if openObjectionsCount > 0}
				<span class="font-mono text-[10px] px-2 py-0.5 rounded font-bold bg-destructive/10 text-destructive border border-destructive/20">
					{openObjectionsCount} objection{openObjectionsCount > 1 ? 's' : ''} non levée{openObjectionsCount > 1 ? 's' : ''}
				</span>
			{:else}
				<span class="font-mono text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
					Objections levées
				</span>
			{/if}
		</div>

		<div class="flex items-center gap-2 flex-wrap">
			<button
				type="button"
				onclick={handleLaunchDebate}
				disabled={isDebating || options.length === 0}
				class="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 text-white px-3 py-1.5 text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
				title="Déclenche un cycle de débat contradictoire (Proposer, Challenger, Verifier, Synthesizer) sur 3 tours maximum"
			>
				{#if isDebating}
					<RefreshCw class="h-3.5 w-3.5 animate-spin" />
					<span>Débat en cours...</span>
				{:else}
					<Play class="h-3.5 w-3.5 fill-current" />
					<span>Lancer le débat multi-agents (3 tours)</span>
				{/if}
			</button>
		</div>
	</div>

	<!-- Filtre par option -->
	{#if options.length > 0}
		<div class="flex items-center gap-1.5 overflow-x-auto text-xs pb-1">
			<span class="text-[11px] text-muted-foreground shrink-0 font-medium">Filtrer :</span>
			<button
				type="button"
				onclick={() => (filterOptionId = 'all')}
				class="px-2.5 py-0.5 rounded-full border text-[11px] font-semibold transition-all {filterOptionId === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground hover:bg-muted'}"
			>
				Tous ({argumentsList.length})
			</button>
			{#each options as opt}
				{@const count = argumentsList.filter((a) => a.optionId === opt.id).length}
				<button
					type="button"
					onclick={() => (filterOptionId = opt.id)}
					class="px-2.5 py-0.5 rounded-full border text-[11px] font-semibold transition-all truncate max-w-[200px] {filterOptionId === opt.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground hover:bg-muted'}"
				>
					{opt.title} ({count})
				</button>
			{/each}
			{#if transverseCount > 0}
				<button
					type="button"
					onclick={() => (filterOptionId = '')}
					class="px-2.5 py-0.5 rounded-full border text-[11px] font-semibold transition-all {filterOptionId === '' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground hover:bg-muted'}"
				>
					Synthèses transverses ({transverseCount})
				</button>
			{/if}
		</div>
	{/if}

	<!-- Liste des arguments -->
	<div class="space-y-3 max-h-[460px] overflow-y-auto pr-1">
		{#if argumentsList.length === 0}
			<div class="p-8 text-center text-xs text-muted-foreground border rounded-xl bg-card space-y-2">
				<p class="font-semibold text-foreground">Aucun argument versé pour l'instant.</p>
				<p>Cliquez sur « Lancer le débat multi-agents » pour générer les arguments contradictoires ou saisissez votre premier avis ci-dessous.</p>
			</div>
		{:else}
			{#each argumentsList as arg}
				{#if filterOptionId === 'all' || (filterOptionId === '' && !arg.optionId) || arg.optionId === filterOptionId}
					{@const opt = options.find((o) => o.id === arg.optionId)}
					{@const stanceInfo = getStanceBadge(arg.stance)}
					{@const isAgent = arg.authorKind.startsWith('agent:')}
					{@const isObjectionOpen = arg.stance === 'objection' && arg.resolution === 'open'}

					<div class="rounded-xl border bg-card p-3 space-y-2 shadow-2xs transition-all {isObjectionOpen ? 'border-rose-500/40 bg-rose-500/[0.02]' : ''}">
						<div class="flex items-center justify-between gap-2 flex-wrap text-xs">
							<div class="flex items-center gap-1.5">
								{#if isAgent}
									<span class="p-0.5 rounded bg-purple-500/10 text-purple-600"><Bot class="h-3.5 w-3.5" /></span>
								{:else}
									<span class="p-0.5 rounded bg-emerald-500/10 text-emerald-600"><UserCheck class="h-3.5 w-3.5" /></span>
								{/if}
								<strong class="text-foreground">{arg.author}</strong>
								<span class="font-mono text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
									{arg.authorKind}
								</span>
								<span class="font-mono text-[10px] px-1.5 py-0.2 rounded font-bold border {stanceInfo.bg}">
									{stanceInfo.label}
								</span>
								{#if opt}
									<span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-foreground">
										Option: {opt.title}
									</span>
								{/if}
							</div>

							<div class="flex items-center gap-2">
								<span class="font-mono text-[10px] text-muted-foreground">Tour {arg.round}</span>
								{#if arg.stance === 'objection'}
									<span class="font-mono text-[10px] px-1.5 py-0.2 rounded font-bold {arg.resolution === 'open' ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}">
										{arg.resolution === 'open' ? 'À traiter' : arg.resolution === 'accepted_risk' ? 'Risque accepté' : 'Répondue'}
									</span>
								{/if}
							</div>
						</div>

						<!-- Claim -->
						<h5 class="text-xs font-bold text-foreground">
							{arg.claim}
						</h5>

						<!-- Grounds (Fondement factuel / technique) -->
						<p class="text-xs text-muted-foreground leading-relaxed pl-3 border-l-2 border-primary/30">
							<strong>Fondement :</strong> {arg.grounds}
						</p>

						<!-- Références KB -->
						{#if arg.kbRefs && arg.kbRefs.length > 0}
							<div class="flex items-center justify-between gap-1.5 flex-wrap pt-1">
								<div class="flex items-center gap-1.5 flex-wrap">
									<span class="text-[10px] text-muted-foreground font-semibold">Doctrine citée :</span>
									{#each arg.kbRefs as ref}
										<span class="font-mono text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 font-bold">
											§ {ref}
										</span>
									{/each}
								</div>

								<button
									type="button"
									onclick={() => openVerdictFeedbackModal(arg)}
									class="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
									title="Signaler un désaccord ou une contestation sur cette règle doctrinale"
								>
									<AlertTriangle class="h-3 w-3" />
									<span>Signaler un désaccord</span>
								</button>
							</div>
						{/if}

						<!-- Actions Humaines sur l'Objection (Invariant III) -->
						{#if isObjectionOpen}
							<div class="pt-2 border-t flex items-center justify-between gap-2 flex-wrap text-xs">
								<div class="text-[11px] text-rose-700 dark:text-rose-400 font-semibold flex items-center gap-1">
									<ShieldAlert class="h-3.5 w-3.5" />
									<span>Objection bloquante pour l'arbitrage L3</span>
								</div>

								<div class="flex items-center gap-1.5">
									<button
										type="button"
										onclick={() => handleResolveObjection(arg, 'accepted_risk')}
										class="px-2.5 py-1 rounded-md border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-semibold transition-colors cursor-pointer"
										title="Accepter souverainement le risque opérationnel documenté"
									>
										Accepter le risque
									</button>
									<button
										type="button"
										onclick={() => handleResolveObjection(arg, 'answered')}
										class="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
										title="Déclarer l'objection traitée par un choix d'ingénierie"
									>
										Lever l'objection
									</button>
								</div>
							</div>
						{/if}
					</div>
				{/if}
			{/each}
		{/if}
	</div>

	<!-- Formulaire d'Intervention Humaine au Débat -->
	<div class="rounded-xl border bg-card p-3.5 space-y-3 shadow-2xs">
		<div class="flex items-center gap-1.5 text-xs font-bold text-foreground">
			<UserCheck class="h-4 w-4 text-emerald-600" />
			<span>Intervenir dans le débat (Contribution Humaine)</span>
		</div>

		{#if formError}
			<div class="rounded-lg bg-destructive/10 border border-destructive/25 p-2 text-destructive text-xs font-medium">
				{formError}
			</div>
		{/if}

		<div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
			<div>
				<label for="human-stance" class="font-bold text-foreground block mb-1">Position (Stance)</label>
				<select
					id="human-stance"
					bind:value={humanStance}
					class="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs text-foreground"
				>
					<option value="objection">Objection (Signaler un risque / faille)</option>
					<option value="support">Soutien (Défendre un argument fort)</option>
					<option value="question">Question (Demander un éclaircissement)</option>
					<option value="synthesis">Synthèse (Poser un compromis)</option>
				</select>
			</div>

			<div>
				<label for="human-option" class="font-bold text-foreground block mb-1">Option ciblée</label>
				<select
					id="human-option"
					bind:value={humanOptionId}
					class="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs text-foreground"
				>
					<option value="">Transverse (Toutes options)</option>
					{#each options as opt}
						<option value={opt.id}>{opt.title}</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="space-y-2 text-xs">
			<div>
				<label for="human-claim" class="font-bold text-foreground block mb-1">Affirmation courte (Claim) *</label>
				<input
					id="human-claim"
					type="text"
					bind:value={humanClaim}
					placeholder="ex: Incompatibilité avec l'exigence de résilience sans connectivité externe"
					class="w-full rounded-md border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
				/>
			</div>

			<div>
				<label for="human-grounds" class="font-bold text-foreground block mb-1">Fondement technique / factuel (Grounds) *</label>
				<textarea
					id="human-grounds"
					bind:value={humanGrounds}
					rows={2}
					placeholder="Démontrez votre affirmation avec des chiffres, faits concrets, retours d'expérience ou contraintes d'exploitation..."
					class="w-full rounded-md border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
				></textarea>
			</div>
		</div>

		<div class="flex justify-end pt-1">
			<button
				type="button"
				onclick={handlePostHumanArgument}
				class="inline-flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
			>
				<Send class="h-3.5 w-3.5" />
				<span>Verser au débat</span>
			</button>
		</div>
	</div>

	<!-- Modale de Signalement de Désaccord sur Verdict Doctrinal (Lot A9) -->
	{#if feedbackArg}
		<div class="fixed inset-0 bg-surface-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
			<div class="bg-card text-card-foreground rounded-xl shadow-xl border max-w-lg w-full p-5 space-y-4">
				<div class="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
					<AlertTriangle class="h-5 w-5" />
					<h3 class="text-base font-bold text-foreground">Signaler un désaccord sur la doctrine</h3>
				</div>

				<div class="text-xs p-3 rounded-lg bg-muted border space-y-1">
					<div><strong>Argument ciblé :</strong> {feedbackArg.claim}</div>
					{#if feedbackArg.kbRefs && feedbackArg.kbRefs.length > 0}
						<div class="font-mono text-primary"><strong>Règle KB :</strong> {feedbackArg.kbRefs.join(', ')}</div>
					{/if}
				</div>

				{#if feedbackSuccessMsg}
					<div class="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 text-emerald-800 dark:text-emerald-300 text-xs rounded-lg font-semibold flex items-center gap-2">
						<CheckCircle2 class="h-4 w-4" />
						<span>{feedbackSuccessMsg}</span>
					</div>
				{/if}

				<div>
					<label for="feedbackRationale" class="block text-xs font-semibold text-foreground mb-1">
						Motif du désaccord / Contestation technique *
					</label>
					<textarea
						id="feedbackRationale"
						bind:value={feedbackRationale}
						rows="3"
						placeholder="Expliquez pourquoi le verdict doctrinal est inadapté ou contredit les impératifs du projet..."
						class="w-full rounded-md border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
					></textarea>
				</div>

				<div>
					<label for="feedbackActionSelect" class="block text-xs font-semibold text-foreground mb-1">
						Action recommandée pour la gouvernance
					</label>
					<select
						id="feedbackActionSelect"
						bind:value={feedbackSuggestedAction}
						class="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs text-foreground focus:ring-2 focus:ring-primary"
					>
						<option value="add_test_case">Créer un nouveau cas de test d'évaluation (Banc de test)</option>
						<option value="propose_amendment">Proposer un amendement doctrinal officiel</option>
						<option value="clarify_rule">Demander une clarification de la règle au propriétaire</option>
					</select>
				</div>

				<div class="flex items-center justify-end gap-2 pt-2 border-t">
					<button
						type="button"
						onclick={() => (feedbackArg = null)}
						class="px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted rounded-md transition-colors cursor-pointer"
					>
						Annuler
					</button>
					<button
						type="button"
						onclick={handleSubmitVerdictFeedback}
						disabled={isSubmittingFeedback || !feedbackRationale.trim()}
						class="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md shadow-xs transition-colors cursor-pointer"
					>
						{#if isSubmittingFeedback}
							Envoi en cours...
						{:else}
							Transmettre à la gouvernance
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { Argument, ArgumentResolution, Stance } from '$lib/domain/debate';
	import {
		formatMaturityMilestoneSeparator,
		canCloseObjection
	} from '$lib/domain/debate';
	import SubjectMessageBubble from './SubjectMessageBubble.svelte';
	import PinnedObjections from './PinnedObjections.svelte';
	import {
		Bot,
		UserCheck,
		FolderLock,
		Play,
		Send,
		AlertTriangle,
		ArrowLeft,
		Sparkles,
		RotateCcw,
		HelpCircle
	} from 'lucide-svelte';

	let {
		subjectId = '',
		projectId = '',
		userRole = 'lead_architect',
		isHumanUser = true,
		isDossierOpen = true,
		onToggleDossier = () => {},
		onBackToBoard = () => {}
	}: {
		subjectId: string;
		projectId: string;
		userRole?: string;
		isHumanUser?: boolean;
		isDossierOpen?: boolean;
		onToggleDossier?: () => void;
		onBackToBoard?: () => void;
	} = $props();

	let argumentsList = $state<Argument[]>([]);
	let isLoadingArguments = $state(false);
	let isDebating = $state(false);

	// Formulaire de saisie rapide d'intervention humaine
	let humanClaim = $state('');
	let humanGrounds = $state('');
	let humanStance = $state<Stance>('support');
	let isPostingHumanArg = $state(false);
	let postError = $state<string | null>(null);

	const activeSubject = $derived(deliberationStore.activeSubject);

	// Objections ouvertes (épinglées en haut)
	const openObjections = $derived(
		argumentsList.filter((a) => a.stance === 'objection' && a.resolution === 'open')
	);

	$effect(() => {
		if (subjectId && projectId) {
			loadArguments();
		}
	});

	async function loadArguments() {
		if (!projectId || !subjectId) return;
		isLoadingArguments = true;
		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/arguments`);
			if (res.ok) {
				const data = await res.json();
				argumentsList = Array.isArray(data) ? data : (data.arguments || []);
			} else {
				argumentsList = [];
			}
		} catch (err) {
			console.warn('[Fil Sujet] Erreur chargement arguments:', err);
			argumentsList = [];
		} finally {
			isLoadingArguments = false;
		}
	}

	async function handleLaunchDebate() {
		if (isDebating || !projectId || !subjectId) return;
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

			await loadArguments();
			deliberationStore.logNotification('Débat contradictoire multi-agents exécuté.', 'success');
		} catch (err: any) {
			deliberationStore.logNotification(err.message || 'Erreur lors du débat', 'warning');
		} finally {
			isDebating = false;
		}
	}

	async function handleResolveArgument(arg: Argument, resolution: ArgumentResolution) {
		if (!projectId || !subjectId) return;
		try {
			const res = await fetch(
				`/api/projects/${projectId}/subjects/${subjectId}/arguments/${arg.id}/resolve`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						resolution,
						expectedVersion: arg.version
					})
				}
			);

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || "Erreur lors de la résolution de l'argument");
			}

			const updated = await res.json();
			const idx = argumentsList.findIndex((a) => a.id === arg.id);
			if (idx !== -1) {
				argumentsList[idx] = updated;
			}
			deliberationStore.logNotification(`Statut de l'objection mis à jour : ${resolution}`, 'success');
		} catch (err: any) {
			deliberationStore.logNotification(err.message, 'warning');
		}
	}

	async function handlePostHumanArgument() {
		const claim = humanClaim.trim();
		const grounds = humanGrounds.trim();
		if (!claim) {
			postError = "L'affirmation ('claim') est obligatoire.";
			return;
		}
		if (!grounds) {
			postError = "Le fondement ('grounds') est obligatoire (Invariant IV).";
			return;
		}

		postError = null;
		isPostingHumanArg = true;

		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/arguments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					stance: humanStance,
					claim,
					grounds,
					confidence: 'designed',
					kbRefs: []
				})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || "Erreur lors de l'enregistrement de l'argument");
			}

			const created = await res.json();
			argumentsList = [...argumentsList, created];
			humanClaim = '';
			humanGrounds = '';
			deliberationStore.logNotification('Argument humain ajouté au fil du sujet.', 'success');
		} catch (err: any) {
			postError = err.message || 'Erreur lors de la publication';
		} finally {
			isPostingHumanArg = false;
		}
	}

	function getLevelBadgeClass(level: string) {
		switch (level) {
			case 'L0_named': return 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20';
			case 'L1_framed': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
			case 'L2_decomposed': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
			case 'L3_decided': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
			case 'L4_specified': return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20';
			case 'L5_archived': return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
			default: return 'bg-muted text-muted-foreground';
		}
	}
</script>

<div class="flex flex-col h-full bg-card rounded-xl border shadow-xs overflow-hidden">
	<!-- En-tête du fil : Sujet actif, statut, bouton dossier & bouton tableau -->
	<div class="p-3.5 border-b bg-muted/20 flex items-center justify-between gap-3 flex-wrap shrink-0">
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={onBackToBoard}
				class="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer mr-1"
				title="Revenir au tableau de maturité"
			>
				<ArrowLeft class="h-3.5 w-3.5" />
				<span>Tableau</span>
			</button>

			<div>
				<div class="flex items-center gap-2">
					<span class="font-mono text-xs font-bold text-muted-foreground">
						{activeSubject?.section_ref || '§'}
					</span>
					<h2 class="text-sm font-bold text-foreground leading-none">
						{activeSubject?.name || 'Sujet non sélectionné'}
					</h2>
					{#if activeSubject}
						<span class="inline-flex items-center rounded px-2 py-0.5 font-mono text-[10px] font-semibold border {getLevelBadgeClass(activeSubject.level)}">
							{activeSubject.level}
						</span>
					{/if}
				</div>
				<div class="text-[11px] text-muted-foreground mt-0.5">
					Attente : <strong class="text-foreground">{activeSubject?.waiting_for_role || '—'}</strong> · Effort : <span class="font-mono">{activeSubject?.relative_effort || 'M'}</span>
				</div>
			</div>
		</div>

		<div class="flex items-center gap-2">
			<!-- Lancer le débat multi-agents -->
			<button
				type="button"
				disabled={isDebating}
				onclick={handleLaunchDebate}
				class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
				title="Déclencher les agents Proposer, Challenger et Synthesizer"
			>
				{#if isDebating}
					<RotateCcw class="h-3.5 w-3.5 animate-spin" />
					<span>Débat en cours...</span>
				{:else}
					<Sparkles class="h-3.5 w-3.5" />
					<span>Débat multi-agents</span>
				{/if}
			</button>

			<!-- Toggle pour replier/déplier le dossier de droite -->
			<button
				type="button"
				onclick={onToggleDossier}
				class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer {isDossierOpen
					? 'bg-primary/10 border-primary/30 text-primary'
					: 'bg-background hover:bg-muted text-foreground'}"
				title="Afficher ou masquer le dossier de consultation à droite"
			>
				<FolderLock class="h-3.5 w-3.5" />
				<span>{isDossierOpen ? 'Masquer dossier' : 'Ouvrir dossier'}</span>
			</button>
		</div>
	</div>

	<!-- Corps du fil des arguments et messages -->
	<div class="flex-1 overflow-y-auto p-4 space-y-4">
		<!-- 1. Objections ouvertes épinglées en haut du fil -->
		{#if openObjections.length > 0}
			<PinnedObjections
				objections={openObjections}
				{userRole}
				{isHumanUser}
				onResolve={handleResolveArgument}
			/>
		{/if}

		<!-- Séparateur de jalon de maturité initial -->
		{#if activeSubject}
			<div class="flex items-center justify-center my-3">
				<span class="px-3 py-1 rounded-full bg-muted/80 text-[11px] font-mono font-medium text-muted-foreground border border-border/60">
					{formatMaturityMilestoneSeparator(activeSubject.level)}
				</span>
			</div>
		{/if}

		<!-- Liste des messages de délibération -->
		{#if isLoadingArguments}
			<div class="p-8 text-center text-xs text-muted-foreground animate-pulse">
				Chargement de la conversation...
			</div>
		{:else if argumentsList.length === 0}
			<div class="p-8 text-center border-2 border-dashed rounded-xl space-y-2 bg-muted/10">
				<Bot class="h-8 w-8 text-muted-foreground/60 mx-auto" />
				<h4 class="text-xs font-bold text-foreground">Aucun argument pour ce sujet</h4>
				<p class="text-xs text-muted-foreground max-w-sm mx-auto">
					Lancez le <strong>débat multi-agents</strong> pour générer la confrontation initiale d'options ou postez votre première remarque ci-dessous.
				</p>
			</div>
		{:else}
			{#each argumentsList as arg (arg.id)}
				{@const targetArg = arg.targetArgumentId
					? argumentsList.find((a) => a.id === arg.targetArgumentId) || null
					: null}

				<SubjectMessageBubble
					argument={arg}
					targetArgument={targetArg}
					{userRole}
					{isHumanUser}
					onResolve={handleResolveArgument}
				/>
			{/each}
		{/if}
	</div>

	<!-- Formulaire d'intervention rapide (avant le composeur structuré A25) -->
	<div class="p-3 border-t bg-muted/20 space-y-2.5 shrink-0">
		<div class="flex items-center justify-between text-xs font-bold text-foreground">
			<div class="flex items-center gap-1.5">
				<UserCheck class="h-4 w-4 text-emerald-600" />
				<span>Votre avis sur ce sujet</span>
			</div>

			<div class="flex items-center gap-2">
				<label for="quick-stance" class="text-[11px] font-semibold text-muted-foreground">Posture :</label>
				<select
					id="quick-stance"
					bind:value={humanStance}
					class="px-2 py-0.5 text-xs rounded border bg-background text-foreground"
				>
					<option value="support">Soutien</option>
					<option value="objection">Objection</option>
					<option value="question">Question</option>
					<option value="verification">Vérification</option>
					<option value="synthesis">Synthèse</option>
				</select>
			</div>
		</div>

		{#if postError}
			<div class="p-2 rounded bg-destructive/10 text-destructive text-xs font-medium">
				{postError}
			</div>
		{/if}

		<div class="space-y-1.5">
			<input
				type="text"
				bind:value={humanClaim}
				placeholder="Affirmation courte ('claim')..."
				class="w-full px-2.5 py-1.5 text-xs rounded-lg border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
			/>
			<div class="flex items-center gap-2">
				<input
					type="text"
					bind:value={humanGrounds}
					placeholder="Fondement technique ou factuel obligatoire ('grounds')..."
					class="flex-1 px-2.5 py-1.5 text-xs rounded-lg border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
				/>
				<button
					type="button"
					disabled={isPostingHumanArg || !humanClaim.trim() || !humanGrounds.trim()}
					onclick={handlePostHumanArgument}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 text-xs font-semibold shadow-2xs transition-colors cursor-pointer shrink-0"
				>
					<Send class="h-3.5 w-3.5" />
					<span>Poster</span>
				</button>
			</div>
		</div>
	</div>
</div>

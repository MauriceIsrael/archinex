<script lang="ts">
	import type { Option, Decision } from '$lib/domain/options';
	import type { ExtractedFact } from '$lib/server/agents/factExtractor';
	import {
		Gavel,
		CheckCircle2,
		AlertTriangle,
		ShieldAlert,
		ShieldCheck,
		Lock,
		Check,
		Clock,
		Sparkles,
		UserCheck,
		Info,
		Bot,
		ChevronRight,
		ExternalLink
	} from 'lucide-svelte';

	let {
		projectId = '',
		subjectId = '',
		decision = null as any,
		options = [] as Option[],
		sessionUser = { id: '', email: '', role: 'lead_architect' },
		isHubCutover = false,
		onAffirmed = () => {}
	}: {
		projectId?: string;
		subjectId?: string;
		decision?: any;
		options?: Option[];
		sessionUser?: { id: string; email: string; name?: string; role: string };
		isHubCutover?: boolean;
		onAffirmed?: (result: any) => void;
	} = $props();

	let facts = $state<ExtractedFact[]>([]);
	let isExtractingFacts = $state(false);
	let isSubmittingAssert = $state(false);
	let assertError = $state('');
	let assertSuccess = $state('');

	const retainedOption = $derived(
		options.find((o) => o.id === decision?.retainedOptionId) || null
	);

	const rejectedOptions = $derived<Array<{ optionId: string; reason: string }>>(
		Array.isArray(decision?.rejected)
			? decision.rejected
			: typeof decision?.rejected === 'string'
				? JSON.parse(decision.rejected || '[]')
				: []
	);

	const acceptedViolations = $derived<Array<{ typedId: string; justification: string }>>(
		Array.isArray(decision?.acceptedViolations)
			? decision.acceptedViolations
			: typeof decision?.acceptedViolations === 'string'
				? JSON.parse(decision.acceptedViolations || '[]')
				: []
	);

	// Auteur de la décision vs utilisateur de la session
	const isAuthor = $derived.by(() => {
		if (!decision) return false;
		const authorId = decision.arbiterId || decision.authorId;
		const userEmail = (sessionUser.email || '').toLowerCase();
		const userId = sessionUser.id;
		return (
			authorId === userId ||
			(authorId && authorId.toLowerCase() === userEmail) ||
			(authorId && authorId.includes(userEmail))
		);
	});

	// Rôle de décideur qualifié (K16)
	const isQualifiedDecider = $derived.by(() => {
		const r = (sessionUser.role || '').toLowerCase();
		return (
			r === 'decider' ||
			r === 'domain_expert' ||
			r === 'lead_architect' ||
			r === 'admin' ||
			r.includes('architect') ||
			r.includes('expert')
		);
	});

	// Le bouton "Affirmer" est STRICTEMENT visible pour un valideur distinct qualifié
	const canAffirm = $derived(!isAuthor && isQualifiedDecider && !decision?.validatedBy);

	$effect(() => {
		if (decision && facts.length === 0) {
			loadOrExtractFacts();
		}
	});

	async function loadOrExtractFacts() {
		if (!decision || isExtractingFacts) return;
		isExtractingFacts = true;
		try {
			const res = await fetch(
				`/api/projects/${projectId}/subjects/${subjectId}/decision/extract-facts`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						decisionRationale: decision.rationale || '',
						retainedOptionTitle: retainedOption?.title || decision.retainedOptionId || '',
						retainedOptionSummary: retainedOption?.summary || ''
					})
				}
			);

			if (res.ok) {
				const data = await res.json();
				facts = data.facts || [];
			}
		} catch (err) {
			console.warn('[DecisionSurveyCard] Erreur extraction faits :', err);
		} finally {
			isExtractingFacts = false;
		}
	}

	async function handleAssertDecision() {
		if (!canAffirm || isSubmittingAssert) return;
		isSubmittingAssert = true;
		assertError = '';
		assertSuccess = '';

		try {
			const res = await fetch(
				`/api/projects/${projectId}/subjects/${subjectId}/decision/assert`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						facts: facts.filter((f) => f.selected),
						idempotencyKey: `assert-${decision.id}-${sessionUser.email}`
					})
				}
			);

			const data = await res.json();
			if (!res.ok) {
				assertError = data.message || data.error || "Erreur lors de l'affirmation";
				return;
			}

			assertSuccess = data.milestone || 'Décision et faits affirmés avec succès (L3) !';
			onAffirmed(data);
		} catch (err: any) {
			assertError = err.message || 'Erreur réseau';
		} finally {
			isSubmittingAssert = false;
		}
	}
</script>

<div
	class="rounded-xl border border-border bg-card p-4 space-y-4 shadow-xs"
	data-testid="decision-survey-card"
>
	<!-- En-tête : Carte de décision sondage & Statut d'affirmation -->
	<div class="flex items-center justify-between gap-3 border-b pb-3">
		<div class="flex items-center gap-2">
			<div class="p-2 rounded-lg bg-primary/10 text-primary">
				<Gavel class="h-4 w-4" />
			</div>
			<div>
				<h3 class="text-sm font-bold text-foreground flex items-center gap-2">
					<span>Carte de Décision d'Architecture (Porte G3 / L3)</span>
					{#if decision?.validatedBy}
						<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
							<ShieldCheck class="h-3 w-3" />
							Scellée & Affirmée
						</span>
					{:else}
						<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
							<Clock class="h-3 w-3" />
							Proposition en attente d'affirmation
						</span>
					{/if}
				</h3>
				<p class="text-[11px] text-muted-foreground mt-0.5">
					Auteur initial : <strong class="text-foreground">{decision?.arbiterId || 'Architecte'}</strong>
					{#if decision?.decidedAt}
						· Rédigée le {new Date(decision.decidedAt).toLocaleDateString('fr-FR')}
					{/if}
				</p>
			</div>
		</div>

		{#if isHubCutover}
			<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30 text-[10px] font-mono font-bold">
				Hub SoR (K16)
			</span>
		{/if}
	</div>

	<!-- 1. Option retenue & réversibilité -->
	<div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
		<div class="p-3 rounded-lg bg-muted/20 border space-y-1">
			<span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
				Option Retenue
			</span>
			<strong class="text-xs font-bold text-foreground block">
				{retainedOption?.title || decision?.retainedOptionId}
			</strong>
			{#if retainedOption?.summary}
				<p class="text-[11px] text-muted-foreground">{retainedOption.summary}</p>
			{/if}
		</div>

		<div class="p-3 rounded-lg bg-muted/20 border space-y-1">
			<span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
				Réversibilité & Rationale
			</span>
			<div class="flex items-center gap-1.5">
				<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold {decision?.reversibility === 'reversible' ? 'bg-emerald-500/15 text-emerald-700' : decision?.reversibility === 'costly' ? 'bg-amber-500/15 text-amber-700' : 'bg-rose-500/15 text-rose-700'}">
					{decision?.reversibility || 'costly'}
				</span>
			</div>
			<p class="text-[11px] text-foreground italic mt-1">
				"{decision?.rationale || 'Aucune motivation renseignée'}"
			</p>
		</div>
	</div>

	<!-- 2. Options écartées & Violations acceptées -->
	{#if rejectedOptions.length > 0}
		<div class="space-y-1.5 text-xs">
			<span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
				Options Écartées & Motifs
			</span>
			<div class="space-y-1">
				{#each rejectedOptions as rej}
					{@const opt = options.find((o) => o.id === rej.optionId)}
					<div class="p-2 rounded-lg bg-muted/15 border flex items-start gap-1.5 text-[11px]">
						<ChevronRight class="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
						<div>
							<strong class="text-foreground">{opt?.title || rej.optionId} :</strong>
							<span class="text-muted-foreground ml-1">{rej.reason}</span>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- 3. FAITS MACHINE-LISIBLES (K18) : Cases pré-cochées et modifiables avec extrait source -->
	<div class="space-y-2 pt-1 border-t">
		<div class="flex items-center justify-between text-xs">
			<div class="flex items-center gap-1.5 font-bold text-foreground">
				<Bot class="h-4 w-4 text-indigo-500" />
				<span>Faits d'Architecture Affirmés (Modèle K18)</span>
				<span class="px-1.5 py-0.2 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25">
					llm-derived
				</span>
			</div>
			{#if isExtractingFacts}
				<span class="text-[10px] text-muted-foreground animate-pulse">Extraction en cours...</span>
			{/if}
		</div>

		<p class="text-[11px] text-muted-foreground">
			L'agent Synthesizer a extrait ces faits machine-lisibles contraints au vocabulaire de la base.
			<strong>Affirmer la décision, c'est affirmer ces faits.</strong>
		</p>

		{#if facts.length === 0}
			<div class="p-3 rounded-lg border border-dashed text-center text-xs text-muted-foreground">
				Aucun fait technique spécifique extrait ou reconnu pour ce sujet.
			</div>
		{:else}
			<div class="space-y-2">
				{#each facts as fact, idx}
					<div
						class="p-2.5 rounded-lg border transition-colors flex items-start gap-2.5 {fact.selected
							? 'bg-card border-primary/30 ring-1 ring-primary/20'
							: 'bg-muted/10 border-border opacity-60'}"
					>
						<input
							type="checkbox"
							bind:checked={fact.selected}
							class="mt-1 h-3.5 w-3.5 text-primary rounded cursor-pointer"
							id={`fact-${idx}`}
						/>

						<div class="flex-1 space-y-1 text-xs">
							<div class="flex items-center justify-between gap-2 flex-wrap">
								<label for={`fact-${idx}`} class="font-mono font-bold text-foreground text-[11px] cursor-pointer">
									{fact.key}
								</label>
								<span class="text-[10px] text-muted-foreground italic">
									Source : « {fact.source_excerpt || fact.value} »
								</span>
							</div>

							<!-- Valeur modifiable -->
							<input
								type="text"
								bind:value={fact.value}
								disabled={!fact.selected || Boolean(decision?.validatedBy)}
								class="w-full text-xs px-2 py-1 rounded border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
							/>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- 4. RÈGLE K16 & BOUTON D'AFFIRMATION -->
	<div class="pt-2 border-t space-y-2">
		{#if decision?.validatedBy}
			<div class="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center justify-between">
				<div class="flex items-center gap-2">
					<ShieldCheck class="h-4 w-4 text-emerald-600 shrink-0" />
					<span>Décision formellement affirmée par <strong>{decision.validatedBy}</strong></span>
				</div>
				<span class="font-mono text-[10px]">L3_decided</span>
			</div>
		{:else if isAuthor}
			<!-- L'auteur voit le refus et qui peut débloquer -->
			<div class="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
				<ShieldAlert class="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
				<div>
					<strong>Séparation des pouvoirs (K16) : Auto-validation interdite.</strong>
					<p class="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
						Vous êtes l'auteur de cette proposition de décision. Conformément à la gouvernance opposable,
						seul un <strong>décideur distinct</strong> (rôle decider ou lead_architect) peut prononcer l'affirmation.
					</p>
				</div>
			</div>
		{:else if canAffirm}
			<!-- Le décideur distinct voit le bouton actif -->
			<div class="flex items-center justify-between gap-3 flex-wrap">
				<div class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
					<UserCheck class="h-3.5 w-3.5 text-primary" />
					<span>
						En tant que <strong>{sessionUser.role}</strong> distinct de l'auteur, vous êtes habilité à affirmer.
					</span>
				</div>

				<button
					type="button"
					onclick={handleAssertDecision}
					disabled={isSubmittingAssert}
					class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
					data-testid="assert-decision-btn"
				>
					<Gavel class="h-3.5 w-3.5" />
					<span>{isSubmittingAssert ? 'Affirmation...' : 'Affirmer la décision et ses faits'}</span>
				</button>
			</div>
		{:else}
			<div class="p-2.5 rounded-lg bg-muted text-xs text-muted-foreground flex items-center gap-2">
				<Info class="h-3.5 w-3.5 shrink-0" />
				<span>En attente d'affirmation par un décideur qualifié (rôle decider ou lead_architect requis).</span>
			</div>
		{/if}

		{#if assertError}
			<div class="p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs">
				⚠️ {assertError}
			</div>
		{/if}

		{#if assertSuccess}
			<div class="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
				✅ {assertSuccess}
			</div>
		{/if}
	</div>
</div>

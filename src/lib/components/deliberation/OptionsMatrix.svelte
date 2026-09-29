<script lang="ts">
	import {
		Scale,
		Plus,
		CheckCircle2,
		AlertTriangle,
		Sparkles,
		UserCheck,
		Bot,
		Info,
		HelpCircle,
		ShieldAlert,
		Award,
		Sliders,
		Check,
		X
	} from 'lucide-svelte';
	import type {
		Criterion,
		Option,
		OptionEvaluation,
		TradeOff,
		Decision,
		CriterionKind,
		OptionOrigin
	} from '$lib/domain/options';
	import { weightedScore, validateEvaluation } from '$lib/domain/options';
	import CriteriaEditor from './CriteriaEditor.svelte';
	import OptionEditor from './OptionEditor.svelte';
	import TradeOffList from './TradeOffList.svelte';

	let {
		projectId = '',
		subjectId = '',
		criteria = $bindable<Criterion[]>([]),
		options = $bindable<Option[]>([]),
		evaluations = $bindable<OptionEvaluation[]>([]),
		tradeOffs = $bindable<TradeOff[]>([]),
		decision = $bindable<Decision | null>(null),
		userRole = 'lead_architect',
		onDecisionMade = () => {},
		onError = (msg: string) => {}
	}: {
		projectId: string;
		subjectId: string;
		criteria: Criterion[];
		options: Option[];
		evaluations: OptionEvaluation[];
		tradeOffs: TradeOff[];
		decision: Decision | null;
		userRole?: string;
		onDecisionMade?: (dec: Decision) => void;
		onError?: (msg: string) => void;
	} = $props();

	// Modal states
	let isAddingCriterion = $state(false);
	let isAddingOption = $state(false);
	let isEvaluatingCell = $state(false);
	let isDeciding = $state(false);

	// Cell evaluation state
	let activeOption = $state<Option | null>(null);
	let activeCriterion = $state<Criterion | null>(null);
	let cellScore = $state<number>(0);
	let cellJustification = $state<string>('');
	let cellError = $state<string | null>(null);

	// Decision state
	let selectedRetainedOptionId = $state<string>('');
	let decisionRationale = $state<string>('');
	let decisionReversibility = $state<'reversible' | 'costly' | 'irreversible'>('reversible');
	let decisionError = $state<string | null>(null);

	function getEvaluation(optionId: string, criterionId: string): OptionEvaluation | undefined {
		return evaluations.find((e) => e.optionId === optionId && e.criterionId === criterionId);
	}

	function getScoreBadge(score?: number) {
		if (score === undefined) return { label: '?', bg: 'bg-muted text-muted-foreground' };
		if (score >= 2) return { label: '++', bg: 'bg-emerald-600 text-white font-black' };
		if (score === 1) return { label: '+', bg: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold' };
		if (score === 0) return { label: '=', bg: 'bg-muted text-muted-foreground font-medium' };
		if (score === -1) return { label: '-', bg: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold' };
		return { label: '--', bg: 'bg-destructive text-destructive-foreground font-black' };
	}

	function formatKind(kind: CriterionKind): { label: string; color: string } {
		switch (kind) {
			case 'functional':
				return { label: 'Fonctionnel', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' };
			case 'nfr':
				return { label: 'Non-Fonctionnel', color: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' };
			case 'cost':
				return { label: 'Coût / TCO', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' };
			case 'risk':
				return { label: 'Risque', color: 'bg-rose-500/10 text-rose-700 dark:text-rose-400' };
			case 'compliance':
				return { label: 'Conformité', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' };
			default:
				return { label: kind, color: 'bg-muted text-muted-foreground' };
		}
	}

	function openEvaluationModal(opt: Option, crit: Criterion) {
		activeOption = opt;
		activeCriterion = crit;
		const existing = getEvaluation(opt.id, crit.id);
		cellScore = existing?.score ?? 0;
		cellJustification = existing?.justification ?? '';
		cellError = null;
		isEvaluatingCell = true;
	}

	async function handleSaveEvaluation() {
		if (!activeOption || !activeCriterion) return;

		const validation = validateEvaluation({
			optionId: activeOption.id,
			criterionId: activeCriterion.id,
			score: cellScore,
			justification: cellJustification,
			evidenceRefs: []
		});

		if (!validation.valid) {
			cellError = validation.reason || 'Justification obligatoire.';
			return;
		}

		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/evaluations`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					optionId: activeOption.id,
					criterionId: activeCriterion.id,
					score: cellScore,
					justification: cellJustification.trim(),
					evidenceRefs: []
				})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || 'Erreur lors de la sauvegarde de l\'évaluation');
			}

			const saved = await res.json();
			// Update local evaluations
			const idx = evaluations.findIndex(
				(e) => e.optionId === activeOption!.id && e.criterionId === activeCriterion!.id
			);
			if (idx >= 0) {
				evaluations[idx] = saved;
			} else {
				evaluations.push(saved);
			}

			isEvaluatingCell = false;
		} catch (err: any) {
			cellError = err.message;
		}
	}

	async function handleAddCriterion(data: { name: string; description: string; kind: CriterionKind; weight: number; kbRef?: string }) {
		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/criteria`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || 'Erreur lors de la création du critère');
			}

			const created = await res.json();
			criteria.push(created);
		} catch (err: any) {
			onError(err.message);
		}
	}

	async function handleAddOption(data: { title: string; summary: string; origin: OptionOrigin }) {
		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/options`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || 'Erreur lors de la création de l\'option');
			}

			const created = await res.json();
			options.push(created);
		} catch (err: any) {
			onError(err.message);
		}
	}

	async function handleAddTradeOff(data: { optionId: string; gains: string; sacrifices: string; criterionIds?: string[] }) {
		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/tradeoffs`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || 'Erreur lors de l\'enregistrement du compromis');
			}

			const created = await res.json();
			tradeOffs.push(created);
		} catch (err: any) {
			onError(err.message);
		}
	}

	function openDecisionModal() {
		selectedRetainedOptionId = decision?.retainedOptionId || options[0]?.id || '';
		decisionRationale = decision?.rationale || '';
		decisionReversibility = (decision?.reversibility as any) || 'reversible';
		decisionError = null;
		isDeciding = true;
	}

	async function handleSaveDecision() {
		if (!selectedRetainedOptionId) {
			decisionError = 'Veuillez sélectionner l\'option retenue.';
			return;
		}
		if (!decisionRationale.trim()) {
			decisionError = 'La justification formelle (rationale) de l\'arbitrage est obligatoire.';
			return;
		}

		try {
			const otherOptions = options.filter((o) => o.id !== selectedRetainedOptionId);
			const rejected = otherOptions.map((o) => ({
				optionId: o.id,
				reason: `Écartée au profit de l'option ${selectedRetainedOptionId}`
			}));

			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/decision`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					retainedOptionId: selectedRetainedOptionId,
					rationale: decisionRationale.trim(),
					reversibility: decisionReversibility,
					rejected
				})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message || 'Erreur lors de l\'enregistrement de la décision');
			}

			const savedDecision = await res.json();
			decision = savedDecision;
			isDeciding = false;
			onDecisionMade(savedDecision);
		} catch (err: any) {
			decisionError = err.message;
		}
	}
</script>

<div class="space-y-4">
	<!-- Barre d'actions et Synthèse de Décision -->
	<div class="flex items-center justify-between gap-3 flex-wrap">
		<div class="flex items-center gap-2">
			<Scale class="h-4 w-4 text-primary" />
			<h4 class="text-xs font-bold uppercase tracking-wider text-foreground">
				Matrice Multi-Critères & Alternatives ({options.length} options, {criteria.length} critères)
			</h4>
		</div>

		<div class="flex items-center gap-2 flex-wrap">
			<button
				type="button"
				onclick={() => (isAddingCriterion = true)}
				class="inline-flex items-center gap-1 rounded-lg border bg-card hover:bg-muted px-2.5 py-1 text-xs font-semibold text-foreground transition-colors"
			>
				<Plus class="h-3 w-3 text-primary" />
				<span>Ajouter un critère</span>
			</button>

			<button
				type="button"
				onclick={() => (isAddingOption = true)}
				class="inline-flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 px-2.5 py-1 text-xs font-semibold text-purple-800 dark:text-purple-300 transition-colors"
			>
				<Sparkles class="h-3 w-3 text-purple-600 dark:text-purple-400" />
				<span>Proposer une option</span>
			</button>

			<button
				type="button"
				onclick={openDecisionModal}
				class="inline-flex items-center gap-1 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1 text-xs font-bold shadow-xs transition-colors"
			>
				<Award class="h-3.5 w-3.5" />
				<span>{decision ? 'Modifier l\'arbitrage' : 'Trancher & Arbitrer (L3)'}</span>
			</button>
		</div>
	</div>

	<!-- Décision actée si existante -->
	{#if decision}
		{@const retained = options.find((o) => o.id === decision?.retainedOptionId)}
		<div class="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/[0.04] p-3.5 space-y-1.5">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<CheckCircle2 class="h-4 w-4 text-emerald-600" />
					<span class="text-xs font-bold text-emerald-800 dark:text-emerald-300">
						Option Retenue : {retained ? retained.title : decision.retainedOptionId}
					</span>
				</div>
				<span class="font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">
					{decision.reversibility === 'reversible' ? 'Réversible' : decision.reversibility === 'costly' ? 'Coûteux à inverser' : 'Irréversible'}
				</span>
			</div>
			<p class="text-xs text-muted-foreground leading-relaxed pl-6">
				<strong>Rationale :</strong> {decision.rationale}
			</p>
		</div>
	{/if}

	<!-- Grille Matrice -->
	{#if options.length === 0 || criteria.length === 0}
		<div class="p-8 text-center text-xs text-muted-foreground border rounded-xl bg-card space-y-2">
			<p class="font-semibold text-foreground">Matrice non alimentée.</p>
			<p>Générez les critères et options via l'élicitation LLM ou ajoutez-les manuellement ci-dessus.</p>
		</div>
	{:else}
		<div class="rounded-xl border bg-card overflow-x-auto shadow-2xs">
			<table class="w-full border-collapse text-xs">
				<thead>
					<tr class="bg-muted/50 border-b">
						<th class="p-2.5 text-left font-bold text-foreground min-w-[200px] border-r">
							Critères d'évaluation
						</th>
						{#each options as opt}
							{@const isRetained = decision?.retainedOptionId === opt.id}
							<th class="p-2.5 text-center min-w-[170px] border-r last:border-r-0 {isRetained ? 'bg-emerald-500/10' : ''}">
								<div class="space-y-1">
									<div class="flex items-center justify-center gap-1.5">
										{#if opt.origin === 'human'}
											<span class="p-0.5 rounded bg-blue-500/10 text-blue-600" title="Origine humaine"><UserCheck class="h-3 w-3" /></span>
										{:else if opt.origin === 'llm-proposed'}
											<span class="p-0.5 rounded bg-purple-500/10 text-purple-600" title="Généré par LLM"><Bot class="h-3 w-3" /></span>
										{:else}
											<span class="p-0.5 rounded bg-amber-500/10 text-amber-600" title="Pattern KB"><Award class="h-3 w-3" /></span>
										{/if}
										<span class="font-bold text-foreground line-clamp-1">{opt.title}</span>
									</div>
									<div class="flex items-center justify-center gap-1 flex-wrap">
										<span class="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-muted text-muted-foreground">
											{opt.productionMode}
										</span>
										{#if isRetained}
											<span class="text-[9px] font-bold uppercase px-1 py-0.2 rounded bg-emerald-600 text-white">
												Retenue
											</span>
										{/if}
									</div>
								</div>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each criteria as crit}
						{@const kindInfo = formatKind(crit.kind)}
						<tr class="border-b hover:bg-muted/20 transition-colors">
							<td class="p-2.5 border-r space-y-0.5">
								<div class="flex items-center justify-between gap-1">
									<strong class="text-foreground">{crit.name}</strong>
									<span class="font-mono text-[10px] px-1 py-0.2 rounded bg-muted font-bold" title="Poids du critère (1 à 5)">
										x{crit.weight}
									</span>
								</div>
								<div class="flex items-center gap-1.5 flex-wrap">
									<span class="text-[10px] px-1.5 py-0.2 rounded font-medium {kindInfo.color}">
										{kindInfo.label}
									</span>
									{#if crit.description}
										<span class="text-[11px] text-muted-foreground truncate max-w-[180px]" title={crit.description}>
											{crit.description}
										</span>
									{/if}
								</div>
							</td>

							{#each options as opt}
								{@const ev = getEvaluation(opt.id, crit.id)}
								{@const badge = getScoreBadge(ev?.score)}
								{@const isRetained = decision?.retainedOptionId === opt.id}
								<td class="p-2 text-center border-r last:border-r-0 {isRetained ? 'bg-emerald-500/[0.04]' : ''}">
									<button
										type="button"
										onclick={() => openEvaluationModal(opt, crit)}
										class="group relative inline-flex flex-col items-center justify-center w-full py-1.5 px-2 rounded-lg border border-transparent hover:border-primary/40 hover:bg-background transition-all cursor-pointer"
										title={ev ? `${ev.justification} (Score: ${ev.score})` : 'Cliquer pour évaluer ce critère'}
									>
										<span class="px-2 py-0.5 rounded text-xs {badge.bg}">
											{badge.label}
										</span>
										{#if ev?.justification}
											<span class="text-[10px] text-muted-foreground truncate max-w-[140px] mt-0.5 block italic">
												« {ev.justification} »
											</span>
										{:else}
											<span class="text-[10px] text-muted-foreground/60 mt-0.5 block group-hover:text-primary">
												Évaluer...
											</span>
										{/if}
									</button>
								</td>
							{/each}
						</tr>
					{/each}

					<!-- Ligne Score Pondéré Indicatif -->
					<tr class="bg-muted/40 font-bold border-t-2">
						<td class="p-2.5 border-r">
							<div class="space-y-0.5">
								<div class="flex items-center gap-1 text-foreground">
									<Award class="h-3.5 w-3.5 text-primary" />
									<span>Score Pondéré Indicatif</span>
								</div>
								<span class="text-[10px] text-muted-foreground font-normal block">
									Normalisé sur une échelle de -2.0 à +2.0
								</span>
							</div>
						</td>
						{#each options as opt}
							{@const score = weightedScore(opt.id, criteria, evaluations)}
							{@const isRetained = decision?.retainedOptionId === opt.id}
							<td class="p-2.5 text-center border-r last:border-r-0 {isRetained ? 'bg-emerald-500/10' : ''}">
								<div class="font-mono text-xs font-black {score >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}">
									{score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2)}
								</div>
							</td>
						{/each}
					</tr>
				</tbody>
			</table>
		</div>

		<!-- Avertissement constitutionnel sur le rôle du score -->
		<div class="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-2">
			<ShieldAlert class="h-4 w-4 shrink-0 text-amber-600" />
			<span>
				<strong>Règle de gouvernance :</strong> Le score pondéré est strictement indicatif et n'entraîne aucun arbitrage automatique. La décision finale et le choix des compromis incombent exclusivement au Lead Architect humain.
			</span>
		</div>
	{/if}

	<!-- Section Compromis & Trade-offs -->
	<TradeOffList
		{tradeOffs}
		{options}
		onAddTradeOff={handleAddTradeOff}
	/>
</div>

<!-- Modal Évaluation d'une Cellule -->
{#if isEvaluatingCell && activeOption && activeCriterion}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
		<div class="w-full max-w-md rounded-xl bg-card p-5 shadow-lg border space-y-4">
			<div class="flex items-center justify-between border-b pb-2">
				<div class="space-y-0.5">
					<h4 class="text-xs font-bold text-foreground">
						Évaluer : {activeOption.title}
					</h4>
					<span class="text-[11px] text-muted-foreground">
						Critère : <strong>{activeCriterion.name}</strong> (poids {activeCriterion.weight})
					</span>
				</div>
				<button
					type="button"
					onclick={() => (isEvaluatingCell = false)}
					class="text-muted-foreground hover:text-foreground text-xs p-1"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			{#if cellError}
				<div class="rounded-lg bg-destructive/10 border border-destructive/25 p-2 text-destructive text-xs font-medium">
					{cellError}
				</div>
			{/if}

			<div class="space-y-3 text-xs">
				<div>
					<span class="font-bold text-foreground block mb-1.5">Note attribuée (−2 à +2)</span>
					<div class="grid grid-cols-5 gap-1.5 text-center">
						{#each [-2, -1, 0, 1, 2] as s}
							{@const b = getScoreBadge(s)}
							<button
								type="button"
								onclick={() => (cellScore = s)}
								class="p-2 rounded-lg border text-xs font-bold transition-all {cellScore === s
									? 'border-primary ring-2 ring-primary/30 bg-primary/10 text-primary'
									: 'hover:bg-muted text-muted-foreground'}"
							>
								{b.label}
								<span class="block text-[9px] font-mono mt-0.5">{s > 0 ? `+${s}` : s}</span>
							</button>
						{/each}
					</div>
				</div>

				<div>
					<label for="eval-justification" class="font-bold text-foreground block mb-1">
						Justification technique obligatoire *
					</label>
					<textarea
						id="eval-justification"
						bind:value={cellJustification}
						rows={3}
						placeholder="Expliciter impérativement les motifs techniques, contraintes contractuelles ou résultats d'essais justifiant cette note..."
						class="w-full rounded-md border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
					></textarea>
				</div>
			</div>

			<div class="flex justify-end gap-2 border-t pt-3">
				<button
					type="button"
					onclick={() => (isEvaluatingCell = false)}
					class="px-3 py-1.5 rounded-lg border text-xs font-semibold text-muted-foreground hover:bg-muted"
				>
					Annuler
				</button>
				<button
					type="button"
					onclick={handleSaveEvaluation}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-xs"
				>
					<Check class="h-3.5 w-3.5" />
					<span>Enregistrer l'évaluation</span>
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Modal Arbitrage Décisionnel (Lead Architect) -->
{#if isDeciding}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
		<div class="w-full max-w-lg rounded-xl bg-card p-5 shadow-lg border space-y-4">
			<div class="flex items-center justify-between border-b pb-2">
				<div class="flex items-center gap-2">
					<Award class="h-4 w-4 text-primary" />
					<h4 class="text-xs font-bold text-foreground">
						Arbitrage Formel d'Architecture (Niveau L3)
					</h4>
				</div>
				<button
					type="button"
					onclick={() => (isDeciding = false)}
					class="text-muted-foreground hover:text-foreground text-xs p-1"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			{#if decisionError}
				<div class="rounded-lg bg-destructive/10 border border-destructive/25 p-2 text-destructive text-xs font-medium">
					{decisionError}
				</div>
			{/if}

			<div class="space-y-3 text-xs">
				<div>
					<label for="dec-opt" class="font-bold text-foreground block mb-1">
						Option formellement retenue *
					</label>
					<select
						id="dec-opt"
						bind:value={selectedRetainedOptionId}
						class="w-full rounded-md border bg-background px-3 py-1.5 text-xs text-foreground"
					>
						{#each options as opt}
							<option value={opt.id}>{opt.title}</option>
						{/each}
					</select>
				</div>

				<div>
					<label for="dec-rev" class="font-bold text-foreground block mb-1">
						Degré de réversibilité du choix
					</label>
					<select
						id="dec-rev"
						bind:value={decisionReversibility}
						class="w-full rounded-md border bg-background px-3 py-1.5 text-xs text-foreground"
					>
						<option value="reversible">Réversible (faible coût de revirement)</option>
						<option value="costly">Coûteux à inverser (impact planning/coûts)</option>
						<option value="irreversible">Irréversible (engagement matériel ou contractuel lourd)</option>
					</select>
				</div>

				<div>
					<label for="dec-rationale" class="font-bold text-foreground block mb-1">
						Motivation formelle & Rationale *
					</label>
					<textarea
						id="dec-rationale"
						bind:value={decisionRationale}
						rows={4}
						placeholder="Justifiez le choix souverain de cette option au vu des compromis consentis, des exigences critiques et des risques maîtrisés..."
						class="w-full rounded-md border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
					></textarea>
				</div>
			</div>

			<div class="flex justify-end gap-2 border-t pt-3">
				<button
					type="button"
					onclick={() => (isDeciding = false)}
					class="px-3 py-1.5 rounded-lg border text-xs font-semibold text-muted-foreground hover:bg-muted"
				>
					Annuler
				</button>
				<button
					type="button"
					onclick={handleSaveDecision}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
				>
					<CheckCircle2 class="h-3.5 w-3.5" />
					<span>Acter la décision L3</span>
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Modales d'ajout de critère et d'option -->
<CriteriaEditor
	isOpen={isAddingCriterion}
	onClose={() => (isAddingCriterion = false)}
	onSave={handleAddCriterion}
/>

<OptionEditor
	isOpen={isAddingOption}
	onClose={() => (isAddingOption = false)}
	onSave={handleAddOption}
/>

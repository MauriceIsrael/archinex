<script lang="ts">
	import {
		Gavel,
		CheckCircle2,
		AlertTriangle,
		ShieldAlert,
		ShieldCheck,
		Scale,
		FileText,
		Sparkles,
		Lock,
		RefreshCw,
		Check,
		ChevronRight,
		Info
	} from 'lucide-svelte';
	import type { Option, Criterion, Decision } from '$lib/domain/options';
	import type { MaturityComputationResult, MaturityBlocker } from '$lib/domain/maturityRules';
	import type { Argument } from '$lib/domain/debate';
	import CapitalizationPanel from './CapitalizationPanel.svelte';

	let {
		projectId = '',
		subjectId = '',
		options = [] as Option[],
		criteria = [] as Criterion[],
		argumentsList = [] as Argument[],
		maturityResult = null as MaturityComputationResult | null,
		decision = null as Decision | null,
		onDecisionMade = () => {}
	} = $props<{
		projectId?: string;
		subjectId?: string;
		options?: Option[];
		criteria?: Criterion[];
		argumentsList?: Argument[];
		maturityResult?: MaturityComputationResult | null;
		decision?: Decision | null;
		onDecisionMade?: () => void;
	}>();

	let selectedOptionId = $state('');
	let rationale = $state('');
	let reversibility = $state<'reversible' | 'costly' | 'irreversible'>('costly');
	let rejectionReasons = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');

	// Initialisation de la sélection par défaut
	$effect(() => {
		if (decision) {
			selectedOptionId = decision.retainedOptionId;
			rationale = decision.rationale;
			reversibility = decision.reversibility;
		} else if (options.length > 0 && !selectedOptionId) {
			selectedOptionId = options[0].id;
		}
	});

	const retainedOption = $derived(options.find((o: Option) => o.id === selectedOptionId));
	const otherOptions = $derived(options.filter((o: Option) => o.id !== selectedOptionId));

	async function submitArbitration() {
		if (!selectedOptionId) {
			errorMessage = 'Veuillez sélectionner une option à retenir.';
			return;
		}
		if (rationale.trim().length < 10) {
			errorMessage = 'La motivation de l’arbitrage doit comporter au moins 10 caractères.';
			return;
		}

		errorMessage = '';
		isSubmitting = true;

		const rejected = otherOptions.map((opt: Option) => ({
			optionId: opt.id,
			reason: rejectionReasons[opt.id]?.trim() || `Écartée au profit de l'option retenue ${retainedOption?.title}`
		}));

		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/decision`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					retainedOptionId: selectedOptionId,
					rejected,
					rationale,
					reversibility,
					acceptedViolations: []
				})
			});

			const data = await res.json();
			if (!res.ok) {
				if (data.blockers) {
					errorMessage = `Arbitrage refusé : ${data.blockers.map((b: MaturityBlocker) => b.message).join(' | ')}`;
				} else {
					errorMessage = data.error || 'Erreur lors de l’arbitrage.';
				}
				return;
			}

			successMessage = 'Arbitrage opposable scellé avec succès (Niveau L3_decided).';
			onDecisionMade();
		} catch (err: any) {
			errorMessage = err.message || 'Erreur réseau lors de l’arbitrage.';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="space-y-6">
	<!-- En-tête statut & maturité calculée -->
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-border/60 bg-muted/20">
		<div class="flex items-center gap-3">
			<div class="p-2.5 rounded-lg bg-primary/10 text-primary">
				<Gavel class="w-6 h-6" />
			</div>
			<div>
				<h3 class="font-semibold text-foreground text-base flex items-center gap-2">
					Porte d'Arbitrage Opposable (G3)
					{#if decision}
						<span class="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 font-semibold border border-emerald-500/30">
							<Lock class="w-3 h-3" /> Décision Scellée (L3_decided)
						</span>
					{:else if maturityResult?.readyForArbitration}
						<span class="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 font-semibold border border-emerald-500/30">
							<CheckCircle2 class="w-3 h-3" /> Mûr pour Arbitrage
						</span>
					{:else}
						<span class="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 font-semibold border border-amber-500/30">
							<AlertTriangle class="w-3 h-3" /> En Cours de Maturation
						</span>
					{/if}
				</h3>
				<p class="text-xs text-muted-foreground mt-0.5">
					Niveau calculé : <span class="font-mono font-medium text-foreground">{maturityResult?.level || 'L0_named'}</span>
					{#if maturityResult?.blockers?.length}
						· <span class="text-amber-600 font-medium">{maturityResult.blockers.length} condition(s) bloquante(s)</span>
					{/if}
				</p>
			</div>
		</div>
	</div>

	<!-- Blocages actifs si non mûr -->
	{#if !decision && maturityResult && !maturityResult.readyForArbitration}
		<div class="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-3">
			<div class="flex items-center gap-2 text-amber-600 font-semibold text-sm">
				<ShieldAlert class="w-4 h-4 shrink-0" />
				Conditions préalables requises avant arbitrage (Porte G3) :
			</div>
			<ul class="space-y-2 text-xs">
				{#each maturityResult.blockers as blocker}
					<li class="flex items-start gap-2 text-muted-foreground bg-background/80 p-2.5 rounded-lg border border-border/50">
						<span class="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 font-mono text-[10px] font-semibold shrink-0">
							{blocker.code}
						</span>
						<span>{blocker.message}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Affichage Décision Existante -->
	{#if decision}
		<div class="p-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2 text-emerald-700 font-bold text-sm">
					<CheckCircle2 class="w-5 h-5 text-emerald-600" />
					Décision d'Architecture Validée
				</div>
				<span class="text-xs text-muted-foreground">
					Arbitré le {new Date(decision.decidedAt).toLocaleDateString('fr-FR')} par <strong class="text-foreground">{decision.arbiterId}</strong> ({decision.arbiterRole})
				</span>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
				<div class="p-3 rounded-lg bg-background/80 border border-border/60 space-y-1">
					<span class="text-muted-foreground block text-[11px] font-medium uppercase tracking-wider">Option Retenue</span>
					<strong class="text-foreground text-sm font-semibold block">
						{options.find((o: Option) => o.id === decision?.retainedOptionId)?.title || decision.retainedOptionId}
					</strong>
					<p class="text-muted-foreground text-xs mt-1">
						{options.find((o: Option) => o.id === decision?.retainedOptionId)?.summary || ''}
					</p>
				</div>

				<div class="p-3 rounded-lg bg-background/80 border border-border/60 space-y-1">
					<span class="text-muted-foreground block text-[11px] font-medium uppercase tracking-wider">Réversibilité & Rationale</span>
					<div class="flex items-center gap-2">
						<span class="px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold {decision.reversibility === 'reversible' ? 'bg-emerald-500/10 text-emerald-700' : decision.reversibility === 'costly' ? 'bg-amber-500/10 text-amber-700' : 'bg-rose-500/10 text-rose-700'}">
							{decision.reversibility}
						</span>
					</div>
					<p class="text-foreground text-xs mt-1 italic">
						"{decision.rationale}"
					</p>
				</div>
			</div>

			{#if decision.rejected && decision.rejected.length > 0}
				<div class="space-y-1.5 text-xs">
					<span class="text-muted-foreground block text-[11px] font-medium uppercase tracking-wider">Options Écartées</span>
					<div class="space-y-1.5">
						{#each decision.rejected as rej}
							<div class="p-2.5 rounded-lg bg-background/60 border border-border/40 flex items-start gap-2">
								<ChevronRight class="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
								<div>
									<strong class="text-foreground">{options.find((o: Option) => o.id === rej.optionId)?.title || rej.optionId} :</strong>
									<span class="text-muted-foreground ml-1">{rej.reason}</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- Capitalisation vers LLMOps KB (Porte G4) -->
		<CapitalizationPanel {projectId} {subjectId} {decision} {options} />

	<!-- Formulaire d'Arbitrage (actif si prêt ou pour préparation) -->
	{:else}
		<div class="p-5 rounded-xl border border-border bg-card space-y-6">
			<h4 class="font-semibold text-foreground text-sm flex items-center gap-2">
				<Scale class="w-4 h-4 text-primary" />
				Formulaire d'Arbitrage Opposable
			</h4>

			<!-- 1. Sélection de l'option retenue -->
			<div class="space-y-2">
				<div class="block text-xs font-semibold text-foreground uppercase tracking-wider">
					1. Option d'architecture retenue
				</div>
				<div class="grid grid-cols-1 gap-2.5">
					{#each options as opt}
						<label
							class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors {selectedOptionId === opt.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border/60 bg-muted/10 hover:bg-muted/20'}"
						>
							<input
								type="radio"
								name="retained_option"
								value={opt.id}
								bind:group={selectedOptionId}
								class="mt-1 text-primary focus:ring-primary"
							/>
							<div class="flex-1">
								<div class="flex items-center justify-between">
									<strong class="text-xs text-foreground font-semibold">{opt.title}</strong>
									<span class="text-[10px] px-1.5 py-0.5 rounded bg-muted font-mono">{opt.origin}</span>
								</div>
								<p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">{opt.summary}</p>
							</div>
						</label>
					{/each}
				</div>
			</div>

			<!-- 2. Motifs d'écartement pour les autres options -->
			{#if otherOptions.length > 0}
				<div class="space-y-3">
					<div class="block text-xs font-semibold text-foreground uppercase tracking-wider">
						2. Motifs d'écartement des options alternatives
					</div>
					{#each otherOptions as opt}
						<div class="p-3 rounded-lg bg-muted/15 border border-border/50 space-y-1.5">
							<span class="text-xs font-medium text-foreground">Option écartée : {opt.title}</span>
							<input
								type="text"
								placeholder="Raison principale du rejet (coût, dette technique, non-conformité...)"
								bind:value={rejectionReasons[opt.id]}
								class="w-full text-xs px-3 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
							/>
						</div>
					{/each}
				</div>
			{/if}

			<!-- 3. Justification & Réversibilité -->
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div class="md:col-span-2 space-y-1.5">
					<div class="block text-xs font-semibold text-foreground uppercase tracking-wider">
						3. Motivation & Compromis Arbitrés (Rationale)
					</div>
					<textarea
						rows="4"
						placeholder="Exposez les fondements techniques, économiques et opérationnels du choix..."
						bind:value={rationale}
						class="w-full text-xs p-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
					></textarea>
				</div>

				<div class="space-y-1.5">
					<div class="block text-xs font-semibold text-foreground uppercase tracking-wider">
						Réversibilité
					</div>
					<div class="space-y-2 text-xs">
						<label class="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-background cursor-pointer">
							<input type="radio" value="reversible" bind:group={reversibility} />
							<span>Réversible sans impact majeur</span>
						</label>
						<label class="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-background cursor-pointer">
							<input type="radio" value="costly" bind:group={reversibility} />
							<span>Coûteuse (délai / budget significatif)</span>
						</label>
						<label class="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-background cursor-pointer">
							<input type="radio" value="irreversible" bind:group={reversibility} />
							<span>Structurante / Irréversible</span>
						</label>
					</div>
				</div>
			</div>

			{#if errorMessage}
				<div class="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs">
					{errorMessage}
				</div>
			{/if}

			{#if successMessage}
				<div class="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-xs font-medium">
					{successMessage}
				</div>
			{/if}

			<div class="flex items-center justify-between pt-2">
				<p class="text-[11px] text-muted-foreground flex items-center gap-1.5">
					<Info class="w-3.5 h-3.5" />
					L'arbitrage scelle le passage à L3_decided et valide les énoncés dérivés comme relus par l'humain.
				</p>

				<button
					onclick={submitArbitration}
					disabled={isSubmitting || (maturityResult ? !maturityResult.readyForArbitration : false)}
					class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
				>
					{#if isSubmitting}
						<RefreshCw class="w-3.5 h-3.5 animate-spin" />
						Enregistrement...
					{:else}
						<Gavel class="w-3.5 h-3.5" />
						Prononcer l'arbitrage opposable
					{/if}
				</button>
			</div>
		</div>
	{/if}
</div>

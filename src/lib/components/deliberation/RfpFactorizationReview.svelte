<script lang="ts">
	import type { ExtractedClause } from '$lib/domain/corpus';
	import type { FactorizedArchitecturalSubject } from '$lib/domain/factorization';
	import type { InitialSubjectInput } from '$lib/domain/engagements';
	import type { ArchitectRole } from '$lib/types/epistemic';
	import {
		BrainCircuit,
		CheckCircle2,
		AlertTriangle,
		Sparkles,
		Layers,
		Check,
		Edit3,
		PlusCircle,
		ShieldCheck,
		ArrowRight,
		Info,
		ListFilter,
		Tag,
		ExternalLink
	} from 'lucide-svelte';

	interface Props {
		subjects: FactorizedArchitecturalSubject[];
		clauses: ExtractedClause[];
		modelUsed: string;
		engine: string;
		summary: string;
		coverageRate: number;
		onConfirm: (initialSubjects: InitialSubjectInput[]) => void;
		onCancel: () => void;
	}

	let {
		subjects: initialSubjectsProp,
		clauses,
		modelUsed,
		engine,
		summary,
		coverageRate,
		onConfirm,
		onCancel
	}: Props = $props();

	// Copie locale réactive des sujets factorisés
	let editableSubjects = $state<FactorizedArchitecturalSubject[]>(
		JSON.parse(JSON.stringify(initialSubjectsProp))
	);

	// Sujets sélectionnés pour injection sur le board
	let selectedSubjectIds = $state<Set<string>>(
		new Set(initialSubjectsProp.map((s) => s.id))
	);

	// Mode de visualisation : 'subjects' (Sujets d'Architecture) vs 'appropriation' (Revue exhaustive des 100% clauses)
	type TabMode = 'subjects' | 'appropriation';
	let activeTab = $state<TabMode>('subjects');

	// Clause sélectionnée pour aperçu
	let activeClausePreview = $state<ExtractedClause | null>(null);

	// Filtre par lot dans la vue sujets
	let selectedLotFilter = $state<string>('ALL');

	const availableRoles: Array<{ id: ArchitectRole; label: string }> = [
		{ id: 'lead_architect', label: 'Lead Architect' },
		{ id: 'infra_expert_architect', label: 'Expert Infra / Bare-Metal' },
		{ id: 'domain_architect', label: 'Architecte Domaine / Télécom' },
		{ id: 'security_architect', label: 'Expert Sécurité / SecOps' },
		{ id: 'data_architect', label: 'Architecte Data & IA' },
		{ id: 'domain_expert', label: 'Expert Métier & Gouvernance' }
	];

	// Calcul des clauses couvertes par au moins un sujet sélectionné
	let coveredClauseRefs = $derived(() => {
		const set = new Set<string>();
		for (const s of editableSubjects) {
			if (selectedSubjectIds.has(s.id)) {
				for (const ref of s.coveredClauseRefs) {
					set.add(ref);
				}
			}
		}
		return set;
	});

	// Liste unique des lots présents
	let availableLots = $derived(() => {
		const set = new Set<string>();
		for (const s of editableSubjects) {
			if (s.lotId) set.add(s.lotId);
		}
		return Array.from(set).sort();
	});

	// Sujets filtrés selon le lot sélectionné
	let filteredSubjects = $derived(() => {
		if (selectedLotFilter === 'ALL') return editableSubjects;
		return editableSubjects.filter((s) => s.lotId === selectedLotFilter);
	});

	function toggleSubjectSelection(id: string) {
		const next = new Set(selectedSubjectIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		selectedSubjectIds = next;
	}

	function toggleSelectAll() {
		if (selectedSubjectIds.size === editableSubjects.length) {
			selectedSubjectIds = new Set();
		} else {
			selectedSubjectIds = new Set(editableSubjects.map((s) => s.id));
		}
	}

	// Promotion d'une clause en sujet d'architecture dédié (appropriation humaine)
	function handlePromoteClause(clause: ExtractedClause) {
		const newId = `SUBJ-PROMOTED-${Date.now().toString(36).toUpperCase()}`;
		const newSubject: FactorizedArchitecturalSubject = {
			id: newId,
			lotId: inferLotFromText(clause.title + ' ' + clause.text),
			name: `Arbitrage Dédié : ${clause.title}`,
			sectionRef: clause.clauseRef,
			coveredClauseRefs: [clause.clauseRef],
			matchedKbItemIds: [],
			knowledgeAlignment: 'novel_requirement',
			alignmentRationale: `Sujet créé manuellement lors de la revue d'appropriation depuis l'exigence ${clause.clauseRef}`,
			initialLevel: 'L1_dilemma',
			waitingForRole: 'infra_expert_architect',
			effort: clause.criticality === 'bloquant' ? 'L' : 'M',
			seed: {
				initialRetenu: [`Exigence client spécifique : ${clause.title}`],
				initialHypothesis: clause.text,
				initialQuestion: `Comment traiter spécifiquement l'exigence ${clause.clauseRef} dans l'architecture globale ?`
			}
		};

		editableSubjects = [newSubject, ...editableSubjects];
		selectedSubjectIds = new Set([...selectedSubjectIds, newId]);
		activeTab = 'subjects';
	}

	// Rattacher une clause à un sujet existant
	function handleAttachClauseToSubject(clauseRef: string, targetSubjectId: string) {
		editableSubjects = editableSubjects.map((subj) => {
			if (subj.id === targetSubjectId && !subj.coveredClauseRefs.includes(clauseRef)) {
				return {
					...subj,
					coveredClauseRefs: [...subj.coveredClauseRefs, clauseRef]
				};
			}
			return subj;
		});
	}

	function inferLotFromText(text: string): string {
		const lower = text.toLowerCase();
		if (lower.includes('secnum') || lower.includes('souverain') || lower.includes('juridique'))
			return 'LOT-01-SOUV';
		if (lower.includes('bare') || lower.includes('k8s') || lower.includes('serveur'))
			return 'LOT-02-INFRA';
		if (lower.includes('ptp') || lower.includes('upf') || lower.includes('radio') || lower.includes('5g'))
			return 'LOT-03-TELCO';
		if (lower.includes('chiffr') || lower.includes('tls') || lower.includes('nis2') || lower.includes('cert'))
			return 'LOT-04-SECOPS';
		return 'LOT-02-INFRA';
	}

	function handleValidate() {
		// Convertit les sujets sélectionnés en InitialSubjectInput pour Archinex
		const finalSubjects: InitialSubjectInput[] = editableSubjects
			.filter((s) => selectedSubjectIds.has(s.id))
			.map((s) => ({
				sectionRef: s.sectionRef,
				name: s.name,
				waitingForRole: s.waitingForRole,
				effort: s.effort,
				initialRetenu: s.seed.initialRetenu,
				initialHypothesis: s.seed.initialHypothesis,
				initialConflict: s.seed.initialConflict,
				initialQuestion: s.seed.initialQuestion
			}));

		onConfirm(finalSubjects);
	}
</script>

<div class="space-y-4">
	<!-- ─── Synthèse Supérieure & Métriques ────────────────────────────────────── -->
	<div class="p-4 rounded-xl border bg-card shadow-xs space-y-3">
		<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
			<div class="flex items-center gap-2">
				<div class="p-2 rounded-lg bg-primary/10 text-primary">
					<Sparkles class="h-4 w-4" />
				</div>
				<div>
					<h3 class="font-bold text-sm text-foreground flex items-center gap-2">
						<span>Factorisation Sémantique d'Architecture</span>
						<span class="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-mono font-bold">
							{engine === 'local-llm' ? 'Moteur Souverain Local' : 'Moteur de Secours'}
						</span>
					</h3>
					<p class="text-[11px] text-muted-foreground">
						Modèle : <strong class="text-foreground font-mono">{modelUsed}</strong> sur <span class="font-mono text-primary">raptor-nino:11434</span>
					</p>
				</div>
			</div>

			<!-- Taux de couverture globale -->
			<div class="flex items-center gap-2 bg-muted/40 px-3 py-1.5 rounded-xl border">
				<span class="text-xs text-muted-foreground font-medium">Couverture des clauses :</span>
				<span class="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
					{coverageRate}%
				</span>
				<span class="text-[11px] text-muted-foreground">({clauses.length} exigences analysées)</span>
			</div>
		</div>

		{#if summary}
			<p class="text-xs text-muted-foreground bg-muted/20 p-2.5 rounded-lg border leading-relaxed italic">
				« {summary} »
			</p>
		{/if}

		<!-- Statistiques Clés -->
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
			<div class="p-2 rounded-lg border bg-muted/30">
				<div class="text-base font-bold font-mono text-foreground">{editableSubjects.length}</div>
				<div class="text-[10px] text-muted-foreground">Sujets d'Architecture</div>
			</div>
			<div class="p-2 rounded-lg border bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
				<div class="text-base font-bold font-mono">
					{editableSubjects.filter((s) => s.knowledgeAlignment === 'standard_established').length}
				</div>
				<div class="text-[10px]">Standards Patrimoine (L2/L3)</div>
			</div>
			<div class="p-2 rounded-lg border bg-destructive/10 border-destructive/20 text-destructive">
				<div class="text-base font-bold font-mono">
					{editableSubjects.filter((s) => s.knowledgeAlignment === 'conflict_detected').length}
				</div>
				<div class="text-[10px]">Dilemmes / Conflits (L1)</div>
			</div>
			<div class="p-2 rounded-lg border bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300">
				<div class="text-base font-bold font-mono">
					{editableSubjects.filter((s) => s.knowledgeAlignment === 'novel_requirement').length}
				</div>
				<div class="text-[10px]">Besoins Inédits</div>
			</div>
		</div>
	</div>

	<!-- ─── Barre de Navigation des Vues (Tabs) ─────────────────────────────────── -->
	<div class="flex items-center justify-between border-b pb-2">
		<div class="flex items-center gap-1.5">
			<button
				type="button"
				onclick={() => (activeTab = 'subjects')}
				class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-2 {activeTab === 'subjects'
					? 'bg-primary text-primary-foreground shadow-xs'
					: 'text-muted-foreground hover:bg-muted'}"
			>
				<Layers class="h-3.5 w-3.5" />
				<span>Vue Sujets d'Architecture ({selectedSubjectIds.size}/{editableSubjects.length})</span>
			</button>

			<button
				type="button"
				onclick={() => (activeTab = 'appropriation')}
				class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-2 {activeTab === 'appropriation'
					? 'bg-primary text-primary-foreground shadow-xs'
					: 'text-muted-foreground hover:bg-muted'}"
			>
				<ListFilter class="h-3.5 w-3.5" />
				<span>Vue Appropriation & 100% Exigences ({clauses.length})</span>
			</button>
		</div>

		{#if activeTab === 'subjects'}
			<!-- Filtre par lot -->
			<div class="flex items-center gap-2 text-xs">
				<span class="text-[11px] text-muted-foreground font-medium">Filtrer par Lot :</span>
				<select
					bind:value={selectedLotFilter}
					class="rounded-lg border bg-background px-2 py-1 text-xs font-mono"
				>
					<option value="ALL">Tous les lots ({editableSubjects.length})</option>
					{#each availableLots() as lot}
						<option value={lot}>{lot}</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>

	<!-- ─── TAB 1 : VUE SUJETS D'ARCHITECTURE ────────────────────────────────────── -->
	{#if activeTab === 'subjects'}
		<div class="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
			<div class="flex items-center justify-between text-xs px-1 text-muted-foreground">
				<span>
					{filteredSubjects().length} sujets d'architecture affichés. Cliquez pour sélectionner ou modifier.
				</span>
				<button
					type="button"
					onclick={toggleSelectAll}
					class="text-primary hover:underline font-semibold cursor-pointer"
				>
					{selectedSubjectIds.size === editableSubjects.length ? 'Tout désélectionner' : 'Tout sélectionner'}
				</button>
			</div>

			{#each filteredSubjects() as subj, idx (subj.id)}
				<div
					class="p-3.5 rounded-xl border transition-all space-y-2.5 {selectedSubjectIds.has(subj.id)
						? 'bg-card border-primary/40 shadow-xs'
						: 'bg-muted/10 border-border opacity-70'}"
				>
					<!-- Ligne d'en-tête du Sujet -->
					<div class="flex items-start justify-between gap-3">
						<div class="flex items-start gap-2.5 flex-1">
							<input
								type="checkbox"
								checked={selectedSubjectIds.has(subj.id)}
								onchange={() => toggleSubjectSelection(subj.id)}
								class="mt-1 rounded text-primary cursor-pointer"
							/>
							<div class="space-y-1 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<!-- Badge du Lot -->
									<span class="px-2 py-0.5 rounded bg-muted font-mono font-bold text-[10px] text-foreground border">
										{subj.lotId}
									</span>

									<!-- Titre éditable inline -->
									<input
										type="text"
										bind:value={subj.name}
										class="font-bold text-xs bg-transparent border-b border-dashed border-border hover:border-primary focus:border-primary px-1 py-0.5 flex-1 min-w-[200px]"
									/>

									<!-- Statut par rapport au Patrimoine Commun -->
									{#if subj.knowledgeAlignment === 'standard_established'}
										<span class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold">
											<CheckCircle2 class="h-3 w-3" />
											Standard Patrimoine (L2/L3)
										</span>
									{:else if subj.knowledgeAlignment === 'conflict_detected'}
										<span class="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20 px-2 py-0.5 text-[10px] font-bold">
											<AlertTriangle class="h-3 w-3" />
											Conflit / Dilemme (L1)
										</span>
									{:else}
										<span class="inline-flex items-center gap-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 px-2 py-0.5 text-[10px] font-bold">
											<Sparkles class="h-3 w-3" />
											Besoin Inédit
										</span>
									{/if}
								</div>

								<!-- Justification de l'IA -->
								<p class="text-[11px] text-muted-foreground leading-relaxed">
									{subj.alignmentRationale}
								</p>
							</div>
						</div>

						<!-- Sélecteur de Rôle Assigné -->
						<div class="shrink-0">
							<select
								bind:value={subj.waitingForRole}
								class="rounded-lg border bg-background px-2 py-1 text-[11px] font-medium"
							>
								{#each availableRoles as role}
									<option value={role.id}>{role.label}</option>
								{/each}
							</select>
						</div>
					</div>

					<!-- Question Clé d'Amorce & Graine Télégraphique -->
					<div class="p-2.5 rounded-lg bg-muted/30 border text-xs space-y-1">
						<div class="flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
							<span>Question d'amorce pour le board :</span>
							<span class="font-mono text-primary">Niveau initial : {subj.initialLevel}</span>
						</div>
						<input
							type="text"
							bind:value={subj.seed.initialQuestion}
							class="w-full text-[11px] font-medium bg-background/80 rounded px-2 py-1 border text-foreground"
						/>
					</div>

					<!-- Clauses agrégées & Standards activés -->
					<div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t text-[11px]">
						<div class="flex flex-wrap items-center gap-1.5">
							<span class="text-[10px] text-muted-foreground font-semibold">Clauses couvertes ({subj.coveredClauseRefs.length}) :</span>
							{#each subj.coveredClauseRefs as ref}
								<span class="px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20 font-mono text-[10px] font-bold">
									{ref}
								</span>
							{/each}
						</div>

						{#if subj.matchedKbItemIds && subj.matchedKbItemIds.length > 0}
							<div class="flex items-center gap-1">
								<span class="text-[10px] text-muted-foreground">Standards activés :</span>
								{#each subj.matchedKbItemIds as kbId}
									<span class="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 font-mono text-[10px]">
										{kbId}
									</span>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- ─── TAB 2 : VUE APPROPRIATION EXHAUSTIVE (100% DES CLAUSES) ─────────────── -->
	{#if activeTab === 'appropriation'}
		<div class="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
			<div class="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2">
				<Info class="h-4 w-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
				<div>
					<strong>Revue d'Appropriation Humaine & Examen Exhaustif :</strong>
					Pour s'aligner avec le travail des équipes et des outils externes (ex: <em>La suite</em> de Padawan Coder), chaque clause peut être inspectée individuellement. Si une exigence révèle un dilemme d'architecture manquant, vous pouvez la <strong>promouvoir en Sujet d'Architecture dédié en 1 clic</strong>.
				</div>
			</div>

			<div class="space-y-2">
				{#each clauses as clause}
					{@const isCovered = coveredClauseRefs().has(clause.clauseRef)}
					{@const parentSubject = editableSubjects.find((s) => s.coveredClauseRefs.includes(clause.clauseRef))}

					<div
						class="p-3 rounded-xl border space-y-1.5 transition-colors {isCovered
							? 'bg-card border-border'
							: 'bg-amber-500/5 border-amber-500/30'}"
					>
						<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
							<div class="flex items-center gap-2">
								<span class="font-mono text-primary font-bold text-xs">{clause.clauseRef}</span>
								<span class="font-semibold text-xs text-foreground">{clause.title}</span>
								{#if clause.criticality === 'bloquant'}
									<span class="px-1.5 py-0.2 rounded bg-destructive/10 text-destructive text-[10px] font-bold border border-destructive/20">
										Bloquant
									</span>
								{/if}
							</div>

							<!-- Actions d'appropriation -->
							<div class="flex items-center gap-2 shrink-0">
								{#if isCovered && parentSubject}
									<span class="text-[10px] text-muted-foreground flex items-center gap-1">
										<Check class="h-3 w-3 text-emerald-500" />
										Rattaché à : <strong class="text-foreground">{parentSubject.name.slice(0, 30)}...</strong>
									</span>
								{:else}
									<span class="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
										<AlertTriangle class="h-3 w-3" />
										Non rattachée
									</span>
								{/if}

								<!-- Bouton Promotion en Sujet d'Architecture -->
								<button
									type="button"
									onclick={() => handlePromoteClause(clause)}
									class="px-2 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary font-bold text-[10px] transition-colors cursor-pointer flex items-center gap-1"
									title="Créer immédiatement un nouveau sujet d'architecture à partir de cette clause"
								>
									<PlusCircle class="h-3 w-3" />
									<span>Promouvoir en Sujet Archi</span>
								</button>
							</div>
						</div>

						<p class="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
							"{clause.text}"
						</p>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- ─── Footer d'Arbitrage & Validation ────────────────────────────────────── -->
	<div class="p-3 border-t bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
		<button
			type="button"
			onclick={onCancel}
			class="px-4 py-1.5 rounded-lg border bg-background hover:bg-muted font-semibold transition-colors cursor-pointer w-full sm:w-auto"
		>
			Retour au Dépouillement Brut
		</button>

		<div class="flex items-center gap-3 w-full sm:w-auto justify-end">
			<span class="text-[11px] text-muted-foreground">
				<strong class="text-foreground">{selectedSubjectIds.size}</strong> sujets sélectionnés pour le Board
			</span>

			<button
				type="button"
				onclick={handleValidate}
				disabled={selectedSubjectIds.size === 0}
				class="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed w-full sm:w-auto"
			>
				<Check class="h-4 w-4" />
				<span>Valider & Injecter dans le Board de Délibération</span>
			</button>
		</div>
	</div>
</div>

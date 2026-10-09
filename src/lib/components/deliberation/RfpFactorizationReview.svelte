<script lang="ts">
	import type { ExtractedClause } from '$lib/domain/corpus';
	import type { FactorizedArchitecturalSubject } from '$lib/domain/factorization';
	import type { InitialSubjectInput } from '$lib/domain/engagements';
	import type { ArchitectRole } from '$lib/types/epistemic';
	import { buildAuditReportMarkdown } from '$lib/domain/requirementsAuditReport';
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
		ExternalLink,
		Download
	} from 'lucide-svelte';

	interface Props {
		subjects: FactorizedArchitecturalSubject[];
		clauses: ExtractedClause[];
		modelUsed: string;
		engine: string;
		summary: string;
		coverageRate: number;
		warning?: string;
		errorDetail?: string;
		wasCondensed?: boolean;
		auditReport?: any;
		evacuatedCount?: number;
		deliberatedCount?: number;
		clarificationCount?: number;
		toQualifyCount?: number;
		clarifications?: Array<{ clauseRef: string; title: string; question: string }>;
		allAuditedRequirements?: any[];
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
		warning,
		errorDetail,
		wasCondensed,
		auditReport,
		evacuatedCount,
		deliberatedCount,
		clarificationCount,
		toQualifyCount,
		clarifications,
		allAuditedRequirements,
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
		if (lower.includes('synchro') || lower.includes('upf') || lower.includes('radio') || lower.includes('5g'))
			return 'LOT-03-TELCO';
		if (lower.includes('chiffr') || lower.includes('tls') || lower.includes('nis2') || lower.includes('cert'))
			return 'LOT-04-SECOPS';
		return 'LOT-02-INFRA';
	}

	// Le rapport conserve la trace des décisions sur les clauses qui ne deviennent pas des sujets
	// (évacuées, à qualifier, à clarifier) : l'écran ne les garde pas une fois l'import confirmé.
	function downloadAuditReport() {
		const md = buildAuditReportMarkdown({
			title: 'RFP importé',
			model: modelUsed,
			status: 'ok',
			generatedAt: new Date().toISOString(),
			requirements: allAuditedRequirements ?? [],
			subjects: editableSubjects,
			warnings: warning ? [warning] : []
		});
		const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = 'audit-exigences.md';
		a.click();
		URL.revokeObjectURL(url);
	}

	function handleValidate() {
		// Convertit les sujets sélectionnés en InitialSubjectInput pour Archinex
		const finalSubjects: InitialSubjectInput[] = editableSubjects
			.filter((s) => selectedSubjectIds.has(s.id))
			.map((s) => {
				// Résoudre les vraies clauses du RFP pour initialRetenu
				const resolvedClauses = (s.coveredClauseRefs || [])
					.map((ref) => {
						const found = clauses.find((c) => c.clauseRef === ref);
						if (!found) return null;
						const cleanText = (found.text || '').replace(/\s+/g, ' ').trim();
						const snippet = cleanText.length > 130 ? cleanText.slice(0, 127) + '...' : cleanText;
						return `[${found.clauseRef}] ${found.title}${snippet && snippet !== found.title ? ` : ${snippet}` : ''}`;
					})
					.filter(Boolean) as string[];

				// Conserver uniquement ce qui n'est pas un ADR dans initialRetenu existant
				const rawNonAdr = (s.seed.initialRetenu || []).filter(
					(r) => !/^\s*(?:ADR|STD)-\d+/i.test(r)
				);

				const initialRetenu = resolvedClauses.length > 0
					? Array.from(new Set([...resolvedClauses.slice(0, 6), ...rawNonAdr]))
					: (rawNonAdr.length > 0 ? rawNonAdr : s.seed.initialRetenu);

				return {
					coveredClauseRefs: [...(s.coveredClauseRefs || [])],
					sectionRef: s.sectionRef,
					name: s.name,
					waitingForRole: s.waitingForRole,
					effort: s.effort,
					initialRetenu,
					initialHypothesis: s.seed.initialHypothesis,
					initialConflict: s.seed.initialConflict,
					initialQuestion: s.seed.initialQuestion,
					expertQuestions: s.seed.expertQuestions || []
				};
			});

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
						<span class="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold {
							engine === 'arckit-requirements-audit'
								? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
								: engine === 'map-reduce-llm'
									? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30'
									: engine === 'local-llm'
										? 'bg-primary/15 text-primary'
										: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
						}">
							{engine === 'arckit-requirements-audit'
								? 'Méthodologie ArcKit (Audit & Factorisation Native)'
								: engine === 'map-reduce-llm'
									? 'Moteur Hiérarchique Map-Reduce (100% Verbatim)'
									: engine === 'anthropic-claude'
										? 'Claude (Anthropic)'
										: engine === 'local-llm'
											? 'Moteur Souverain Local'
											: 'Moteur de Secours Déterministe'}
						</span>
					</h3>
					<p class="text-[11px] text-muted-foreground">
						Modèle : <strong class="text-foreground font-mono">{modelUsed}</strong> sur <span class="font-mono text-primary">{engine === 'arckit-requirements-audit' ? 'Pipeline ArcKit' : engine === 'anthropic-claude' ? 'API Anthropic' : 'LLM Local'}</span>
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

		{#if engine === 'arckit-requirements-audit'}
			<div class="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 space-y-1.5">
				<div class="flex items-start gap-2.5">
					<ShieldCheck class="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
					<div class="space-y-1">
						<div class="font-bold text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
							<span>Méthodologie ArcKit · Propositions du modèle à relire</span>
							<span class="text-[10px] lowercase font-mono font-normal opacity-75">(chaque clause dans un seul état)</span>
						</div>
						<p class="text-xs leading-relaxed">
							<strong>{deliberatedCount ?? 0} clauses à délibérer</strong> regroupées en <strong>{editableSubjects.length} sujets</strong>, <strong>{evacuatedCount ?? 0} commodités proposées à l'évacuation</strong> (chacune avec son motif), <strong>{clarificationCount ?? 0} questions</strong> pour le donneur d'ordre et <strong>{toQualifyCount ?? 0} clauses à qualifier</strong> par vous. Ce sont des propositions du modèle : relisez surtout les évacuations. Une clause évacuée à tort reste récupérable en un clic (« Promouvoir en Sujet Archi »).
						</p>
						{#if warning}
							<p class="text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">⚠ {warning}</p>
						{/if}
						{#if allAuditedRequirements && allAuditedRequirements.length > 0}
							<button
								type="button"
								onclick={downloadAuditReport}
								class="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/40 bg-background px-2.5 py-1 text-[11px] font-semibold text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/10 transition-colors cursor-pointer"
								title="Télécharger la liste de toutes les clauses avec leur état et leur motif. À garder : l'import ne conserve que les sujets."
							>
								<Download class="h-3 w-3" />
								<span>Télécharger le rapport d'audit</span>
							</button>
						{/if}
					</div>
				</div>
			</div>
		{:else if warning || !['local-llm', 'map-reduce-llm', 'anthropic-claude', 'arckit-requirements-audit'].includes(engine)}
			<div class="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 space-y-1.5">
				<div class="flex items-start gap-2.5">
					<AlertTriangle class="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
					<div class="space-y-1">
						<div class="font-bold text-xs uppercase tracking-wider text-amber-700 dark:text-amber-300 flex items-center gap-2">
							<span>{['local-llm', 'map-reduce-llm', 'anthropic-claude'].includes(engine) ? 'Avertissement' : 'Repli sur le moteur heuristique de secours'}</span>
							<span class="text-[10px] lowercase font-mono font-normal opacity-75">(tolérance zéro au silence)</span>
						</div>
						<p class="text-xs leading-relaxed">
							{warning || 'Le modèle LLM local n\'a pas pu procéder à la factorisation directe. Des règles heuristiques déterministes ont été appliquées pour ne pas bloquer l\'importation.'}
						</p>
						{#if errorDetail}
							<details class="text-[11px] opacity-80 pt-1">
								<summary class="cursor-pointer hover:underline font-mono">Détail technique de l'erreur</summary>
								<pre class="mt-1 p-2 rounded bg-black/10 dark:bg-black/40 font-mono text-[10px] whitespace-pre-wrap">{errorDetail}</pre>
							</details>
						{/if}
					</div>
				</div>
			</div>
		{:else if engine === 'map-reduce-llm'}
			<div class="p-2.5 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-900 dark:text-purple-200 flex items-center gap-2 text-xs">
				<Sparkles class="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
				<span>
					<strong>Analyse Exhaustive Map-Reduce active :</strong> 100% du texte intégral des exigences a été instruit par blocs découpés puis consolidé en méta-sujets d'architecture, sans aucun troncage ni angle mort.
				</span>
			</div>
		{:else if wasCondensed}
			<div class="p-2.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-900 dark:text-blue-200 flex items-center gap-2 text-xs">
				<Info class="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
				<span>
					<strong>Mode condensé actif :</strong> Le document massif a été synthétisé par références et extraits pour respecter la fenêtre de contexte maximale du modèle local souverain.
				</span>
			</div>
		{/if}

		{#if summary}
			<p class="text-xs text-muted-foreground bg-muted/20 p-2.5 rounded-lg border leading-relaxed italic">
				« {summary} »
			</p>
		{/if}

		<!-- Statistiques Clés -->
		{#if engine === 'arckit-requirements-audit'}
			<div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
				<div class="p-2 rounded-lg border bg-muted/30">
					<div class="text-base font-bold font-mono text-foreground">{clauses.length}</div>
					<div class="text-[10px] text-muted-foreground">Exigences CCTP</div>
				</div>
				<div class="p-2 rounded-lg border bg-slate-500/10 border-slate-500/20 text-slate-700 dark:text-slate-300">
					<div class="text-base font-bold font-mono">
						{evacuatedCount ?? 0}
					</div>
					<div class="text-[10px]">Évacuations proposées ({Math.round(((evacuatedCount ?? 0) / (clauses.length || 1)) * 100)}%)</div>
				</div>
				<div class="p-2 rounded-lg border bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
					<div class="text-base font-bold font-mono">
						{editableSubjects.length}
					</div>
					<div class="text-[10px]">Points Durs ({deliberatedCount ?? 0} clauses)</div>
				</div>
				<div class="p-2 rounded-lg border bg-indigo-500/10 border-indigo-500/20 text-indigo-700 dark:text-indigo-300">
					<div class="text-base font-bold font-mono">
						{clarificationCount ?? 0}
					</div>
					<div class="text-[10px]">Clarifications Client</div>
				</div>
				<div class="p-2 rounded-lg border bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300">
					<div class="text-base font-bold font-mono">
						{toQualifyCount ?? 0}
					</div>
					<div class="text-[10px]">À qualifier par vous</div>
				</div>
			</div>
		{:else}
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
		{/if}
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

					<!-- Questions préalables pour le Sachant Métier (ArcKit) -->
					{#if subj.seed.expertQuestions && subj.seed.expertQuestions.length > 0}
						<div class="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs space-y-1.5">
							<div class="flex items-center justify-between text-[10px] font-bold text-amber-700 dark:text-amber-400">
								<span>Questions préalables pour le Sachant Métier :</span>
								<span class="font-mono text-[9px] uppercase px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/20">ArcKit Triage</span>
							</div>
							<div class="space-y-1">
								{#each subj.seed.expertQuestions as eq, eqIdx}
									<div class="flex items-start gap-1.5 text-[11px] text-foreground">
										<span class="font-mono font-bold text-amber-600 dark:text-amber-400">Q{eqIdx + 1}.</span>
										<span class="flex-1">{eq}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}

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
					{@const audited = allAuditedRequirements?.find((a) => a.clauseRef === clause.clauseRef)}

					<div
						class="p-3 rounded-xl border space-y-1.5 transition-colors {
							audited?.disposition === 'evacuated'
								? 'bg-slate-500/5 border-slate-500/20'
								: audited?.disposition === 'clarification_needed'
									? 'bg-indigo-500/5 border-indigo-500/25'
									: isCovered
										? 'bg-emerald-500/5 border-emerald-500/25'
										: 'bg-amber-500/5 border-amber-500/30'
						}"
					>
						<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
							<div class="flex items-center gap-2">
								<span class="font-mono text-primary font-bold text-xs">{clause.clauseRef}</span>
								<span class="font-semibold text-xs text-foreground">{clause.title}</span>
								{#if audited?.category}
									<span class="px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-mono text-[9px] border">
										{audited.category}
									</span>
								{/if}
								{#if clause.criticality === 'bloquant'}
									<span class="px-1.5 py-0.2 rounded bg-destructive/10 text-destructive text-[10px] font-bold border border-destructive/20">
										Bloquant
									</span>
								{/if}
							</div>

							<!-- Actions d'appropriation & statut ArcKit -->
							<div class="flex items-center gap-2 shrink-0">
								{#if audited?.disposition === 'evacuated'}
									<span class="text-[10px] text-slate-600 dark:text-slate-400 font-medium flex items-center gap-1 bg-slate-500/10 px-2 py-0.5 rounded border border-slate-500/20" title={audited.evacuationReason}>
										<Check class="h-3 w-3 text-slate-500" />
										Évacuation proposée : <span class="italic text-foreground/80 max-w-[200px] truncate">{audited.evacuationReason || 'Standard'}</span>
									</span>
								{:else if audited?.disposition === 'clarification_needed'}
									<span class="text-[10px] text-indigo-700 dark:text-indigo-300 font-medium flex items-center gap-1 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20" title={audited.clarificationQuestion}>
										<Info class="h-3 w-3 text-indigo-500" />
										Clarification : <span class="italic text-foreground/80 max-w-[200px] truncate">{audited.clarificationQuestion}</span>
									</span>
								{:else if audited?.disposition === 'to_qualify'}
									<span class="text-[10px] text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30" title={audited.qualifyReason}>
										<AlertTriangle class="h-3 w-3 text-amber-500" />
										À qualifier : <span class="italic font-normal text-foreground/80 max-w-[200px] truncate">{audited.qualifyReason}</span>
									</span>
								{:else if isCovered && parentSubject}
									<span class="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
										<Check class="h-3 w-3 text-emerald-500" />
										Point Dur : <strong class="text-foreground">{parentSubject.name.slice(0, 30)}...</strong>
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
						{#if audited?.disposition === 'deliberated' && audited.deliberationReason}
							<p class="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
								<span class="font-semibold">Pourquoi à délibérer :</span> {audited.deliberationReason}
							</p>
						{/if}
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

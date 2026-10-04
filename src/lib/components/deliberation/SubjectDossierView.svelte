<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { Argument } from '$lib/domain/debate';
	import { countOpenObjections } from '$lib/domain/debate';
	import TelegraphicDraftView from './TelegraphicDraftView.svelte';
	import OptionsMatrix from './OptionsMatrix.svelte';
	import type { Criterion, Option, OptionEvaluation, TradeOff, Decision } from '$lib/domain/options';
	import {
		FolderLock,
		FileText,
		Scale,
		BookOpen,
		X,
		ExternalLink,
		ShieldAlert,
		Sparkles,
		Layers,
		GitFork,
		Sliders
	} from 'lucide-svelte';
	import KnowledgeTreeChart from '$lib/components/knowledge/KnowledgeTreeChart.svelte';
	import ProjectRulesPanel from './ProjectRulesPanel.svelte';

	let {
		subjectId = '',
		projectId = '',
		argumentsList = [],
		isOpen = true,
		onClose = () => {}
	}: {
		subjectId: string;
		projectId: string;
		argumentsList?: Argument[];
		isOpen?: boolean;
		onClose?: () => void;
	} = $props();

	type DossierTab = 'draft' | 'matrix' | 'kb' | 'tree' | 'rules';
	let activeTab = $state<DossierTab>('draft');

	const activeSubject = $derived(deliberationStore.activeSubject);
	const openObjectionsCount = $derived(countOpenObjections(argumentsList));
	const totalObjectionsCount = $derived(
		argumentsList.filter((a) => a.stance === 'objection').length
	);

	// Unique KB references collected from arguments
	const citedKbRefs = $derived.by(() => {
		const set = new Set<string>();
		for (const a of argumentsList) {
			if (a.kbRefs && Array.isArray(a.kbRefs)) {
				for (const ref of a.kbRefs) {
					if (ref) set.add(ref);
				}
			}
		}
		return Array.from(set);
	});

	// Options matrix state loaded for consultation
	let matrixCriteria = $state<Criterion[]>([]);
	let matrixOptions = $state<Option[]>([]);
	let matrixEvaluations = $state<OptionEvaluation[]>([]);
	let matrixTradeOffs = $state<TradeOff[]>([]);
	let matrixDecision = $state<Decision | null>(null);
	let isLoadingMatrix = $state(false);

	$effect(() => {
		if (subjectId && projectId && activeTab === 'matrix') {
			loadMatrixData();
		}
	});

	async function loadMatrixData() {
		if (!projectId || !subjectId) return;
		isLoadingMatrix = true;
		try {
			const [cRes, oRes, eRes, tRes, dRes] = await Promise.all([
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/criteria`),
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/options`),
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/evaluations`),
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/tradeoffs`),
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/decision`)
			]);

			if (cRes.ok) {
				const cData = await cRes.json();
				matrixCriteria = Array.isArray(cData) ? cData : (cData.criteria || []);
			}
			if (oRes.ok) {
				const oData = await oRes.json();
				matrixOptions = Array.isArray(oData) ? oData : (oData.options || []);
			}
			if (eRes.ok) {
				const eData = await eRes.json();
				matrixEvaluations = Array.isArray(eData) ? eData : (eData.evaluations || []);
			}
			if (tRes.ok) {
				const tData = await tRes.json();
				matrixTradeOffs = Array.isArray(tData) ? tData : (tData.tradeOffs || []);
			}
			if (dRes.ok) {
				const dData = await dRes.json();
				matrixDecision = dData.decision || null;
			}
		} catch (err) {
			console.warn('[Dossier] Erreur chargement matrice:', err);
		} finally {
			isLoadingMatrix = false;
		}
	}

	let treeSeries = $state<any[]>([]);
	let isLoadingTree = $state(false);

	$effect(() => {
		if (subjectId && projectId && activeTab === 'tree') {
			loadTreeData();
		}
	});

	async function loadTreeData() {
		if (!projectId || !subjectId) return;
		isLoadingTree = true;
		try {
			const res = await fetch(`/api/projects/${projectId}/subjects/${subjectId}/cascade`);
			if (res.ok) {
				const data = await res.json();
				treeSeries = data.treeSeries || [];
			}
		} catch (err) {
			console.warn('[Dossier] Erreur chargement arbre cascade:', err);
		} finally {
			isLoadingTree = false;
		}
	}
</script>

{#if isOpen}
	<aside
		class="flex flex-col h-full bg-card rounded-xl border shadow-xs overflow-hidden"
		data-testid="subject-dossier"
	>
		<!-- En-tête du dossier : Titre, compteurs et bouton replier -->
		<div class="p-3 border-b bg-muted/20 space-y-2.5 shrink-0">
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<div class="p-1.5 rounded-lg bg-primary/10 text-primary">
						<FolderLock class="h-4 w-4" />
					</div>
					<div>
						<h3 class="text-xs font-bold text-foreground flex items-center gap-1.5">
							<span>Dossier du sujet</span>
							{#if activeSubject}
								<span class="font-mono text-muted-foreground font-normal">
									({activeSubject.section_ref})
								</span>
							{/if}
						</h3>
						<span class="text-[10px] text-muted-foreground">Lecture seule · Justificatifs</span>
					</div>
				</div>

				<button
					type="button"
					onclick={onClose}
					class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
					title="Replier le dossier"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Badges synthétiques du dossier : Objections & Références base -->
			<div class="flex items-center gap-1.5 flex-wrap text-[11px]">
				<span
					class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold border {openObjectionsCount > 0
						? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25'
						: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'}"
				>
					<ShieldAlert class="h-3 w-3" />
					<span>{openObjectionsCount} obj. ouverte(s) / {totalObjectionsCount}</span>
				</span>

				<span
					class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25"
				>
					<BookOpen class="h-3 w-3" />
					<span>{citedKbRefs.length} ref(s) base</span>
				</span>
			</div>

			<!-- Sous-onglets de consultation du dossier -->
			<div class="flex items-center gap-1 bg-muted/60 p-1 rounded-lg text-xs">
				<button
					type="button"
					onclick={() => (activeTab = 'draft')}
					class="flex-1 inline-flex items-center justify-center gap-1 py-1 px-2 rounded-md font-medium text-[11px] transition-all whitespace-nowrap cursor-pointer {activeTab ===
					'draft'
						? 'bg-background text-foreground font-semibold shadow-2xs'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<FileText class="h-3 w-3" />
					<span>Brouillon</span>
				</button>

				<button
					type="button"
					onclick={() => {
						activeTab = 'matrix';
						loadMatrixData();
					}}
					class="flex-1 inline-flex items-center justify-center gap-1 py-1 px-2 rounded-md font-medium text-[11px] transition-all whitespace-nowrap cursor-pointer {activeTab ===
					'matrix'
						? 'bg-background text-foreground font-semibold shadow-2xs'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<Scale class="h-3 w-3" />
					<span>Matrice</span>
				</button>

				<button
					type="button"
					onclick={() => (activeTab = 'kb')}
					class="flex-1 inline-flex items-center justify-center gap-1 py-1 px-2 rounded-md font-medium text-[11px] transition-all whitespace-nowrap cursor-pointer {activeTab ===
					'kb'
						? 'bg-background text-foreground font-semibold shadow-2xs'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<BookOpen class="h-3 w-3" />
					<span>Doctrines</span>
				</button>

				<button
					type="button"
					onclick={() => {
						activeTab = 'tree';
						loadTreeData();
					}}
					class="flex-1 inline-flex items-center justify-center gap-1 py-1 px-2 rounded-md font-medium text-[11px] transition-all whitespace-nowrap cursor-pointer {activeTab ===
					'tree'
						? 'bg-background text-foreground font-semibold shadow-2xs'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<GitFork class="h-3 w-3" />
					<span>Arbre</span>
				</button>

				<button
					type="button"
					onclick={() => (activeTab = 'rules')}
					class="flex-1 inline-flex items-center justify-center gap-1 py-1 px-2 rounded-md font-medium text-[11px] transition-all whitespace-nowrap cursor-pointer {activeTab ===
					'rules'
						? 'bg-background text-foreground font-semibold shadow-2xs'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<Sliders class="h-3 w-3" />
					<span>Règles</span>
				</button>
			</div>
		</div>

		<!-- Corps du dossier selon l'onglet actif -->
		<div class="flex-1 overflow-y-auto p-3">
			{#if activeTab === 'draft'}
				<!-- 1. Brouillon télégraphique -->
				<div class="space-y-3">
					<div class="flex items-center justify-between text-xs pb-1 border-b text-muted-foreground font-semibold">
						<span>Spécification télégraphique</span>
						<span class="text-[10px] font-mono">5 colonnes</span>
					</div>
					<TelegraphicDraftView />
				</div>
			{:else if activeTab === 'matrix'}
				<!-- 2. Matrice d'options -->
				<div class="space-y-3">
					<div class="flex items-center justify-between text-xs pb-1 border-b text-muted-foreground font-semibold">
						<span>Options & Critères d'évaluation</span>
						{#if isLoadingMatrix}
							<span class="text-[10px] font-mono animate-pulse">Chargement...</span>
						{/if}
					</div>
					<OptionsMatrix
						{projectId}
						{subjectId}
						bind:criteria={matrixCriteria}
						bind:options={matrixOptions}
						bind:evaluations={matrixEvaluations}
						bind:tradeOffs={matrixTradeOffs}
						bind:decision={matrixDecision}
						userRole={deliberationStore.currentRole}
						onError={(msg) => deliberationStore.logNotification(msg, 'warning')}
					/>
				</div>
			{:else if activeTab === 'kb'}
				<!-- 3. Références à la base doctrinale -->
				<div class="space-y-3 text-xs">
					<div class="flex items-center justify-between pb-1 border-b text-muted-foreground font-semibold">
						<span>Règles doctrinales mobilisées</span>
						<span class="font-mono text-[10px]">{citedKbRefs.length} identifiée(s)</span>
					</div>

					{#if citedKbRefs.length === 0}
						<div class="p-4 rounded-lg border border-dashed text-center text-muted-foreground text-xs">
							Aucune règle doctrinale citée explicitement dans les arguments de ce sujet.
						</div>
					{:else}
						<div class="space-y-2">
							{#each citedKbRefs as ref}
								<div class="rounded-lg border bg-card/60 p-2.5 flex items-center justify-between gap-2">
									<div class="flex items-center gap-2">
										<BookOpen class="h-3.5 w-3.5 text-indigo-500 shrink-0" />
										<div>
											<span class="font-mono font-bold text-foreground">§ {ref}</span>
											<p class="text-[10px] text-muted-foreground">
												Règle mobilisée dans l'argumentation contradictoire
											</p>
										</div>
									</div>

									<a
										href={`/knowledge?rule=${encodeURIComponent(ref)}`}
										class="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline px-2 py-1 rounded bg-primary/10 shrink-0"
										title="Ouvrir la fiche dans /knowledge"
									>
										<span>Fiche</span>
										<ExternalLink class="h-3 w-3" />
									</a>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'tree'}
				<!-- 4. Arbre de découverte (Généalogie cascade) -->
				<div class="space-y-3" data-testid="dossier-discovery-tree">
					<div class="flex items-center justify-between text-xs pb-1 border-b text-muted-foreground font-semibold">
						<span class="flex items-center gap-1">
							<GitFork class="h-3.5 w-3.5 text-primary" />
							Arbre de découverte
						</span>
						<span class="text-[10px] font-mono">Parents → Décisions → Enfants</span>
					</div>
					{#if isLoadingTree}
						<div class="p-8 text-center text-xs text-muted-foreground animate-pulse">
							Génération de l'arbre généalogique...
						</div>
					{:else if treeSeries && treeSeries.length > 0}
						<div class="rounded-xl border bg-card p-2 min-h-[420px]">
							<KnowledgeTreeChart series={treeSeries} height="420px" />
						</div>
					{:else}
						<div class="p-8 text-center text-xs text-muted-foreground border-2 border-dashed rounded-xl">
							Aucune cascade de décision générée pour ce sujet.
						</div>
					{/if}
				</div>
			{:else if activeTab === 'rules'}
				<!-- 5. Règles du projet et déclencheurs de cascade (Lot A30) -->
				<div class="space-y-3" data-testid="dossier-project-rules">
					<ProjectRulesPanel
						{projectId}
						{subjectId}
						onRuleChanged={() => {
							loadTreeData();
						}}
					/>
				</div>
			{/if}
		</div>
	</aside>
{/if}

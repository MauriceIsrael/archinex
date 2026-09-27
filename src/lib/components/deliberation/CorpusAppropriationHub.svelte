<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import {
		filterCorpusDocuments,
		type CorpusDocument,
		type DocumentOrigin
	} from '$lib/domain/corpus';
	import { getApplicableDoctrineRules } from '$lib/domain/dialectic';
	import AddContributorDocDialog from './AddContributorDocDialog.svelte';
	import RfpShredderDialog from './RfpShredderDialog.svelte';
	import {
		BookOpen,
		Building2,
		Globe,
		Search,
		Plus,
		CheckCircle2,
		ExternalLink,
		ArrowRight,
		FileText,
		Layers,
		ShieldAlert,
		Sparkles,
		Eye,
		Filter,
		Scissors,
		Lightbulb,
		BrainCircuit,
		Scale,
		ShieldCheck
	} from 'lucide-svelte';

	type FilterOriginTab = 'all' | 'client' | 'external';
	let activeTab = $state<FilterOriginTab>('all');
	let searchQuery = $state('');
	let filterByActiveSubject = $state(false);
	let isAddDialogOpen = $state(false);
	let isShredDialogOpen = $state(false);

	const activeDoc = $derived(deliberationStore.activeDocument);
	const activeSubject = $derived(deliberationStore.activeSubject);
	const stats = $derived(deliberationStore.corpusStats);
	const applicableRules = $derived(
		activeDoc ? getApplicableDoctrineRules(activeDoc) : []
	);

	// Filtrage dynamique
	const filteredDocs = $derived(
		filterCorpusDocuments(deliberationStore.corpusDocuments, {
			filterOrigin: activeTab,
			searchQuery,
			subjectId: filterByActiveSubject && activeSubject ? activeSubject.id : undefined
		})
	);

	function selectDocument(docId: string) {
		deliberationStore.setActiveDocument(docId);
	}

	function jumpToSubjectAndDeliberate(subjectId: string) {
		deliberationStore.selectSubject(subjectId);
		deliberationStore.setPosture('deliberation');
	}

	function switchToDeliberation() {
		deliberationStore.setPosture('deliberation');
	}
</script>

<div class="space-y-4">
	<!-- 1. En-tête du Corpus & Synthèse Chiffrée -->
	<div class="rounded-xl border bg-card p-4 shadow-xs space-y-3">
		<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
			<div class="flex items-center gap-2.5">
				<div class="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
					<BookOpen class="h-5 w-5" />
				</div>
				<div>
					<div class="flex items-center gap-2">
						<h2 class="text-base font-bold text-foreground">
							Corpus Documentaire d'Entrée
						</h2>
						<span class="rounded bg-muted px-2 py-0.5 text-xs font-mono font-bold text-muted-foreground">
							{stats.totalDocuments} documents
						</span>
					</div>
					<p class="text-xs text-muted-foreground">
						Référentiel contractuel client et normes techniques apportées par l'équipe
					</p>
				</div>
			</div>

			<!-- Actions Rapides -->
			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={() => (isShredDialogOpen = true)}
					class="inline-flex items-center gap-1.5 rounded-lg border bg-primary/10 hover:bg-primary/20 text-primary border-primary/30 px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors"
					title="Dépouiller automatiquement un CCTP avec le moteur LLMOps"
				>
					<Scissors class="h-3.5 w-3.5" />
					<span>Dépouiller CCTP</span>
				</button>

				<button
					type="button"
					onclick={() => (isAddDialogOpen = true)}
					class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors"
				>
					<Plus class="h-3.5 w-3.5" />
					<span>Ajouter un doc externe</span>
				</button>

				<button
					type="button"
					onclick={switchToDeliberation}
					class="inline-flex items-center gap-1.5 rounded-lg border bg-background hover:bg-muted text-foreground px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors"
				>
					<span>Délibérer</span>
					<ArrowRight class="h-3.5 w-3.5 text-muted-foreground" />
				</button>
			</div>
		</div>

		<!-- Mini-KPIs d'appropriation : distinction nette Client vs Externe -->
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t">
			<!-- Client -->
			<div class="p-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5">
				<div class="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 text-xs font-semibold mb-0.5">
					<Building2 class="h-3.5 w-3.5" />
					<span>Documents Client</span>
				</div>
				<div class="flex items-baseline gap-1.5">
					<span class="text-lg font-bold font-mono text-foreground">{stats.clientDocumentsCount}</span>
					<span class="text-[11px] text-muted-foreground">CCTP & Annexes</span>
				</div>
			</div>

			<!-- Externe -->
			<div class="p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
				<div class="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-xs font-semibold mb-0.5">
					<Globe class="h-3.5 w-3.5" />
					<span>Docs Externes</span>
				</div>
				<div class="flex items-baseline gap-1.5">
					<span class="text-lg font-bold font-mono text-foreground">{stats.externalDocumentsCount}</span>
					<span class="text-[11px] text-muted-foreground">Normes & Experts</span>
				</div>
			</div>

			<!-- Clauses Extraites -->
			<div class="p-2.5 rounded-lg border bg-muted/30">
				<div class="flex items-center gap-1.5 text-muted-foreground text-xs font-semibold mb-0.5">
					<FileText class="h-3.5 w-3.5 text-primary" />
					<span>Exigences & Clauses</span>
				</div>
				<div class="flex items-baseline gap-1.5">
					<span class="text-lg font-bold font-mono text-foreground">{stats.totalExtractedClauses}</span>
					<span class="text-[11px] text-muted-foreground">analysées</span>
				</div>
			</div>

			<!-- Couverture Sujets -->
			<div class="p-2.5 rounded-lg border bg-muted/30">
				<div class="flex items-center gap-1.5 text-muted-foreground text-xs font-semibold mb-0.5">
					<Layers class="h-3.5 w-3.5 text-amber-500" />
					<span>Couverture CCTP</span>
				</div>
				<div class="flex items-baseline gap-1.5">
					<span class="text-lg font-bold font-mono text-foreground">{stats.coveredSubjectsCount}/{deliberationStore.subjects.length}</span>
					<span class="text-[11px] text-muted-foreground">sections</span>
				</div>
			</div>
		</div>
	</div>

	<!-- Rappel Invariant : Patrimoine Commun Partagé -->
	<div class="rounded-xl border bg-emerald-500/10 border-emerald-500/25 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
		<div class="flex items-center gap-2.5">
			<ShieldCheck class="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
			<span>
				<strong>Patrimoine de Connaissances Commun :</strong> 
				<span class="text-foreground">{deliberationStore.commonKnowledgeBase.length} documents et standards</span> capitalisés à travers tous les engagements, valides de facto.
			</span>
		</div>
		<a
			href="/workspaces"
			class="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-300 hover:underline shrink-0"
		>
			<span>Voir tous les espaces projet</span>
			<ArrowRight class="h-3 w-3" />
		</a>
	</div>

	<!-- 2. FOCUS : DOCUMENT ACTIF DE TRAVAIL (Très visible & immédiat) -->
	{#if activeDoc}
		<div
			class="rounded-xl border-2 p-4 shadow-sm space-y-3 transition-all {activeDoc.origin === 'client'
				? 'border-blue-500/40 bg-blue-500/[0.03]'
				: 'border-emerald-500/40 bg-emerald-500/[0.03]'}"
		>
			<div class="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b pb-3">
				<div>
					<div class="flex flex-wrap items-center gap-2 mb-1">
						<!-- Badge d'état Actif -->
						<span class="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2.5 py-0.5 text-[11px] font-bold tracking-wide shadow-2xs">
							<Eye class="h-3 w-3" />
							DOCUMENT DE TRAVAIL ACTIF
						</span>

						<!-- Badge Origine Client vs Externe -->
						{#if activeDoc.origin === 'client'}
							<span class="inline-flex items-center gap-1 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30 px-2 py-0.5 text-[11px] font-bold">
								<Building2 class="h-3 w-3" />
								Document Client · MOA
							</span>
						{:else}
							<span class="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-bold">
								<Globe class="h-3 w-3" />
								Doc Externe · Ajouté par {activeDoc.sourceOrAuthor}
							</span>
						{/if}

						<span class="text-xs font-mono font-bold text-muted-foreground">
							{activeDoc.id} · {activeDoc.version}
						</span>
					</div>

					<h3 class="text-base font-bold text-foreground">
						{activeDoc.title}
					</h3>
				</div>

				<!-- Sélecteur rapide de document actif -->
				<div class="flex items-center gap-2 self-start md:self-center">
					<label for="active-doc-select" class="sr-only">Changer de doc actif</label>
					<select
						id="active-doc-select"
						class="bg-background border rounded-lg px-2.5 py-1.5 text-xs font-medium focus:ring-1 focus:ring-primary shadow-xs"
						value={activeDoc.id}
						onchange={(e) => selectDocument(e.currentTarget.value)}
					>
						<optgroup label="🏢 Documents Client (CCTP / MOA)">
							{#each deliberationStore.clientDocuments as d}
								<option value={d.id}>{d.id} · {d.title}</option>
							{/each}
						</optgroup>
						<optgroup label="🌐 Docs Externes (Contributeurs / Normes)">
							{#each deliberationStore.externalDocuments as d}
								<option value={d.id}>{d.id} · {d.title}</option>
							{/each}
						</optgroup>
					</select>
				</div>
			</div>

			<!-- Résumé opérationnel & Sections impactées -->
			<div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
				<!-- Résumé -->
				<div class="lg:col-span-2 space-y-2">
					<p class="text-xs text-muted-foreground leading-relaxed">
						<strong class="text-foreground">Portée & Objet :</strong> {activeDoc.summary}
					</p>

					<!-- Sections CCTP rattachées -->
					<div class="flex flex-wrap items-center gap-1.5 pt-1">
						<span class="text-[11px] font-semibold text-muted-foreground mr-1">
							Sections CCTP concernées :
						</span>
						{#each activeDoc.relatedSubjectIds as sId}
							{@const subj = deliberationStore.subjects.find((s) => s.id === sId)}
							{#if subj}
								<button
									type="button"
									onclick={() => deliberationStore.selectSubject(sId)}
									class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-mono transition-colors {deliberationStore.activeSubjectId === sId
										? 'bg-primary text-primary-foreground font-bold shadow-2xs'
										: 'bg-muted hover:bg-muted/80 text-foreground border'}"
									title="Sélectionner ce sujet"
								>
									<span>{subj.section_ref}</span>
									<span class="text-[10px] opacity-80">{subj.name}</span>
								</button>
							{/if}
						{/each}
					</div>
				</div>

				<!-- Métadonnées rapides -->
				<div class="rounded-lg bg-muted/40 p-3 border space-y-1.5 text-xs">
					<div class="flex justify-between text-muted-foreground">
						<span>Catégorie :</span>
						<strong class="text-foreground">{activeDoc.categoryLabel}</strong>
					</div>
					<div class="flex justify-between text-muted-foreground">
						<span>Volume :</span>
						<strong class="text-foreground">{activeDoc.pageCount ? `${activeDoc.pageCount} pages` : 'N/A'}</strong>
					</div>
					<div class="flex justify-between text-muted-foreground">
						<span>Clauses extraites :</span>
						<strong class="font-mono text-primary">{activeDoc.keyClauses.length} identifiées</strong>
					</div>
				</div>
			</div>

			<!-- 2.1 IDÉES CLÉS DU DOCUMENT SÉLECTIONNÉ -->
			{#if activeDoc.keyIdeas && activeDoc.keyIdeas.length > 0}
				<div class="rounded-xl border border-primary/20 bg-primary/[0.03] p-3.5 space-y-2">
					<div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
						<Lightbulb class="h-4 w-4" />
						<span>Idées Clés & Objectifs Stratégiques ({activeDoc.keyIdeas.length})</span>
					</div>
					<div class="grid grid-cols-1 md:grid-cols-3 gap-2">
						{#each activeDoc.keyIdeas as idea}
							<div class="flex items-start gap-2 bg-background p-2.5 rounded-lg border text-xs leading-relaxed text-foreground shadow-2xs">
								<CheckCircle2 class="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
								<span>{idea}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- 2.2 RÈGLES QUI EN DÉCOULENT (PRESCRIPTIONS INDUITES) -->
			{#if activeDoc.inducedRules && activeDoc.inducedRules.length > 0}
				<div class="rounded-xl border border-amber-500/25 bg-amber-500/[0.03] p-3.5 space-y-2">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
							<Scale class="h-4 w-4" />
							<span>Règles d'Ingénierie Induites par ce Document ({activeDoc.inducedRules.length})</span>
						</div>
						<span class="text-[11px] text-muted-foreground font-mono">Prescriptions directes</span>
					</div>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
						{#each activeDoc.inducedRules as rule}
							<div class="rounded-lg border bg-background p-3 space-y-1.5 shadow-2xs">
								<div class="flex items-center justify-between gap-2">
									<strong class="text-xs font-bold text-foreground">{rule.title}</strong>
									<span class="font-mono text-[10px] px-1.5 py-0.2 rounded font-bold uppercase {rule.type === 'obligation'
										? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20'
										: rule.type === 'interdiction'
											? 'bg-destructive/10 text-destructive border border-destructive/20'
											: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20'}">
										{rule.type}
									</span>
								</div>
								<p class="text-xs text-muted-foreground leading-relaxed">
									{rule.description}
								</p>
								{#if rule.targetSubjectId}
									{@const subj = deliberationStore.subjects.find((s) => s.id === rule.targetSubjectId)}
									{#if subj}
										<div class="flex items-center justify-between pt-1 border-t text-[11px]">
											<span class="text-muted-foreground">Section liée :</span>
											<button
												type="button"
												onclick={() => jumpToSubjectAndDeliberate(rule.targetSubjectId!)}
												class="font-mono font-semibold text-primary hover:underline inline-flex items-center gap-1"
											>
												<span>{subj.section_ref} {subj.name}</span>
												<ArrowRight class="h-3 w-3" />
											</button>
										</div>
									{/if}
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- 2.3 RÈGLES DE LA BASE DE CONNAISSANCES APPLICABLES (SMARTMEMORY / ADRS) -->
			<div class="rounded-xl border border-violet-500/25 bg-violet-500/[0.03] p-3.5 space-y-2">
				<div class="flex items-center justify-between flex-wrap gap-2">
					<div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-400">
						<BrainCircuit class="h-4 w-4" />
						<span>Règles de la Base de Connaissances Applicables ({applicableRules.length})</span>
					</div>
					<span class="inline-flex items-center gap-1 rounded bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/20 px-2 py-0.5 text-[10px] font-semibold">
						<ShieldCheck class="h-3 w-3" />
						Doctrines & ADRs Entreprise
					</span>
				</div>
				<p class="text-[11px] text-muted-foreground">
					Normes internes, standards de durcissement et décisions d'architecture (ADRs) cadrant ce document {activeDoc.origin === 'client' ? 'client' : 'contributeur'} :
				</p>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
					{#each applicableRules as rule}
						<div class="rounded-lg border bg-background p-3 space-y-1.5 shadow-2xs">
							<div class="flex items-start justify-between gap-2">
								<div class="space-y-0.5">
									<span class="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-700 dark:text-violet-300">
										{rule.id}
									</span>
									<h5 class="text-xs font-bold text-foreground">
										{rule.title}
									</h5>
								</div>
								<span class="font-mono text-[10px] px-1.5 py-0.2 rounded font-bold uppercase shrink-0 {rule.enforcementLevel === 'mandatory'
									? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20'
									: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'}">
									{rule.enforcementLevel === 'mandatory' ? 'Obligatoire' : 'Recommandé'}
								</span>
							</div>
							<p class="text-xs text-muted-foreground leading-relaxed">
								{rule.summary}
							</p>
							<div class="rounded bg-muted/40 p-2 text-[11px] text-foreground space-y-0.5 border">
								<div class="text-muted-foreground font-semibold">Ligne directrice entreprise :</div>
								<div>{rule.guidance}</div>
								<div class="text-[10px] text-muted-foreground font-mono pt-1">
									Réf : {rule.referenceDocument}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- 2.4 Clauses Clés & Exigences Extraites du Document Actif -->
			<div class="pt-2 border-t space-y-2">
				<div class="flex items-center justify-between">
					<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
						Clauses & Exigences Clés ({activeDoc.keyClauses.length})
					</span>
					{#if activeDoc.relatedSubjectIds.length > 0}
						<button
							type="button"
							onclick={() => jumpToSubjectAndDeliberate(activeDoc.relatedSubjectIds[0])}
							class="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
						>
							<span>Délibérer sur {activeDoc.relatedSubjectIds[0]}</span>
							<ArrowRight class="h-3 w-3" />
						</button>
					{/if}
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
					{#each activeDoc.keyClauses as clause}
						<div class="rounded-lg border bg-card p-3 space-y-1.5 shadow-2xs">
							<div class="flex items-start justify-between gap-2">
								<div class="flex items-center gap-1.5">
									<span class="font-mono text-[11px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
										{clause.clauseRef}
									</span>
									<h4 class="text-xs font-bold text-foreground">
										{clause.title}
									</h4>
								</div>
								<span
									class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0 {clause.criticality ===
									'bloquant'
										? 'bg-destructive/10 text-destructive border border-destructive/20'
										: clause.criticality === 'majeur'
											? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
											: 'bg-muted text-muted-foreground'}"
								>
									{clause.criticality}
								</span>
							</div>

							<p class="text-xs text-muted-foreground leading-relaxed italic">
								« {clause.text} »
							</p>

							{#if clause.impactSummary}
								<div class="rounded bg-muted/50 p-1.5 text-[11px] text-foreground border border-border/40 flex items-start gap-1">
									<Sparkles class="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
									<span><strong>Impact :</strong> {clause.impactSummary}</span>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- 3. EXPLORATEUR GLOBAL DU CORPUS (Filtrage & Distinction Client vs Externe) -->
	<div class="rounded-xl border bg-card p-4 shadow-xs space-y-3">
		<!-- Barre d'outils & Onglets de filtrage -->
		<div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
			<!-- Onglets de filtrage par Origine -->
			<div class="flex items-center gap-1 bg-muted/60 p-1 rounded-lg overflow-x-auto text-xs">
				<button
					type="button"
					onclick={() => (activeTab = 'all')}
					class="px-3 py-1.5 rounded-md font-semibold transition-all whitespace-nowrap {activeTab === 'all'
						? 'bg-background text-foreground shadow-xs'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<span>Tous ({stats.totalDocuments})</span>
				</button>

				<button
					type="button"
					onclick={() => (activeTab = 'client')}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all whitespace-nowrap {activeTab ===
					'client'
						? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 shadow-xs'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<Building2 class="h-3.5 w-3.5" />
					<span>Documents Client ({stats.clientDocumentsCount})</span>
				</button>

				<button
					type="button"
					onclick={() => (activeTab = 'external')}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all whitespace-nowrap {activeTab ===
					'external'
						? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shadow-xs'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<Globe class="h-3.5 w-3.5" />
					<span>Docs Externes Contributeurs ({stats.externalDocumentsCount})</span>
				</button>
			</div>

			<!-- Recherche & Filtre Sujet Actif -->
			<div class="flex items-center gap-2">
				{#if activeSubject}
					<button
						type="button"
						onclick={() => (filterByActiveSubject = !filterByActiveSubject)}
						class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors {filterByActiveSubject
							? 'bg-primary text-primary-foreground border-primary font-bold'
							: 'bg-background text-muted-foreground hover:bg-muted'}"
						title="Ne montrer que les documents qui s'appliquent à {activeSubject.section_ref}"
					>
						<Filter class="h-3 w-3" />
						<span>Liés à {activeSubject.section_ref}</span>
					</button>
				{/if}

				<div class="relative w-full sm:w-56">
					<Search class="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Rechercher norme, clause..."
						class="w-full rounded-lg border bg-background pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary shadow-xs"
					/>
				</div>
			</div>
		</div>

		<!-- Grille des Documents du Corpus -->
		{#if filteredDocs.length === 0}
			<div class="text-center py-8 text-xs text-muted-foreground border rounded-lg border-dashed">
				Aucun document ne correspond à ce critère de recherche.
			</div>
		{:else}
			<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
				{#each filteredDocs as doc}
					{@const isActive = activeDoc?.id === doc.id}
					<div
						role="button"
						tabindex="0"
						class="rounded-xl border p-3.5 flex flex-col justify-between transition-all cursor-pointer shadow-2xs hover:shadow-xs {isActive
							? 'border-primary ring-2 ring-primary/30 bg-primary/[0.02]'
							: doc.origin === 'client'
								? 'border-blue-500/30 hover:border-blue-500/60 bg-card'
								: 'border-emerald-500/30 hover:border-emerald-500/60 bg-card'}"
						onclick={() => selectDocument(doc.id)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								selectDocument(doc.id);
							}
						}}
					>
						<div>
							<!-- Header de Carte : Origine & Statut Actif -->
							<div class="flex items-center justify-between gap-2 mb-2">
								<!-- Badge Origine -->
								{#if doc.origin === 'client'}
									<span class="inline-flex items-center gap-1 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 px-2 py-0.5 text-[10px] font-bold">
										<Building2 class="h-3 w-3" />
										Client · MOA
									</span>
								{:else}
									<span class="inline-flex items-center gap-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold">
										<Globe class="h-3 w-3" />
										Externe · Contributeur
									</span>
								{/if}

								<div class="flex items-center gap-1.5">
									<span class="text-[10px] font-mono font-bold text-muted-foreground">
										{doc.id}
									</span>
									{#if isActive}
										<span class="inline-flex items-center gap-0.5 rounded-full bg-primary/10 text-primary px-1.5 py-0.2 font-mono text-[9px] font-bold">
											<CheckCircle2 class="h-2.5 w-2.5" />
											ACTIF
										</span>
									{/if}
								</div>
							</div>

							<!-- Titre Document -->
							<h4 class="text-xs font-bold text-foreground leading-snug mb-1">
								{doc.title}
							</h4>

							<!-- Origine / Contributeur explicite -->
							<p class="text-[11px] text-muted-foreground mb-2">
								{#if doc.origin === 'client'}
									<span class="text-blue-700 dark:text-blue-300 font-medium">Source :</span> {doc.sourceOrAuthor}
								{:else}
									<span class="text-emerald-700 dark:text-emerald-400 font-medium">Ajouté par :</span> {doc.sourceOrAuthor}
									{#if doc.contributorRole}
										<span class="opacity-80">({doc.contributorRole})</span>
									{/if}
								{/if}
							</p>

							<!-- Résumé court -->
							<p class="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed mb-2.5">
								{doc.summary}
							</p>
						</div>

						<div>
							<!-- Sections concernées & Compteur de clauses -->
							<div class="pt-2 border-t flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
								<div class="flex items-center gap-1 overflow-hidden">
									{#each doc.relatedSubjectIds as sId}
										{@const subj = deliberationStore.subjects.find((s) => s.id === sId)}
										<span class="rounded bg-muted px-1.5 py-0.2 font-mono text-[10px] font-bold text-foreground">
											{subj ? subj.section_ref : sId}
										</span>
									{/each}
								</div>

								<div class="flex items-center gap-1 font-mono text-[10px] text-primary shrink-0">
									<FileText class="h-3 w-3" />
									<span>{doc.extractedClausesCount} clauses</span>
								</div>
							</div>

							<!-- Indicateur Sélectionner / Travailler -->
							<div
								class="mt-2.5 w-full rounded-md py-1 px-2 text-xs font-semibold text-center transition-colors {isActive
									? 'bg-primary text-primary-foreground'
									: 'bg-muted/70 text-foreground'}"
							>
								{isActive ? 'Document actif de travail' : 'Sélectionner ce document'}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Boîte de dialogue d'ajout de document contributeur -->
<AddContributorDocDialog
	open={isAddDialogOpen}
	onclose={() => (isAddDialogOpen = false)}
/>

<!-- Boîte de dialogue de dépouillement CCTP via LLMOps -->
<RfpShredderDialog bind:open={isShredDialogOpen} />


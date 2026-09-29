<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { goto } from '$app/navigation';
	import {
		WORKSPACE_PRESETS,
		DEFAULT_PARTICIPANTS,
		type WorkspaceCreationInput,
		type EngagementType,
		type ProjectParticipant,
		type UpstreamDocInput,
		type InitialSubjectInput
	} from '$lib/domain/engagements';
	import type { ArchitectRole } from '$lib/types/epistemic';
	import InviteExpertDialog from '$lib/components/deliberation/InviteExpertDialog.svelte';
	import RfpConfrontationDialog from '$lib/components/deliberation/RfpConfrontationDialog.svelte';
	import {
		FolderPlus,
		Sparkles,
		Compass,
		ShieldCheck,
		ArrowRight,
		ArrowLeft,
		CheckCircle2,
		Plus,
		Trash2,
		BookOpen,
		Users,
		UserPlus,
		Layers,
		Check,
		FileText,
		BrainCircuit
	} from 'lucide-svelte';

	let isInviteOpen = $state(false);
	let isRfpImporterOpen = $state(false);

	type Step = 1 | 2 | 3 | 4 | 5;
	let currentStep = $state<Step>(1);

	function handleRfpImported(result: {
		document: UpstreamDocInput;
		initialSubjects: InitialSubjectInput[];
	}) {
		upstreamDocs = [...upstreamDocs, result.document];
		if (result.initialSubjects && result.initialSubjects.length > 0) {
			initialSubjects = [...initialSubjects, ...result.initialSubjects];
		}
	}

	// Étape 1 : Cadrage
	let title = $state('');
	let customId = $state('');
	let projectType = $state<EngagementType>('project_rfp');
	let badge = $state('');
	let description = $state('');
	let targetDate = $state('2027-12-31');
	let budget = $state('1.8 M€');

	// Étape 2 : Stratégie
	let objectives = $state<string[]>([
		'Disponibilité continue 99.999% sans point unique de défaillance',
		'Souveraineté logicielle & matérielle (100% On-Premise / Local)',
		'Conformité stricte Directive NIS2 & Doctrine ANSSI'
	]);
	let newObjective = $state('');

	let principles = $state<string[]>([
		'Sécurité Zero-Trust par défaut à tous les étages',
		'Anti-blabla : concision formelle et chiffrage des conséquences matérielles',
		'Validation humaine obligatoire sur tout énoncé vérifié'
	]);
	let newPrinciple = $state('');

	let constraints = $state<string[]>([
		'Hébergement exclusivement en France / Union Européenne',
		'Plafond budgétaire infrastructure non dépassable'
	]);
	let newConstraint = $state('');

	// Étape 3 : Docs Amonts
	let upstreamDocs = $state<UpstreamDocInput[]>([
		{
			title: 'CCTP Lot 1 · Cahier des Charges Principal & Spécifications',
			category: 'cctp',
			categoryLabel: 'CCTP Contractuel',
			sourceOrAuthor: 'Maîtrise d\'Ouvrage Client',
			version: 'v1.0',
			pageCount: 120,
			summary: 'Exigences contractuelles d\'infrastructure, de résilience et de haute disponibilité pour la plateforme cible.',
			keyIdeas: [
				'Réseau souverain dédié aux flux critiques.',
				'Séparation étanche des plans de contrôle et usagers.'
			],
			clauses: [
				{
					clauseRef: 'Art. 2.1.1',
					title: 'Redondance active-active',
					text: 'L\'ensemble des composants nodaux doit fonctionner en mode actif-actif sans perte de paquets lors d\'une bascule.',
					criticality: 'bloquant',
					impactSummary: 'Conditionne le choix de l\'orchestrateur et des répartiteurs'
				}
			]
		}
	]);

	let selectedStandards = $state<string[]>(['DOC-EXT-03', 'DOC-EXT-04']);

	// Étape 4 : Participants
	let participants = $state<ProjectParticipant[]>([
		...DEFAULT_PARTICIPANTS.map((p) => ({ ...p }))
	]);

	// Étape 5 : Sujets initiaux
	let initialSubjects = $state<InitialSubjectInput[]>([
		{
			sectionRef: '§1.1',
			name: 'Cadrage Stratégique & Exigences Globales',
			waitingForRole: 'lead_architect',
			effort: 'M',
			initialRetenu: ['Validation formelle des principes directeurs'],
			initialHypothesis: 'Périmètre validé par le comité d\'architecture',
			initialQuestion: 'Quels sont les jalons de validation du comité de direction ?'
		},
		{
			sectionRef: '§2.1',
			name: 'Socle d\'Infrastructure & Résilience N+1',
			waitingForRole: 'infra_expert_architect',
			effort: 'L',
			initialRetenu: ['Architecture hautement disponible N+1'],
			initialHypothesis: 'Hébergement souverain sans dépendance externe',
			initialQuestion: 'Quelle matrice de compatibilité matérielle minimale ?'
		},
		{
			sectionRef: '§3.1',
			name: 'Sécurité Zero-Trust & Homologation ANSSI/NIS2',
			waitingForRole: 'security_architect',
			effort: 'M',
			initialRetenu: ['Chiffrement systématique au repos et en transit'],
			initialHypothesis: 'Conformité NIS2 et guide d\'hygiène ANSSI',
			initialQuestion: 'Quelles exigences de chiffrement pour les flux d\'administration ?'
		}
	]);

	function applyPreset(presetId: string) {
		const found = WORKSPACE_PRESETS.find((p) => p.id === presetId);
		if (!found) return;
		const p = found.preset;
		title = p.title;
		customId = p.id || '';
		projectType = p.type;
		badge = p.badge || '';
		description = p.description;
		targetDate = p.strategy.targetDate || '2027-12-31';
		budget = p.strategy.budget || '1.8 M€';
		objectives = [...p.strategy.objectives];
		principles = [...p.strategy.principles];
		constraints = [...p.strategy.constraints];
		if (p.upstreamDocuments && p.upstreamDocuments.length > 0) {
			upstreamDocs = JSON.parse(JSON.stringify(p.upstreamDocuments));
		}
		if (p.linkedStandardIds) {
			selectedStandards = [...p.linkedStandardIds];
		}
		if (p.initialSubjects) {
			initialSubjects = JSON.parse(JSON.stringify(p.initialSubjects));
		}
	}

	function addObjective() {
		if (!newObjective.trim()) return;
		objectives = [...objectives, newObjective.trim()];
		newObjective = '';
	}

	function removeObjective(index: number) {
		objectives = objectives.filter((_, i) => i !== index);
	}

	function addPrinciple() {
		if (!newPrinciple.trim()) return;
		principles = [...principles, newPrinciple.trim()];
		newPrinciple = '';
	}

	function removePrinciple(index: number) {
		principles = principles.filter((_, i) => i !== index);
	}

	function addConstraint() {
		if (!newConstraint.trim()) return;
		constraints = [...constraints, newConstraint.trim()];
		newConstraint = '';
	}

	function removeConstraint(index: number) {
		constraints = constraints.filter((_, i) => i !== index);
	}

	function addEmptyUpstreamDoc() {
		upstreamDocs = [
			...upstreamDocs,
			{
				title: `Document Amont #${upstreamDocs.length + 1}`,
				category: 'cctp',
				categoryLabel: 'Spécification Technique',
				sourceOrAuthor: 'Donneur d\'ordre',
				version: 'v1.0',
				pageCount: 30,
				summary: 'Document contractuel ou expression de besoin amont.',
				keyIdeas: ['Spécification initiale'],
				clauses: [
					{
						clauseRef: '§1.1',
						title: 'Exigence principale',
						text: 'Texte de l\'exigence amont à instruire.',
						criticality: 'bloquant'
					}
				]
			}
		];
	}

	function removeUpstreamDoc(index: number) {
		upstreamDocs = upstreamDocs.filter((_, i) => i !== index);
	}

	function toggleStandard(id: string) {
		if (selectedStandards.includes(id)) {
			selectedStandards = selectedStandards.filter((s) => s !== id);
		} else {
			selectedStandards = [...selectedStandards, id];
		}
	}

	function handleLaunchWorkspace() {
		if (!title.trim()) {
			title = 'Nouveau Projet d\'Architecture';
		}

		const payload: WorkspaceCreationInput = {
			id: customId.trim() || undefined,
			title: title.trim(),
			type: projectType,
			badge: badge.trim() || undefined,
			description: description.trim() || 'Espace de réflexion et de délibération d\'architecture.',
			strategy: {
				objectives: objectives.length > 0 ? objectives : ['Conformité aux exigences'],
				principles: principles.length > 0 ? principles : ['Validation formelle'],
				constraints: constraints.length > 0 ? constraints : ['Plafond budgétaire respecté'],
				targetDate,
				budget
			},
			participants,
			upstreamDocuments: upstreamDocs,
			linkedStandardIds: selectedStandards,
			initialSubjects
		};

		deliberationStore.createNewWorkspace(payload);
		goto('/deliberation');
	}
</script>

<svelte:head>
	<title>Archinex · Nouvel Espace de Travail (Projet)</title>
</svelte:head>

<div class="max-w-5xl mx-auto space-y-6 pb-12">
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- EN-TÊTE PRINCIPAL                                                         -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="rounded-2xl border bg-card p-6 shadow-sm space-y-3">
		<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
			<div class="flex items-center gap-3">
				<div class="p-3 rounded-xl bg-primary text-primary-foreground shadow-xs">
					<FolderPlus class="h-6 w-6" />
				</div>
				<div>
					<div class="flex items-center gap-2">
						<h1 class="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
							Initialiser un Nouvel Espace de Travail
						</h1>
						<span class="inline-flex items-center gap-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 px-2 py-0.5 text-[10px] font-semibold">
							<ShieldCheck class="h-3 w-3" />
							100% Local & Souverain
						</span>
					</div>
					<p class="text-xs sm:text-sm text-muted-foreground mt-0.5">
						Cadrage du projet, stratégie d'architecture, versement des documents amonts et assignation de l'équipe
					</p>
				</div>
			</div>

			<a
				href="/workspaces"
				class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors self-start sm:self-center"
			>
				<span>← Retour aux Espaces</span>
			</a>
		</div>

		<!-- Invariant Clé Rappelé -->
		<div class="pt-3 border-t text-xs text-muted-foreground leading-relaxed flex items-center gap-2">
			<ShieldCheck class="h-4 w-4 text-emerald-600 shrink-0" />
			<span>
				<strong>Règle d'or Archinex :</strong> Seule la base de connaissances s'enrichit au fil des engagements et reste <strong>commune et valide de facto</strong> pour l'ensemble des projets.
			</span>
		</div>
	</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- BARRE D'ÉTAPES DU WIZARD                                                  -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="grid grid-cols-2 sm:grid-cols-5 gap-2 p-1.5 rounded-xl border bg-muted/30">
		<button
			type="button"
			onclick={() => (currentStep = 1)}
			class="p-2.5 rounded-lg text-left transition-all {currentStep === 1 ? 'bg-card text-foreground shadow-xs border border-primary/30' : 'text-muted-foreground hover:text-foreground'}"
		>
			<span class="text-[10px] font-mono font-bold uppercase block text-primary">Étape 1</span>
			<span class="text-xs font-bold truncate block mt-0.5">Description Projet</span>
		</button>

		<button
			type="button"
			onclick={() => (currentStep = 2)}
			class="p-2.5 rounded-lg text-left transition-all {currentStep === 2 ? 'bg-card text-foreground shadow-xs border border-primary/30' : 'text-muted-foreground hover:text-foreground'}"
		>
			<span class="text-[10px] font-mono font-bold uppercase block text-primary">Étape 2</span>
			<span class="text-xs font-bold truncate block mt-0.5">Stratégie Globale</span>
		</button>

		<button
			type="button"
			onclick={() => (currentStep = 3)}
			class="p-2.5 rounded-lg text-left transition-all {currentStep === 3 ? 'bg-card text-foreground shadow-xs border border-primary/30' : 'text-muted-foreground hover:text-foreground'}"
		>
			<span class="text-[10px] font-mono font-bold uppercase block text-primary">Étape 3</span>
			<span class="text-xs font-bold truncate block mt-0.5">Docs Amonts</span>
		</button>

		<button
			type="button"
			onclick={() => (currentStep = 4)}
			class="p-2.5 rounded-lg text-left transition-all {currentStep === 4 ? 'bg-card text-foreground shadow-xs border border-primary/30' : 'text-muted-foreground hover:text-foreground'}"
		>
			<span class="text-[10px] font-mono font-bold uppercase block text-primary">Étape 4</span>
			<span class="text-xs font-bold truncate block mt-0.5">Participants</span>
		</button>

		<button
			type="button"
			onclick={() => (currentStep = 5)}
			class="p-2.5 rounded-lg text-left transition-all {currentStep === 5 ? 'bg-card text-foreground shadow-xs border border-primary/30' : 'text-muted-foreground hover:text-foreground'}"
		>
			<span class="text-[10px] font-mono font-bold uppercase block text-primary">Étape 5</span>
			<span class="text-xs font-bold truncate block mt-0.5">Lancement</span>
		</button>
	</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- CONTENU DE L'ÉTAPE COURANTE                                               -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="rounded-2xl border bg-card p-6 shadow-sm">
		{#if currentStep === 1}
			<!-- Étape 1 : Cadrage & Description -->
			<div class="space-y-6">
				<!-- Présets Rapides -->
				<div class="rounded-xl border bg-primary/5 border-primary/20 p-4 space-y-3">
					<div class="flex items-center justify-between">
						<span class="text-xs font-bold text-primary flex items-center gap-1.5">
							<Sparkles class="h-4 w-4" />
							Démarrage Éclair · Présets Métiers
						</span>
						<span class="text-xs text-muted-foreground">Pré-remplit les 5 étapes en 1 clic</span>
					</div>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
						{#each WORKSPACE_PRESETS as p}
							<button
								type="button"
								onclick={() => applyPreset(p.id)}
								class="text-left p-3 rounded-lg border bg-card hover:bg-muted/60 transition-all border-border hover:border-primary/40"
							>
								<div class="font-bold text-foreground text-xs">{p.name}</div>
								<div class="text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-relaxed">{p.description}</div>
							</button>
						{/each}
					</div>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
					<div class="space-y-1.5 sm:col-span-2">
						<label for="step1-title" class="font-bold text-foreground">Titre du Projet / Contexte de Réflexion *</label>
						<input
							id="step1-title"
							type="text"
							bind:value={title}
							placeholder="ex: Réseau Mobile Ferroviaire FRMCS · Lot Sol-Bord & Cœur"
							class="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-1 focus:ring-primary font-medium"
						/>
					</div>

					<div class="space-y-1.5">
						<label for="step1-type" class="font-bold text-foreground">Type d'Engagement</label>
						<select
							id="step1-type"
							bind:value={projectType}
							class="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-1 focus:ring-primary"
						>
							<option value="project_rfp">Appel d'Offres Contractuel (RFP Client)</option>
							<option value="generic_blueprint">Socle d'Architecture Vierge (Blueprint)</option>
							<option value="audit_resilience">Audit de Résilience & Conformité NIS2</option>
							<option value="poc_migration">POC & Cadrage de Migration</option>
						</select>
					</div>

					<div class="space-y-1.5">
						<label for="step1-id" class="font-bold text-foreground">Identifiant Unique / Slug (Optionnel)</label>
						<input
							id="step1-id"
							type="text"
							bind:value={customId}
							placeholder="ex: frmcs-rail-2027"
							class="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono focus:ring-1 focus:ring-primary"
						/>
					</div>

					<div class="space-y-1.5 sm:col-span-2">
						<label for="step1-desc" class="font-bold text-foreground">Description Détaillée & Périmètre *</label>
						<textarea
							id="step1-desc"
							bind:value={description}
							rows="4"
							placeholder="Présentez le contexte, les enjeux métiers, les frontières du système et les contraintes macro..."
							class="w-full rounded-lg border bg-background p-3 text-xs focus:ring-1 focus:ring-primary leading-relaxed"
						></textarea>
					</div>

					<div class="space-y-1.5">
						<label for="step1-budget" class="font-bold text-foreground">Enveloppe Budgétaire Estimée</label>
						<input
							id="step1-budget"
							type="text"
							bind:value={budget}
							placeholder="ex: 2.4 M€"
							class="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-1 focus:ring-primary"
						/>
					</div>

					<div class="space-y-1.5">
						<label for="step1-date" class="font-bold text-foreground">Date Cible de Livraison / Mise en Service</label>
						<input
							id="step1-date"
							type="date"
							bind:value={targetDate}
							class="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-1 focus:ring-primary font-mono"
						/>
					</div>
				</div>
			</div>

		{:else if currentStep === 2}
			<!-- Étape 2 : Stratégie Globale -->
			<div class="space-y-6 text-xs">
				<!-- Objectifs Stratégiques -->
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<label for="step2-obj" class="font-bold text-foreground">Objectifs Stratégiques Macro</label>
						<span class="text-[11px] text-muted-foreground">{objectives.length} objectifs</span>
					</div>
					<div class="flex gap-2">
						<input
							id="step2-obj"
							type="text"
							bind:value={newObjective}
							placeholder="Ajouter un objectif stratégique..."
							onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addObjective())}
							class="flex-1 rounded-lg border bg-background px-3 py-2 text-xs focus:ring-1 focus:ring-primary"
						/>
						<button
							type="button"
							onclick={addObjective}
							class="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
						>
							Ajouter
						</button>
					</div>
					<div class="space-y-1.5 mt-2">
						{#each objectives as obj, i}
							<div class="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
								<span class="font-medium text-foreground">{obj}</span>
								<button
									type="button"
									onclick={() => removeObjective(i)}
									class="p-1 text-muted-foreground hover:text-destructive transition-colors ml-2"
								>
									<Trash2 class="h-4 w-4" />
								</button>
							</div>
						{/each}
					</div>
				</div>

				<!-- Principes Directeurs -->
				<div class="space-y-2 pt-3 border-t">
					<div class="flex items-center justify-between">
						<label for="step2-pr" class="font-bold text-foreground">Principes Directeurs d'Architecture</label>
						<span class="text-[11px] text-muted-foreground">{principles.length} principes</span>
					</div>
					<div class="flex gap-2">
						<input
							id="step2-pr"
							type="text"
							bind:value={newPrinciple}
							placeholder="ex: Zero-Trust par défaut, concision télégraphique..."
							onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addPrinciple())}
							class="flex-1 rounded-lg border bg-background px-3 py-2 text-xs focus:ring-1 focus:ring-primary"
						/>
						<button
							type="button"
							onclick={addPrinciple}
							class="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
						>
							Ajouter
						</button>
					</div>
					<div class="space-y-1.5 mt-2">
						{#each principles as pr, i}
							<div class="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
								<span class="font-medium text-primary">⚖️ {pr}</span>
								<button
									type="button"
									onclick={() => removePrinciple(i)}
									class="p-1 text-muted-foreground hover:text-destructive transition-colors ml-2"
								>
									<Trash2 class="h-4 w-4" />
								</button>
							</div>
						{/each}
					</div>
				</div>

				<!-- Contraintes / Lignes Rouges -->
				<div class="space-y-2 pt-3 border-t">
					<div class="flex items-center justify-between">
						<label for="step2-cr" class="font-bold text-foreground">Contraintes & Lignes Rouges Non Négociables</label>
						<span class="text-[11px] text-muted-foreground">{constraints.length} contraintes</span>
					</div>
					<div class="flex gap-2">
						<input
							id="step2-cr"
							type="text"
							bind:value={newConstraint}
							placeholder="ex: Hébergement exclusivement en France / UE..."
							onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addConstraint())}
							class="flex-1 rounded-lg border bg-background px-3 py-2 text-xs focus:ring-1 focus:ring-primary"
						/>
						<button
							type="button"
							onclick={addConstraint}
							class="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
						>
							Ajouter
						</button>
					</div>
					<div class="space-y-1.5 mt-2">
						{#each constraints as c, i}
							<div class="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
								<span class="font-medium text-amber-700 dark:text-amber-400">⛔ {c}</span>
								<button
									type="button"
									onclick={() => removeConstraint(i)}
									class="p-1 text-muted-foreground hover:text-destructive transition-colors ml-2"
								>
									<Trash2 class="h-4 w-4" />
								</button>
							</div>
						{/each}
					</div>
				</div>
			</div>

		{:else if currentStep === 3}
			<!-- Étape 3 : Documents Amonts & Patrimoine Commun -->
			<div class="space-y-6 text-xs">
				<div class="rounded-xl border bg-emerald-500/10 border-emerald-500/30 p-4 flex items-start gap-3">
					<ShieldCheck class="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
					<div class="space-y-1">
						<h3 class="font-bold text-emerald-900 dark:text-emerald-200">
							Invariant Épistémique · Patrimoine Commun Enrichi
						</h3>
						<p class="text-xs text-muted-foreground leading-relaxed">
							Chaque document amont fourni ici rejoint la base de connaissances partagée d'Archinex. Il est conservé et reste valide de facto pour la délibération de ce projet et des futurs engagements.
						</p>
					</div>
				</div>

				<!-- Documents Amonts Spécifiques -->
				<div class="space-y-3">
					<div class="flex items-center justify-between gap-3">
						<h3 class="text-sm font-bold text-foreground">Documents Amonts Fournis pour ce Projet</h3>
						<div class="flex items-center gap-2">
							<button
								type="button"
								onclick={() => (isRfpImporterOpen = true)}
								class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20 font-bold transition-colors cursor-pointer"
							>
								<BrainCircuit class="h-3.5 w-3.5" />
								<span>Importer & Confronter un RFP</span>
							</button>
							<button
								type="button"
								onclick={addEmptyUpstreamDoc}
								class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-primary/10 text-primary border-primary/25 hover:bg-primary/20 font-semibold cursor-pointer"
							>
								<Plus class="h-3.5 w-3.5" />
								<span>Ajouter manuellement</span>
							</button>
						</div>
					</div>

					<div class="space-y-3">
						{#each upstreamDocs as doc, idx}
							<div class="p-4 rounded-xl border bg-card space-y-3 shadow-2xs">
								<div class="flex items-center justify-between gap-3">
									<input
										type="text"
										bind:value={doc.title}
										placeholder="Titre officiel du document amont..."
										class="flex-1 font-bold text-sm bg-transparent border-b border-border pb-1 focus:border-primary outline-hidden"
									/>
									<button
										type="button"
										onclick={() => removeUpstreamDoc(idx)}
										class="p-1 text-muted-foreground hover:text-destructive"
										title="Supprimer"
									>
										<Trash2 class="h-4 w-4" />
									</button>
								</div>

								<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
									<div>
										<label for="step3-cat-{idx}" class="text-[10px] text-muted-foreground font-semibold block mb-1">Catégorie</label>
										<select
											id="step3-cat-{idx}"
											bind:value={doc.category}
											class="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs"
										>
											<option value="cctp">CCTP Contractuel</option>
											<option value="rfp_annex">Annexe Technique RFP</option>
											<option value="business_spec">Spécification Métier</option>
											<option value="regulation">Réglementation</option>
											<option value="guideline">Guide d'Architecture</option>
										</select>
									</div>
									<div>
										<label for="step3-src-{idx}" class="text-[10px] text-muted-foreground font-semibold block mb-1">Source / Donneur d'Ordre</label>
										<input
											id="step3-src-{idx}"
											type="text"
											bind:value={doc.sourceOrAuthor}
											placeholder="ex: Direction Client"
											class="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs"
										/>
									</div>
									<div>
										<label for="step3-ver-{idx}" class="text-[10px] text-muted-foreground font-semibold block mb-1">Version</label>
										<input
											id="step3-ver-{idx}"
											type="text"
											bind:value={doc.version}
											placeholder="v1.0"
											class="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs font-mono"
										/>
									</div>
								</div>

								<div>
									<label for="step3-sum-{idx}" class="text-[10px] text-muted-foreground font-semibold block mb-1">Résumé Exécutif</label>
									<textarea
										id="step3-sum-{idx}"
										bind:value={doc.summary}
										rows="2"
										placeholder="Synthèse des exigences critiques..."
										class="w-full rounded-lg border bg-background p-2.5 text-xs"
									></textarea>
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Standards Transverses du Socle Commun -->
				<div class="space-y-3 pt-3 border-t">
					<h3 class="text-sm font-bold text-foreground">
						Lier des Normes & Standards Déjà Présents dans le Socle Commun
					</h3>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
						{#each deliberationStore.commonKnowledgeBase.filter((d) => d.origin === 'contributor_external' || d.category === 'standard' || d.category === 'regulation') as std}
							{@const isChecked = selectedStandards.includes(std.id)}
							<button
								type="button"
								onclick={() => toggleStandard(std.id)}
								class="flex items-start gap-3 p-3 rounded-xl border text-left transition-colors {isChecked
									? 'bg-primary/10 border-primary text-foreground'
									: 'bg-muted/20 border-border text-muted-foreground hover:text-foreground'}"
							>
								<input
									type="checkbox"
									checked={isChecked}
									class="mt-1 rounded text-primary"
									tabindex="-1"
								/>
								<div class="min-w-0 flex-1">
									<div class="font-bold text-xs truncate">{std.title}</div>
									<div class="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{std.sourceOrAuthor} · {std.categoryLabel}</div>
								</div>
							</button>
						{/each}
					</div>
				</div>
			</div>

		{:else if currentStep === 4}
			<!-- Étape 4 : Participants -->
			<div class="space-y-6 text-xs">
				<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
					<div>
						<h3 class="text-sm font-bold text-foreground">Équipe Projet & Experts Habilités</h3>
						<p class="text-xs text-muted-foreground mt-0.5">
							Identifiez les architectes en charge des controverses dialectiques et de l'approbation formelle des énoncés
						</p>
					</div>
					<button
						type="button"
						onclick={() => (isInviteOpen = true)}
						class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20 font-bold self-start sm:self-center transition-colors cursor-pointer"
					>
						<UserPlus class="h-3.5 w-3.5" />
						<span>Inviter un Expert par Email</span>
					</button>
				</div>

				<div class="space-y-3">
					{#each participants as p, idx}
						<div class="p-4 rounded-xl border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
							<div class="space-y-1">
								<div class="flex items-center gap-2">
									<input
										type="text"
										bind:value={p.name}
										class="font-bold text-sm bg-transparent border-b border-border focus:border-primary outline-hidden"
									/>
									{#if p.isLead}
										<span class="rounded bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-bold">
											Arbitre Lead
										</span>
									{/if}
								</div>
								<input
									type="email"
									bind:value={p.email}
									placeholder="email@archinex.local"
									class="text-xs text-muted-foreground bg-transparent border-b border-transparent focus:border-border outline-hidden w-64"
								/>
							</div>

							<div class="flex items-center gap-2">
								<label for="step4-role-{idx}" class="sr-only">Rôle</label>
								<select
									id="step4-role-{idx}"
									bind:value={p.role}
									class="rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold"
								>
									<option value="lead_architect">Lead Architect</option>
									<option value="infra_expert_architect">Architecte Infra / Réseau</option>
									<option value="security_architect">Architecte Sécurité NIS2</option>
									<option value="domain_architect">Architecte Métier</option>
								</select>
							</div>
						</div>
					{/each}
				</div>
			</div>

		{:else if currentStep === 5}
			<!-- Étape 5 : Lancement -->
			<div class="space-y-6 text-xs">
				<div class="rounded-xl border bg-emerald-500/10 border-emerald-500/25 p-4 space-y-1">
					<h3 class="font-bold text-emerald-900 dark:text-emerald-200 text-sm flex items-center gap-2">
						<CheckCircle2 class="h-5 w-5 text-emerald-600" />
						Prêt pour le Lancement du Workbench de Délibération
					</h3>
					<p class="text-xs text-muted-foreground leading-relaxed">
						L'espace de travail "{title || 'Nouveau Projet'}" va être initialisé avec ses sections, ses brouillons télégraphiques et son énoncé racine.
					</p>
				</div>

				<div class="space-y-3">
					<h4 class="font-bold text-foreground text-xs uppercase font-mono">Sections Initiales Structurées :</h4>
					<div class="space-y-2.5">
						{#each initialSubjects as subj}
							<div class="p-3.5 rounded-xl border bg-card space-y-2">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-2">
										<span class="font-mono text-xs font-bold text-primary">{subj.sectionRef}</span>
										<strong class="text-xs">{subj.name}</strong>
									</div>
									<span class="text-[10px] rounded bg-muted px-2 py-0.5 font-mono text-muted-foreground">
										Assigné : {subj.waitingForRole}
									</span>
								</div>
								{#if subj.initialQuestion}
									<div class="text-[11px] text-muted-foreground bg-muted/30 p-2 rounded-lg">
										<strong>Question ouverte initiale :</strong> {subj.initialQuestion}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- CONTRÔLES DE NAVIGATION ET VALIDATION DU WIZARD                           -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div class="flex items-center justify-between">
		<div>
			{#if currentStep > 1}
				<button
					type="button"
					onclick={() => (currentStep = (currentStep - 1) as Step)}
					class="inline-flex items-center gap-2 px-4 py-2 rounded-xl border bg-card hover:bg-muted font-bold text-xs transition-colors"
				>
					<ArrowLeft class="h-4 w-4" />
					<span>Précédent</span>
				</button>
			{/if}
		</div>

		<div class="flex items-center gap-2">
			{#if currentStep < 5}
				<button
					type="button"
					onclick={() => (currentStep = (currentStep + 1) as Step)}
					class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-xs hover:bg-primary/90 transition-colors"
				>
					<span>Étape Suivante</span>
					<ArrowRight class="h-4 w-4" />
				</button>
			{:else}
				<button
					type="button"
					onclick={handleLaunchWorkspace}
					class="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
				>
					<CheckCircle2 class="h-4 w-4" />
					<span>Initialiser l'Espace & Démarrer la Délibération</span>
				</button>
			{/if}
		</div>
	</div>
</div>

<InviteExpertDialog
	bind:open={isInviteOpen}
	onclose={() => (isInviteOpen = false)}
	defaultProjectId={customId || undefined}
	onInvited={(data) => {
		participants = [
			...participants,
			{
				id: `part-${Date.now()}`,
				name: data.name || data.email.split('@')[0],
				role: data.role,
				email: data.email
			}
		];
	}}
/>

<RfpConfrontationDialog
	bind:open={isRfpImporterOpen}
	onclose={() => (isRfpImporterOpen = false)}
	onImported={handleRfpImported}
/>

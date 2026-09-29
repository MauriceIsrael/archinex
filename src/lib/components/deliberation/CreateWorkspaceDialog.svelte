<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
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
	import type { DocumentCategory } from '$lib/domain/corpus';
	import InviteExpertDialog from '$lib/components/deliberation/InviteExpertDialog.svelte';
	import RfpConfrontationDialog from '$lib/components/deliberation/RfpConfrontationDialog.svelte';
	import {
		X,
		FolderPlus,
		Sparkles,
		Layers,
		Compass,
		BookOpen,
		Users,
		UserPlus,
		ListChecks,
		ShieldCheck,
		ArrowRight,
		ArrowLeft,
		CheckCircle2,
		Plus,
		Trash2,
		AlertTriangle,
		FileText,
		BrainCircuit
	} from 'lucide-svelte';

	interface Props {
		open?: boolean;
		onclose: () => void;
	}

	let { open = $bindable(false), onclose }: Props = $props();

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

	// Form State
	let title = $state('');
	let customId = $state('');
	let projectType = $state<EngagementType>('project_rfp');
	let badge = $state('');
	let description = $state('');
	let targetDate = $state('2027-12-31');
	let budget = $state('1.5 M€');

	// Step 2 : Stratégie
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

	// Step 3 : Docs Amonts
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

	// Sélecteur de standards transverses du patrimoine commun
	let selectedStandards = $state<string[]>(['DOC-EXT-03', 'DOC-EXT-04']);

	// Step 4 : Participants
	let participants = $state<ProjectParticipant[]>([
		...DEFAULT_PARTICIPANTS.map((p) => ({ ...p }))
	]);

	// Step 5 : Sujets initiaux
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

	// Application d'un préset
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
		budget = p.strategy.budget || '1.5 M€';
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

	function handleCreateWorkspace() {
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
		onclose();
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
		<div class="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden max-h-[92vh] flex flex-col text-foreground">
			<!-- ─── Header ──────────────────────────────────────────────────────── -->
			<div class="p-4 sm:p-5 border-b flex items-center justify-between bg-muted/30 shrink-0">
				<div class="flex items-center gap-3">
					<div class="p-2.5 rounded-xl bg-primary text-primary-foreground shadow-xs">
						<FolderPlus class="h-5 w-5" />
					</div>
					<div>
						<div class="flex items-center gap-2">
							<h2 class="text-base sm:text-lg font-bold">
								Créer un Nouvel Espace de Travail
							</h2>
							<span class="inline-flex items-center gap-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 px-2 py-0.5 text-[10px] font-semibold">
								<ShieldCheck class="h-3 w-3" />
								100% Souverain & Local
							</span>
						</div>
						<p class="text-xs text-muted-foreground mt-0.5">
							Cadrage, stratégie, documents amonts et participants · Le patrimoine de connaissances reste commun
						</p>
					</div>
				</div>
				<button
					type="button"
					onclick={onclose}
					class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
					aria-label="Fermer"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- ─── Stepper Bar ─────────────────────────────────────────────────── -->
			<div class="px-4 py-2.5 border-b bg-muted/15 flex items-center justify-between overflow-x-auto gap-2 text-xs font-medium">
				<button
					type="button"
					onclick={() => (currentStep = 1)}
					class="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors {currentStep === 1 ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}"
				>
					<span class="font-mono text-[11px] h-4 w-4 rounded-full inline-flex items-center justify-center {currentStep === 1 ? 'bg-white/20' : 'bg-muted'}">1</span>
					<span>Cadrage</span>
				</button>

				<span class="text-muted-foreground/40">›</span>

				<button
					type="button"
					onclick={() => (currentStep = 2)}
					class="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors {currentStep === 2 ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}"
				>
					<span class="font-mono text-[11px] h-4 w-4 rounded-full inline-flex items-center justify-center {currentStep === 2 ? 'bg-white/20' : 'bg-muted'}">2</span>
					<span>Stratégie</span>
				</button>

				<span class="text-muted-foreground/40">›</span>

				<button
					type="button"
					onclick={() => (currentStep = 3)}
					class="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors {currentStep === 3 ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}"
				>
					<span class="font-mono text-[11px] h-4 w-4 rounded-full inline-flex items-center justify-center {currentStep === 3 ? 'bg-white/20' : 'bg-muted'}">3</span>
					<span>Docs Amonts</span>
				</button>

				<span class="text-muted-foreground/40">›</span>

				<button
					type="button"
					onclick={() => (currentStep = 4)}
					class="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors {currentStep === 4 ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}"
				>
					<span class="font-mono text-[11px] h-4 w-4 rounded-full inline-flex items-center justify-center {currentStep === 4 ? 'bg-white/20' : 'bg-muted'}">4</span>
					<span>Participants</span>
				</button>

				<span class="text-muted-foreground/40">›</span>

				<button
					type="button"
					onclick={() => (currentStep = 5)}
					class="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors {currentStep === 5 ? 'bg-primary text-primary-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}"
				>
					<span class="font-mono text-[11px] h-4 w-4 rounded-full inline-flex items-center justify-center {currentStep === 5 ? 'bg-white/20' : 'bg-muted'}">5</span>
					<span>Sujets & Lancement</span>
				</button>
			</div>

			<!-- ─── Body Content (Scrollable) ──────────────────────────────────── -->
			<div class="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 text-xs">

				<!-- ═════════════════════════════════════════════════════════════ -->
				<!-- ÉTAPE 1 : CADRAGE & DESCRIPTION DU PROJET                      -->
				<!-- ═════════════════════════════════════════════════════════════ -->
				{#if currentStep === 1}
					<div class="space-y-4 animate-in fade-in duration-100">
						<!-- Démarrage rapide avec présélection -->
						<div class="rounded-xl border bg-primary/5 border-primary/20 p-3.5 space-y-2">
							<div class="flex items-center justify-between">
								<span class="text-xs font-bold text-primary flex items-center gap-1.5">
									<Sparkles class="h-3.5 w-3.5" />
									Démarrage Rapide · Présets d'Architecture
								</span>
								<span class="text-[11px] text-muted-foreground">Pré-remplit les 5 étapes en 1 clic</span>
							</div>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
								{#each WORKSPACE_PRESETS as p}
									<button
										type="button"
										onclick={() => applyPreset(p.id)}
										class="text-left p-2.5 rounded-lg border bg-card hover:bg-muted/60 transition-all border-border hover:border-primary/40"
									>
										<div class="font-bold text-foreground text-xs">{p.name}</div>
										<div class="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{p.description}</div>
									</button>
								{/each}
							</div>
						</div>

						<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<div class="space-y-1.5 sm:col-span-2">
								<label for="p-title" class="font-bold text-foreground">Titre du Projet / Contexte de Réflexion *</label>
								<input
									id="p-title"
									type="text"
									bind:value={title}
									placeholder="ex: Réseau Mobile Ferroviaire FRMCS · Lot Sol-Bord"
									class="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-1 focus:ring-primary font-medium"
								/>
							</div>

							<div class="space-y-1.5">
								<label for="p-type" class="font-bold text-foreground">Type d'Engagement</label>
								<select
									id="p-type"
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
								<label for="p-id" class="font-bold text-foreground">Identifiant Court / Slug</label>
								<input
									id="p-id"
									type="text"
									bind:value={customId}
									placeholder="ex: frmcs-rail-2027 (optionnel)"
									class="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono focus:ring-1 focus:ring-primary"
								/>
							</div>

							<div class="space-y-1.5 sm:col-span-2">
								<label for="p-desc" class="font-bold text-foreground">Description & Périmètre de l'Espace *</label>
								<textarea
									id="p-desc"
									bind:value={description}
									rows="3"
									placeholder="Présentez le contexte, les enjeux métiers et les frontières du système à concevoir..."
									class="w-full rounded-lg border bg-background p-3 text-xs focus:ring-1 focus:ring-primary"
								></textarea>
							</div>

							<div class="space-y-1.5">
								<label for="p-budget" class="font-bold text-foreground">Enveloppe Budgétaire Indicative</label>
								<input
									id="p-budget"
									type="text"
									bind:value={budget}
									placeholder="ex: 1.8 M€ CAPEX"
									class="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-1 focus:ring-primary"
								/>
							</div>

							<div class="space-y-1.5">
								<label for="p-date" class="font-bold text-foreground">Jalon de Livraison Cible</label>
								<input
									id="p-date"
									type="date"
									bind:value={targetDate}
									class="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-1 focus:ring-primary font-mono"
								/>
							</div>
						</div>
					</div>

				<!-- ═════════════════════════════════════════════════════════════ -->
				<!-- ÉTAPE 2 : STRATÉGIE GLOBALE & PRINCIPES DIRECTEURS            -->
				<!-- ═════════════════════════════════════════════════════════════ -->
				{:else if currentStep === 2}
					<div class="space-y-4 animate-in fade-in duration-100">
						<!-- Objectifs Stratégiques -->
						<div class="space-y-2">
							<div class="flex items-center justify-between">
								<label for="new-objective-input" class="font-bold text-foreground">Objectifs Stratégiques Macro</label>
								<span class="text-[11px] text-muted-foreground">{objectives.length} objectifs définis</span>
							</div>
							<div class="flex gap-2">
								<input
									id="new-objective-input"
									type="text"
									bind:value={newObjective}
									placeholder="Ajouter un objectif stratégique..."
									onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addObjective())}
									class="flex-1 rounded-lg border bg-background px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary"
								/>
								<button
									type="button"
									onclick={addObjective}
									class="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
								>
									Ajouter
								</button>
							</div>
							<div class="space-y-1.5 mt-2">
								{#each objectives as obj, i}
									<div class="flex items-center justify-between p-2 rounded-lg border bg-muted/20 text-xs">
										<span class="flex-1 font-medium">{obj}</span>
										<button
											type="button"
											onclick={() => removeObjective(i)}
											class="p-1 text-muted-foreground hover:text-destructive transition-colors ml-2"
										>
											<Trash2 class="h-3.5 w-3.5" />
										</button>
									</div>
								{/each}
							</div>
						</div>

						<!-- Principes Directeurs d'Architecture -->
						<div class="space-y-2 pt-2 border-t">
							<div class="flex items-center justify-between">
								<label for="new-principle-input" class="font-bold text-foreground">Principes Directeurs d'Architecture (Règles Inviolables)</label>
								<span class="text-[11px] text-muted-foreground">{principles.length} principes</span>
							</div>
							<div class="flex gap-2">
								<input
									id="new-principle-input"
									type="text"
									bind:value={newPrinciple}
									placeholder="ex: Zero-Trust par défaut, vérification formelle..."
									onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addPrinciple())}
									class="flex-1 rounded-lg border bg-background px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary"
								/>
								<button
									type="button"
									onclick={addPrinciple}
									class="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
								>
									Ajouter
								</button>
							</div>
							<div class="space-y-1.5 mt-2">
								{#each principles as pr, i}
									<div class="flex items-center justify-between p-2 rounded-lg border bg-muted/20 text-xs">
										<span class="flex-1 font-medium text-primary-800 dark:text-primary-300">⚖️ {pr}</span>
										<button
											type="button"
											onclick={() => removePrinciple(i)}
											class="p-1 text-muted-foreground hover:text-destructive transition-colors ml-2"
										>
											<Trash2 class="h-3.5 w-3.5" />
										</button>
									</div>
								{/each}
							</div>
						</div>

						<!-- Contraintes & Lignes Rouges -->
						<div class="space-y-2 pt-2 border-t">
							<div class="flex items-center justify-between">
								<label for="new-constraint-input" class="font-bold text-foreground">Contraintes & Lignes Rouges Non Négociables</label>
								<span class="text-[11px] text-muted-foreground">{constraints.length} contraintes</span>
							</div>
							<div class="flex gap-2">
								<input
									id="new-constraint-input"
									type="text"
									bind:value={newConstraint}
									placeholder="ex: Pas de cloud public hors UE..."
									onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addConstraint())}
									class="flex-1 rounded-lg border bg-background px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary"
								/>
								<button
									type="button"
									onclick={addConstraint}
									class="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
								>
									Ajouter
								</button>
							</div>
							<div class="space-y-1.5 mt-2">
								{#each constraints as c, i}
									<div class="flex items-center justify-between p-2 rounded-lg border bg-muted/20 text-xs">
										<span class="flex-1 font-medium text-amber-700 dark:text-amber-400">⛔ {c}</span>
										<button
											type="button"
											onclick={() => removeConstraint(i)}
											class="p-1 text-muted-foreground hover:text-destructive transition-colors ml-2"
										>
											<Trash2 class="h-3.5 w-3.5" />
										</button>
									</div>
								{/each}
							</div>
						</div>
					</div>

				<!-- ═════════════════════════════════════════════════════════════ -->
				<!-- ÉTAPE 3 : DOCUMENTS AMONTS & BASE DE CONNAISSANCE COMMUNE     -->
				<!-- ═════════════════════════════════════════════════════════════ -->
				{:else if currentStep === 3}
					<div class="space-y-4 animate-in fade-in duration-100">
						<!-- Invariant Épistémique Rappelé -->
						<div class="rounded-xl border bg-emerald-500/10 border-emerald-500/30 p-3.5 flex items-start gap-3">
							<ShieldCheck class="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
							<div class="space-y-1">
								<h4 class="font-bold text-emerald-800 dark:text-emerald-300 text-xs">
									Principe d'Invariant : Base de Connaissance Commune & Pérenne
								</h4>
								<p class="text-[11px] text-muted-foreground leading-relaxed">
									Seule la base de connaissance s'enrichit au gré des engagements et reste <strong>commune et valide de facto</strong> pour tous les projets. Tout document amont versé ici rejoint le patrimoine commun de l'entreprise.
								</p>
							</div>
						</div>

						<!-- Documents Amonts Fournis pour ce Projet -->
						<div class="space-y-2">
							<div class="flex items-center justify-between gap-2">
								<h4 class="font-bold text-foreground">Documents Amonts Spécifiques au Projet</h4>
								<div class="flex items-center gap-2">
									<button
										type="button"
										onclick={() => (isRfpImporterOpen = true)}
										class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20 font-bold transition-colors cursor-pointer"
									>
										<BrainCircuit class="h-3.5 w-3.5" />
										<span>Importer & Confronter un RFP</span>
									</button>
									<button
										type="button"
										onclick={addEmptyUpstreamDoc}
										class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-primary/10 text-primary border-primary/25 hover:bg-primary/20 font-semibold cursor-pointer"
									>
										<Plus class="h-3.5 w-3.5" />
										<span>Ajouter manuellement</span>
									</button>
								</div>
							</div>

							<div class="space-y-3">
								{#each upstreamDocs as doc, idx}
									<div class="p-3 rounded-xl border bg-card space-y-2 shadow-2xs">
										<div class="flex items-center justify-between gap-2">
											<input
												type="text"
												bind:value={doc.title}
												placeholder="Titre du document amont..."
												class="flex-1 font-bold text-xs bg-transparent border-b border-border/60 pb-1 focus:border-primary outline-hidden"
											/>
											<button
												type="button"
												onclick={() => removeUpstreamDoc(idx)}
												class="p-1 text-muted-foreground hover:text-destructive"
												title="Supprimer ce document"
											>
												<Trash2 class="h-3.5 w-3.5" />
											</button>
										</div>

										<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
											<div>
												<label for="doc-cat-{idx}" class="text-[10px] text-muted-foreground font-semibold">Catégorie</label>
												<select
													id="doc-cat-{idx}"
													bind:value={doc.category}
													class="w-full rounded border bg-background px-2 py-1 text-[11px]"
												>
													<option value="cctp">CCTP Contractuel</option>
													<option value="rfp_annex">Annexe Technique RFP</option>
													<option value="business_spec">Spécification Métier</option>
													<option value="regulation">Réglementation</option>
													<option value="guideline">Guide d'Architecture</option>
												</select>
											</div>
											<div>
												<label for="doc-src-{idx}" class="text-[10px] text-muted-foreground font-semibold">Source / Donneur d'Ordre</label>
												<input
													id="doc-src-{idx}"
													type="text"
													bind:value={doc.sourceOrAuthor}
													placeholder="ex: MOA Télécom"
													class="w-full rounded border bg-background px-2 py-1 text-[11px]"
												/>
											</div>
											<div>
												<label for="doc-ver-{idx}" class="text-[10px] text-muted-foreground font-semibold">Version</label>
												<input
													id="doc-ver-{idx}"
													type="text"
													bind:value={doc.version}
													placeholder="v1.0"
													class="w-full rounded border bg-background px-2 py-1 text-[11px] font-mono"
												/>
											</div>
										</div>

										<div>
											<label for="doc-sum-{idx}" class="text-[10px] text-muted-foreground font-semibold">Résumé Exécutif</label>
											<textarea
												id="doc-sum-{idx}"
												bind:value={doc.summary}
												rows="2"
												placeholder="Synthèse des enjeux et contraintes imposés par cette pièce amont..."
												class="w-full rounded border bg-background p-2 text-[11px]"
											></textarea>
										</div>
									</div>
								{/each}
							</div>
						</div>

						<!-- Sélection des Standards Transverses Déjà dans la Base Commune -->
						<div class="space-y-2 pt-2 border-t">
							<h4 class="font-bold text-foreground">
								Standards & Doctrines Transverses Applicables (Patrimoine Existant)
							</h4>
							<p class="text-[11px] text-muted-foreground">
								Cochez les normes et doctrines de référence déjà capitalisées dans Archinex à lier à ce projet :
							</p>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
								{#each deliberationStore.commonKnowledgeBase.filter((d) => d.origin === 'contributor_external' || d.category === 'standard' || d.category === 'regulation') as std}
									{@const isChecked = selectedStandards.includes(std.id)}
									<button
										type="button"
										onclick={() => toggleStandard(std.id)}
										class="flex items-start gap-2.5 p-2 rounded-lg border text-left transition-colors {isChecked
											? 'bg-primary/10 border-primary text-foreground'
											: 'bg-muted/30 border-border text-muted-foreground hover:text-foreground'}"
									>
										<input
											type="checkbox"
											checked={isChecked}
											class="mt-1 rounded text-primary"
											tabindex="-1"
										/>
										<div class="min-w-0 flex-1">
											<div class="font-bold text-[11px] truncate">{std.title}</div>
											<div class="text-[10px] text-muted-foreground line-clamp-1">{std.sourceOrAuthor} · {std.categoryLabel}</div>
										</div>
									</button>
								{/each}
							</div>
						</div>
					</div>

				<!-- ═════════════════════════════════════════════════════════════ -->
				<!-- ÉTAPE 4 : PARTICIPANTS & RÔLES IDENTIFIÉS                     -->
				<!-- ═════════════════════════════════════════════════════════════ -->
				{:else if currentStep === 4}
					<div class="space-y-4 animate-in fade-in duration-100">
						<div class="flex items-center justify-between gap-3">
							<div>
								<h4 class="font-bold text-foreground">Équipe d'Architecture & Parties Prenantes</h4>
								<p class="text-[11px] text-muted-foreground">
									Désignez les experts habilités à instruire les controverses et arbitrer les sections
								</p>
							</div>
							<button
								type="button"
								onclick={() => (isInviteOpen = true)}
								class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20 text-xs font-bold transition-colors cursor-pointer"
							>
								<UserPlus class="h-3.5 w-3.5" />
								<span>Inviter par Email</span>
							</button>
						</div>

						<div class="space-y-2.5">
							{#each participants as p, idx}
								<div class="p-3 rounded-xl border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
									<div class="space-y-1">
										<div class="flex items-center gap-2">
											<input
												type="text"
												bind:value={p.name}
												class="font-bold text-xs bg-transparent border-b border-border focus:border-primary outline-hidden"
											/>
											{#if p.isLead}
												<span class="rounded bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.2 text-[10px] font-bold">
													Lead
												</span>
											{/if}
										</div>
										<input
											type="email"
											bind:value={p.email}
											placeholder="email@archinex.local"
											class="text-[11px] text-muted-foreground bg-transparent border-b border-transparent focus:border-border outline-hidden w-48"
										/>
									</div>

									<div class="flex items-center gap-2">
										<select
											bind:value={p.role}
											class="rounded-lg border bg-background px-2.5 py-1 text-xs font-medium"
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

				<!-- ═════════════════════════════════════════════════════════════ -->
				<!-- ÉTAPE 5 : SUJETS DE RÉFLEXION & LANCEMENT                      -->
				<!-- ═════════════════════════════════════════════════════════════ -->
				{:else if currentStep === 5}
					<div class="space-y-4 animate-in fade-in duration-100">
						<div class="rounded-xl border bg-muted/30 p-3.5 space-y-1">
							<h4 class="font-bold text-foreground text-xs flex items-center gap-1.5">
								<CheckCircle2 class="h-4 w-4 text-emerald-600" />
								Prêt pour le Lancement de la Délibération
							</h4>
							<p class="text-[11px] text-muted-foreground leading-relaxed">
								Archinex a structuré automatiquement les premiers sujets de réflexion et généré les brouillons télégraphiques initiaux prêts à être débattus.
							</p>
						</div>

						<div class="space-y-2">
							<h4 class="font-bold text-foreground text-xs">Premières Sections & Sujets de Réflexion :</h4>
							<div class="space-y-2">
								{#each initialSubjects as subj}
									<div class="p-3 rounded-lg border bg-card space-y-1.5">
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
											<div class="text-[11px] text-muted-foreground bg-muted/40 p-2 rounded">
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

			<!-- ─── Footer Controls ────────────────────────────────────────────── -->
			<div class="p-4 border-t bg-muted/30 flex items-center justify-between shrink-0">
				<div>
					{#if currentStep > 1}
						<button
							type="button"
							onclick={() => (currentStep = (currentStep - 1) as Step)}
							class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-background hover:bg-muted font-semibold text-xs transition-colors"
						>
							<ArrowLeft class="h-3.5 w-3.5" />
							<span>Précédent</span>
						</button>
					{/if}
				</div>

				<div class="flex items-center gap-2">
					<button
						type="button"
						onclick={onclose}
						class="px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
					>
						Annuler
					</button>

					{#if currentStep < 5}
						<button
							type="button"
							onclick={() => (currentStep = (currentStep + 1) as Step)}
							class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow-xs hover:bg-primary/90 transition-colors"
						>
							<span>Suivant</span>
							<ArrowRight class="h-3.5 w-3.5" />
						</button>
					{:else}
						<button
							type="button"
							onclick={handleCreateWorkspace}
							class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
						>
							<CheckCircle2 class="h-4 w-4" />
							<span>Initialiser & Démarrer la Délibération</span>
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

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

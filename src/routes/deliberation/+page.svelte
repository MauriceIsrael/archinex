<script lang="ts">
	import ContextualPostureSelector from '$lib/components/deliberation/ContextualPostureSelector.svelte';
	import MaturityBoardTable from '$lib/components/deliberation/MaturityBoardTable.svelte';
	import TelegraphicDraftView from '$lib/components/deliberation/TelegraphicDraftView.svelte';
	import DialecticChatPanel from '$lib/components/deliberation/DialecticChatPanel.svelte';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { GitBranch, Shield, Sparkles, BookOpen, Layers, Terminal } from 'lucide-svelte';
</script>

<svelte:head>
	<title>Archinex · Deliberation Workbench</title>
</svelte:head>

<div class="space-y-6">
	<!-- Bannière Haut de Page -->
	<div class="rounded-xl bg-gradient-to-r from-primary/10 via-background to-muted/40 p-5 border shadow-xs">
		<div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
			<div>
				<div class="flex items-center gap-2 mb-1.5">
					<span class="inline-flex items-center gap-1 rounded bg-primary text-primary-foreground px-2 py-0.5 text-[11px] font-bold font-mono">
						<GitBranch class="h-3 w-3" />
						ARCHINEX v0.1
					</span>
					<span class="text-xs font-semibold text-muted-foreground">
						Dossier CCTP : Réseau Fédérateur & Tranches 5G Hybrides
					</span>
				</div>
				<h1 class="text-2xl font-black tracking-tight text-foreground">
					Workbench de Délibération Architecturale
				</h1>
				<p class="text-xs text-muted-foreground mt-1 max-w-3xl leading-relaxed">
					Convergence distribuée entre architectes experts et agents IA sous le cadre <strong class="text-foreground">SmartMemory × LLMOps</strong>.
					Énoncés épistémiques à 5 facettes, tri strict par déblocages, brouillons-appâts percutants chiffrés et portes de validation humaines.
				</p>
			</div>

			<!-- Badges de garanties d'invariants -->
			<div class="flex flex-wrap items-center gap-2 text-xs">
				<div class="flex items-center gap-1.5 bg-background border px-3 py-1.5 rounded-lg shadow-xs">
					<Shield class="h-3.5 w-3.5 text-emerald-600" />
					<span class="font-medium">Invariants Scellés</span>
				</div>
				<div class="flex items-center gap-1.5 bg-background border px-3 py-1.5 rounded-lg shadow-xs">
					<Sparkles class="h-3.5 w-3.5 text-amber-500" />
					<span class="font-medium">Filtre Anti-Blabla</span>
				</div>
				<div class="flex items-center gap-1.5 bg-background border px-3 py-1.5 rounded-lg shadow-xs">
					<Terminal class="h-3.5 w-3.5 text-indigo-500" />
					<span class="font-medium">Sans Doc Drift</span>
				</div>
			</div>
		</div>
	</div>

	<!-- 1. Sélecteur de Posture Contextuelle (Non-Linéaire) -->
	<ContextualPostureSelector />

	<!-- 2. Zone Supérieure : Board d'Effort (Gauche) & Brouillon Télégraphique (Droite) -->
	<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
		<!-- Panneau Gauche : Board de Maturité (6 colonnes triées par déblocages) -->
		<div class="lg:col-span-7 h-full">
			<MaturityBoardTable />
		</div>

		<!-- Panneau Droit : Brouillon-Appât Télégraphique (Retenu, Supposé, Chiffrage, Conflits, Variantes, Diff Sensor) -->
		<div class="lg:col-span-5 h-full">
			<TelegraphicDraftView />
		</div>
	</div>

	<!-- 3. Zone Inférieure : Délibération Multi-Canaux & Rappel Proactif de Doctrine (Lot 4) -->
	<div class="grid grid-cols-1 gap-6">
		<DialecticChatPanel />
	</div>
</div>

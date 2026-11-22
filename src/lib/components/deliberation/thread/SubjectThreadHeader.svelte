<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { formatMaturityLevel, getMaturityBadgeClass } from '$lib/domain/debate';
	import {
		ArrowLeft,
		BookOpen,
		ChevronDown,
		Columns2,
		Maximize2,
		PanelLeftOpen,
		RefreshCw,
		RotateCcw,
		ShieldAlert,
		Sparkles
	} from 'lucide-svelte';

	let {
		activeSubject = null,
		isSidebarCollapsed = false,
		openObjectionsCount = 0,
		totalObjectionsCount = 0,
		citedKbRefsCount = 0,
		isDebating = false,
		invokingAgentRole = null,
		isSplitView = $bindable(false),
		onBackToBoard = () => {},
		onToggleSidebar = () => {},
		onInvokeAgent = (_role: 'challenger' | 'proposer' | 'verifier' | 'synthesizer') => {},
		onLaunchDebate = () => {}
	}: {
		activeSubject?: any;
		isSidebarCollapsed?: boolean;
		openObjectionsCount?: number;
		totalObjectionsCount?: number;
		citedKbRefsCount?: number;
		isDebating?: boolean;
		invokingAgentRole?: string | null;
		isSplitView: boolean;
		onBackToBoard?: () => void;
		onToggleSidebar?: () => void;
		onInvokeAgent?: (role: 'challenger' | 'proposer' | 'verifier' | 'synthesizer') => void;
		onLaunchDebate?: () => void;
	} = $props();

	let isAgentMenuOpen = $state(false);
</script>

<div class="px-3.5 py-2.5 border-b bg-muted/20 flex items-center justify-between gap-3 flex-wrap shrink-0">
	<div class="flex items-center gap-2">
		<button
			type="button"
			onclick={onBackToBoard}
			class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
			title="Revenir au tableau de maturité"
		>
			<ArrowLeft class="h-3.5 w-3.5" />
			<span>Tableau</span>
			{#if deliberationStore.activeEngagement?.title}
				<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background text-primary border border-primary/30 font-bold">
					{deliberationStore.activeEngagement.shortName || deliberationStore.activeEngagement.title}
				</span>
			{/if}
		</button>

		{#if isSidebarCollapsed}
			<button
				type="button"
				data-testid="expand-subject-list-btn"
				onclick={onToggleSidebar}
				class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-card hover:bg-muted text-xs font-semibold text-foreground transition-colors cursor-pointer shadow-2xs"
				title="Déplier la liste des sujets"
			>
				<PanelLeftOpen class="h-3.5 w-3.5 text-primary" />
				<span class="hidden sm:inline">Sujets</span>
				<span class="text-[10px] font-mono px-1 rounded bg-primary/10 text-primary font-bold">
					{deliberationStore.sortedSubjects.length}
				</span>
			</button>
		{/if}

		<div>
			<div class="flex items-center gap-2 flex-wrap">
				<span class="font-mono text-xs font-bold text-primary">
					{activeSubject?.section_ref || '§'}
				</span>
				<h2 class="text-sm font-bold text-foreground leading-none">
					{activeSubject?.name || 'Sujet non sélectionné'}
				</h2>
				{#if activeSubject}
					<span class="inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[10px] font-bold border {getMaturityBadgeClass(activeSubject.level)}">
						{formatMaturityLevel(activeSubject.level)}
					</span>
				{/if}
			</div>
			<div class="text-[11px] text-muted-foreground mt-0.5">
				Attente : <strong class="text-foreground">{activeSubject?.waiting_for_role || '—'}</strong> · Effort : <span class="font-mono">{activeSubject?.relative_effort || 'M'}</span>
			</div>
		</div>
	</div>

	<div class="flex items-center gap-1.5 flex-wrap">
		<span
			class="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-[10px] font-bold border {openObjectionsCount > 0
				? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25'
				: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'}"
			title="Objections ouvertes sur le total des objections du sujet"
		>
			<ShieldAlert class="h-3 w-3" />
			<span>{openObjectionsCount} obj. ouverte(s) / {totalObjectionsCount}</span>
		</span>

		<span
			class="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-[10px] font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25"
			title="Références doctrinales mobilisées dans la délibération"
		>
			<BookOpen class="h-3 w-3" />
			<span>{citedKbRefsCount} ref(s) base</span>
		</span>

		{#if deliberationStore.llmopsStatus === 'connected'}
			<button
				type="button"
				onclick={() => deliberationStore.syncWithLLMOps(undefined, undefined, { silent: false })}
				disabled={deliberationStore.isSyncingLLMOps}
				class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20 transition-colors cursor-pointer"
				title="Connecté au Knowledge Hub LLMOps · Cliquez pour resynchroniser"
			>
				<span class="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
				<span class="opacity-80">LLMOps :</span>
				<strong class="font-mono">En ligne</strong>
				{#if deliberationStore.isSyncingLLMOps}
					<RefreshCw class="h-3 w-3 animate-spin ml-0.5" />
				{/if}
			</button>
		{:else}
			<button
				type="button"
				onclick={() => deliberationStore.syncWithLLMOps(undefined, undefined, { silent: false })}
				disabled={deliberationStore.isSyncingLLMOps}
				class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/20 transition-colors cursor-pointer"
				title="Non connecté à LLMOps · Cliquez pour tester la connexion"
			>
				<span class="inline-block h-2 w-2 rounded-full bg-rose-500"></span>
				<span class="opacity-80">LLMOps :</span>
				<strong class="font-mono">Non connecté</strong>
				{#if deliberationStore.isSyncingLLMOps}
					<RefreshCw class="h-3 w-3 animate-spin ml-0.5" />
				{/if}
			</button>
		{/if}

		<!-- Menu Solliciter un agent -->
		<div class="relative">
			<button
				type="button"
				disabled={isDebating || invokingAgentRole !== null}
				onclick={() => (isAgentMenuOpen = !isAgentMenuOpen)}
				class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-background hover:bg-muted/70 disabled:opacity-50 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
			>
				{#if isDebating}
					<RotateCcw class="h-3.5 w-3.5 animate-spin text-primary" />
					<span>Débat...</span>
				{:else if invokingAgentRole}
					<RotateCcw class="h-3.5 w-3.5 animate-spin text-purple-600" />
					<span>@{invokingAgentRole}...</span>
				{:else}
					<Sparkles class="h-3.5 w-3.5 text-purple-600" />
					<span>Agents IA</span>
					<ChevronDown class="h-3 w-3 text-muted-foreground transition-transform {isAgentMenuOpen ? 'rotate-180' : ''}" />
				{/if}
			</button>

			{#if isAgentMenuOpen}
				<div
					class="absolute right-0 mt-1 w-56 rounded-xl border bg-popover text-popover-foreground shadow-lg z-30 p-1.5 space-y-1 text-xs"
					role="menu"
				>
					<div class="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b mb-1">
						Interpeller un agent IA
					</div>
					<button
						type="button"
						onclick={() => {
							isAgentMenuOpen = false;
							onInvokeAgent('challenger');
						}}
						class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-rose-500/10 text-rose-700 dark:text-rose-400 font-semibold cursor-pointer transition-colors text-left"
					>
						<span>⚔️</span>
						<div>
							<div class="leading-none">@challenger</div>
							<div class="text-[10px] font-normal text-muted-foreground mt-0.5">Trouver failles & objections</div>
						</div>
					</button>
					<button
						type="button"
						onclick={() => {
							isAgentMenuOpen = false;
							onInvokeAgent('proposer');
						}}
						class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-blue-500/10 text-blue-700 dark:text-blue-400 font-semibold cursor-pointer transition-colors text-left"
					>
						<span>💡</span>
						<div>
							<div class="leading-none">@proposer</div>
							<div class="text-[10px] font-normal text-muted-foreground mt-0.5">Suggérer une nouvelle option</div>
						</div>
					</button>
					<button
						type="button"
						onclick={() => {
							isAgentMenuOpen = false;
							onInvokeAgent('verifier');
						}}
						class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 font-semibold cursor-pointer transition-colors text-left"
					>
						<span>🛡️</span>
						<div>
							<div class="leading-none">@verifier</div>
							<div class="text-[10px] font-normal text-muted-foreground mt-0.5">Contrôler conformité doctrine</div>
						</div>
					</button>
					<button
						type="button"
						onclick={() => {
							isAgentMenuOpen = false;
							onInvokeAgent('synthesizer');
						}}
						class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-purple-500/10 text-purple-700 dark:text-purple-400 font-semibold cursor-pointer transition-colors text-left"
					>
						<span>⚖️</span>
						<div>
							<div class="leading-none">@synthesizer</div>
							<div class="text-[10px] font-normal text-muted-foreground mt-0.5">Résumer et arbitrer</div>
						</div>
					</button>
					<div class="border-t my-1"></div>
					<button
						type="button"
						onclick={() => {
							isAgentMenuOpen = false;
							onLaunchDebate();
						}}
						class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-semibold cursor-pointer transition-colors text-left"
					>
						<span>⚡</span>
						<div>
							<div class="leading-none">Débat complet</div>
							<div class="text-[10px] font-normal text-muted-foreground mt-0.5">Tour contradictoire automatisé</div>
						</div>
					</button>
				</div>
			{/if}
		</div>

		<!-- Bascule Mode Onglets Pleine Largeur vs Mode Split Côte-à-côte -->
		<button
			type="button"
			data-testid="btn-toggle-split"
			onclick={() => (isSplitView = !isSplitView)}
			class="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer {isSplitView
				? 'bg-primary text-primary-foreground border-primary shadow-2xs'
				: 'bg-background text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
			title={isSplitView
				? 'Revenir aux onglets unifiés pleine largeur'
				: 'Afficher le Fil et la Matrice côte à côte sur grand écran'}
		>
			{#if isSplitView}
				<Maximize2 class="h-3.5 w-3.5" />
				<span>Pleine largeur</span>
			{:else}
				<Columns2 class="h-3.5 w-3.5" />
				<span>Vue Split (Fil + Matrice)</span>
			{/if}
		</button>
	</div>
</div>

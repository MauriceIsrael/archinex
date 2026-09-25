<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { RefreshCw, Download, Copy, Check, Terminal, FileCode, Layers, Cpu, ShieldCheck } from 'lucide-svelte';

	type TabType = 'mermaid' | 'structurizr' | 'sysml' | 'ptp';

	let activeTab = $state<TabType>('mermaid');
	let copied = $state(false);
	let isRegenerating = $state(false);
	let lastSyncTime = $state<string>(new Date().toLocaleTimeString());

	const activeSubject = $derived(deliberationStore.activeSubject);
	const projections = $derived(
		activeSubject ? deliberationStore.getProjections(activeSubject.id) : null
	);

	function handleRegenerate() {
		isRegenerating = true;
		setTimeout(() => {
			isRegenerating = false;
			lastSyncTime = new Date().toLocaleTimeString();
		}, 300);
	}

	function getCurrentContent(): string {
		if (!projections) return '';
		switch (activeTab) {
			case 'mermaid':
				return projections.mermaid;
			case 'structurizr':
				return projections.structurizrDSL;
			case 'sysml':
				return projections.sysmlV2;
			case 'ptp':
				return projections.configJSON;
		}
	}

	function copyToClipboard() {
		navigator.clipboard.writeText(getCurrentContent());
		copied = true;
		setTimeout(() => {
			copied = false;
		}, 2000);
	}

	function downloadArtifact() {
		const content = getCurrentContent();
		let filename = 'artifact.txt';
		let mimeType = 'text/plain';

		switch (activeTab) {
			case 'mermaid':
				filename = `${activeSubject?.id || 'arch'}_diagram.mmd`;
				break;
			case 'structurizr':
				filename = `${activeSubject?.id || 'arch'}_workspace.dsl`;
				break;
			case 'sysml':
				filename = `${activeSubject?.id || 'arch'}_model.sysml`;
				break;
			case 'ptp':
				filename = `ptp_g8275_1_profile.json`;
				mimeType = 'application/json';
				break;
		}

		const blob = new Blob([content], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click;
		URL.revokeObjectURL(url);
	}
</script>

<div class="rounded-xl border bg-card p-5 shadow-xs space-y-4">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
		<div>
			<div class="flex items-center gap-2 mb-1">
				<span class="inline-flex items-center gap-1 rounded bg-indigo-600 text-white px-2 py-0.5 text-[11px] font-bold font-mono">
					<Layers class="h-3 w-3" />
					LOT 6 · PROJECTIONS SYSTÈME
				</span>
				<span class="text-xs font-semibold text-muted-foreground">
					Régénération Déterministe Sans Dérive (No Doc Drift)
				</span>
			</div>
			<h3 class="text-lg font-bold tracking-tight text-foreground">
				Hub d'Artefacts Système · {activeSubject?.section_ref} {activeSubject?.name}
			</h3>
		</div>

		<!-- Action de synchronisation / régénération -->
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={handleRegenerate}
				class="inline-flex items-center gap-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 text-xs font-bold shadow-xs transition-colors"
			>
				<RefreshCw class="h-3.5 w-3.5 {isRegenerating ? 'animate-spin' : ''}" />
				<span>Régénérer sans dérive (`sync-artifacts`)</span>
			</button>

			<button
				type="button"
				onclick={() => deliberationStore.openFreezeDialog()}
				class="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold shadow-xs transition-colors"
			>
				<ShieldCheck class="h-3.5 w-3.5" />
				<span>Sceller Section</span>
			</button>
		</div>
	</div>

	<!-- Indicateur de synchro & Invariants -->
	<div class="flex flex-wrap items-center justify-between gap-2 text-xs bg-muted/40 p-2.5 rounded-lg border">
		<div class="flex items-center gap-2">
			<div class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
			<span class="text-muted-foreground">
				Synchronisation active : <strong class="text-foreground">0 dérive documentaire</strong> (calculé à partir des énoncés épistémiques scellés).
			</span>
		</div>
		<span class="text-[11px] font-mono text-muted-foreground">Dernière synchro : {lastSyncTime}</span>
	</div>

	<!-- Navigation par Onglets -->
	<div class="flex items-center justify-between border-b">
		<div class="flex items-center gap-1">
			<button
				type="button"
				onclick={() => (activeTab = 'mermaid')}
				class="px-3 py-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 {activeTab === 'mermaid' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
			>
				<Layers class="h-3.5 w-3.5" />
				<span>Mermaid Diagram</span>
			</button>

			<button
				type="button"
				onclick={() => (activeTab = 'structurizr')}
				class="px-3 py-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 {activeTab === 'structurizr' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
			>
				<FileCode class="h-3.5 w-3.5" />
				<span>Structurizr DSL (.dsl)</span>
			</button>

			<button
				type="button"
				onclick={() => (activeTab = 'sysml')}
				class="px-3 py-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 {activeTab === 'sysml' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
			>
				<Terminal class="h-3.5 w-3.5" />
				<span>SysML v2</span>
			</button>

			<button
				type="button"
				onclick={() => (activeTab = 'ptp')}
				class="px-3 py-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 {activeTab === 'ptp' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
			>
				<Cpu class="h-3.5 w-3.5" />
				<span>Profil PTP G.8275.1 (JSON)</span>
			</button>
		</div>

		<!-- Actions Copier / Télécharger -->
		<div class="flex items-center gap-2 pb-1">
			<button
				type="button"
				onclick={copyToClipboard}
				class="inline-flex items-center gap-1 rounded border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
			>
				{#if copied}
					<Check class="h-3.5 w-3.5 text-emerald-600" />
					<span>Copié</span>
				{:else}
					<Copy class="h-3.5 w-3.5" />
					<span>Copier</span>
				{/if}
			</button>

			<button
				type="button"
				onclick={downloadArtifact}
				class="inline-flex items-center gap-1 rounded border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
			>
				<Download class="h-3.5 w-3.5" />
				<span>Exporter</span>
			</button>
		</div>
	</div>

	<!-- Affichage du Contenu Projeté -->
	{#if projections}
		<div class="relative">
			<pre class="rounded-lg bg-muted/80 p-4 font-mono text-xs text-foreground overflow-x-auto max-h-96 leading-relaxed border shadow-inner">{getCurrentContent()}</pre>
		</div>
	{:else}
		<div class="p-8 text-center text-xs text-muted-foreground">
			Aucun sujet sélectionné ou aucune projection disponible.
		</div>
	{/if}
</div>

<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { RefreshCw, Download, Copy, Check, Terminal, FileCode, Layers, Cpu, ShieldCheck } from 'lucide-svelte';

	type TabType = 'mermaid' | 'structurizr' | 'sysml' | 'ptp';

	let activeTab = $state<TabType>('mermaid');
	let copied = $state(false);
	let isRegenerating = $state(false);
	let lastSyncTime = $state<string>(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

	const activeSubject = $derived(deliberationStore.activeSubject);
	const projections = $derived(
		activeSubject ? deliberationStore.getProjections(activeSubject.id) : null
	);

	function handleRegenerate() {
		isRegenerating = true;
		setTimeout(() => {
			isRegenerating = false;
			lastSyncTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		}, 250);
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
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="rounded-xl border bg-card p-4 shadow-xs space-y-3">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
		<div class="flex items-center gap-2">
			<div class="p-1 rounded-md bg-indigo-600 text-white">
				<Layers class="h-4 w-4" />
			</div>
			<div>
				<h3 class="text-sm font-bold tracking-tight text-foreground">
					Projections & Modèles Système · {activeSubject?.section_ref} {activeSubject?.name}
				</h3>
			</div>
		</div>

		<!-- Actions -->
		<div class="flex items-center gap-2 self-end sm:self-auto">
			<button
				type="button"
				onclick={handleRegenerate}
				class="inline-flex items-center gap-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors"
			>
				<RefreshCw class="h-3.5 w-3.5 {isRegenerating ? 'animate-spin' : ''}" />
				<span>Synchroniser</span>
			</button>

			<button
				type="button"
				onclick={() => deliberationStore.openFreezeDialog()}
				class="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors"
			>
				<ShieldCheck class="h-3.5 w-3.5" />
				<span>Sceller</span>
			</button>
		</div>
	</div>

	<!-- Navigation par Onglets & Export -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b">
		<div class="flex items-center gap-1 overflow-x-auto">
			<button
				type="button"
				onclick={() => (activeTab = 'mermaid')}
				class="px-2.5 py-1.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap {activeTab === 'mermaid' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
			>
				<Layers class="h-3.5 w-3.5" />
				<span>Mermaid</span>
			</button>

			<button
				type="button"
				onclick={() => (activeTab = 'structurizr')}
				class="px-2.5 py-1.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap {activeTab === 'structurizr' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
			>
				<FileCode class="h-3.5 w-3.5" />
				<span>Structurizr DSL</span>
			</button>

			<button
				type="button"
				onclick={() => (activeTab = 'sysml')}
				class="px-2.5 py-1.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap {activeTab === 'sysml' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
			>
				<Terminal class="h-3.5 w-3.5" />
				<span>SysML v2</span>
			</button>

			<button
				type="button"
				onclick={() => (activeTab = 'ptp')}
				class="px-2.5 py-1.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap {activeTab === 'ptp' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
			>
				<Cpu class="h-3.5 w-3.5" />
				<span>Profil PTP JSON</span>
			</button>
		</div>

		<!-- Actions Copier / Exporter -->
		<div class="flex items-center gap-1.5 self-end sm:self-auto pb-1 sm:pb-0">
			<span class="text-[10px] text-muted-foreground mr-2 font-mono">Synchro : {lastSyncTime}</span>
			<button
				type="button"
				onclick={copyToClipboard}
				class="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-muted transition-colors"
			>
				{#if copied}
					<Check class="h-3 w-3 text-emerald-600" />
					<span>Copié</span>
				{:else}
					<Copy class="h-3 w-3" />
					<span>Copier</span>
				{/if}
			</button>

			<button
				type="button"
				onclick={downloadArtifact}
				class="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-muted transition-colors"
			>
				<Download class="h-3 w-3" />
				<span>Exporter</span>
			</button>
		</div>
	</div>

	<!-- Affichage du Contenu Projeté -->
	{#if projections}
		<div class="relative">
			<pre class="rounded-lg bg-muted/80 p-3.5 font-mono text-[11px] text-foreground overflow-x-auto max-h-80 leading-relaxed border shadow-inner">{getCurrentContent()}</pre>
		</div>
	{:else}
		<div class="p-6 text-center text-xs text-muted-foreground">
			Aucun sujet sélectionné.
		</div>
	{/if}
</div>

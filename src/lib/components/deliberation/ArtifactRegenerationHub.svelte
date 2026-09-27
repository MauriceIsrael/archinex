<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import MermaidViewer from './MermaidViewer.svelte';
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

<div class="rounded-xl border bg-card p-4 shadow-xs space-y-4">
	<!-- En-tête de la Phase 3 -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
		<div class="flex items-center gap-2.5">
			<div class="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
				<Layers class="h-5 w-5" />
			</div>
			<div>
				<div class="flex items-center gap-2">
					<h3 class="text-base font-bold tracking-tight text-foreground">
						Projections & Modèles Système
					</h3>
					<span class="rounded bg-muted px-2 py-0.5 text-xs font-mono font-bold text-muted-foreground">
						{activeSubject?.section_ref} · {activeSubject?.name}
					</span>
				</div>
				<p class="text-xs text-muted-foreground">
					Interprétation visuelle des décisions d'architecture actées (garantie zéro dérive documentaire)
				</p>
			</div>
		</div>

		<!-- Actions -->
		<div class="flex items-center gap-2 self-end sm:self-auto">
			<button
				type="button"
				onclick={handleRegenerate}
				class="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background hover:bg-muted text-foreground px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors"
			>
				<RefreshCw class="h-3.5 w-3.5 {isRegenerating ? 'animate-spin' : ''}" />
				<span>Regénérer</span>
			</button>

			<button
				type="button"
				onclick={() => deliberationStore.openFreezeDialog()}
				class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors"
			>
				<ShieldCheck class="h-3.5 w-3.5" />
				<span>Sceller Section (L5)</span>
			</button>
		</div>
	</div>

	<!-- Navigation par Onglets de Modèles & Export -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-1">
		<div class="flex items-center gap-1 overflow-x-auto text-xs">
			<button
				type="button"
				onclick={() => (activeTab = 'mermaid')}
				class="px-3 py-1.5 font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap {activeTab === 'mermaid'
					? 'bg-primary text-primary-foreground shadow-2xs'
					: 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
			>
				<Layers class="h-3.5 w-3.5" />
				<span>Diagramme Mermaid (Interprété)</span>
			</button>

			<button
				type="button"
				onclick={() => (activeTab = 'structurizr')}
				class="px-3 py-1.5 font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap {activeTab === 'structurizr'
					? 'bg-primary text-primary-foreground shadow-2xs'
					: 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
			>
				<FileCode class="h-3.5 w-3.5" />
				<span>Modèle C4 Structurizr (Interprété)</span>
			</button>

			<button
				type="button"
				onclick={() => (activeTab = 'sysml')}
				class="px-3 py-1.5 font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap {activeTab === 'sysml'
					? 'bg-primary text-primary-foreground shadow-2xs'
					: 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
			>
				<Terminal class="h-3.5 w-3.5" />
				<span>Modélisation SysML v2 (BDD)</span>
			</button>

			<button
				type="button"
				onclick={() => (activeTab = 'ptp')}
				class="px-3 py-1.5 font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap {activeTab === 'ptp'
					? 'bg-primary text-primary-foreground shadow-2xs'
					: 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
			>
				<Cpu class="h-3.5 w-3.5" />
				<span>Profil PTP JSON</span>
			</button>
		</div>

		<!-- Actions Copier / Exporter -->
		<div class="flex items-center gap-1.5 self-end sm:self-auto text-xs">
			<span class="text-[10px] text-muted-foreground mr-2 font-mono">Synchro : {lastSyncTime}</span>
			<button
				type="button"
				onclick={copyToClipboard}
				class="inline-flex items-center gap-1 rounded border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
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
				class="inline-flex items-center gap-1 rounded border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
			>
				<Download class="h-3 w-3" />
				<span>Exporter</span>
			</button>
		</div>
	</div>

	<!-- Affichage Interprété Graphiquement -->
	{#if projections}
		<div class="space-y-4">
			{#if activeTab === 'mermaid'}
				<MermaidViewer
					code={projections.mermaid}
					title="Flux Causal d'Architecture · {activeSubject?.section_ref} {activeSubject?.name}"
					defaultView="visual"
				/>
			{:else if activeTab === 'structurizr'}
				<div class="space-y-3">
					<MermaidViewer
						code={projections.structurizrVisual}
						title="Architecture C4 (Interprétation Graphique du Modèle Structurizr)"
						defaultView="visual"
					/>
					<div class="rounded-lg border bg-muted/20 p-3 space-y-1.5">
						<div class="flex items-center justify-between text-xs font-bold text-muted-foreground">
							<span>Code Source Structurizr DSL (.dsl) :</span>
							<button
								type="button"
								onclick={() => {
									navigator.clipboard.writeText(projections.structurizrDSL);
									copied = true;
									setTimeout(() => (copied = false), 2000);
								}}
								class="text-[11px] text-primary hover:underline"
							>
								Copier DSL
							</button>
						</div>
						<pre class="rounded bg-muted/80 p-3 font-mono text-[11px] text-foreground overflow-x-auto max-h-48 border">{projections.structurizrDSL}</pre>
					</div>
				</div>
			{:else if activeTab === 'sysml'}
				<div class="space-y-3">
					<MermaidViewer
						code={projections.sysmlVisual}
						title="Diagramme de Définition de Blocs SysML v2 (BDD Interprété)"
						defaultView="visual"
					/>
					<div class="rounded-lg border bg-muted/20 p-3 space-y-1.5">
						<div class="flex items-center justify-between text-xs font-bold text-muted-foreground">
							<span>Spécification SysML v2 (.sysml) :</span>
							<button
								type="button"
								onclick={() => {
									navigator.clipboard.writeText(projections.sysmlV2);
									copied = true;
									setTimeout(() => (copied = false), 2000);
								}}
								class="text-[11px] text-primary hover:underline"
							>
								Copier SysML
							</button>
						</div>
						<pre class="rounded bg-muted/80 p-3 font-mono text-[11px] text-foreground overflow-x-auto max-h-48 border">{projections.sysmlV2}</pre>
					</div>
				</div>
			{:else if activeTab === 'ptp'}
				<div class="space-y-2">
					<div class="flex items-center justify-between text-xs font-bold text-muted-foreground">
						<span>Profil PTP Télécom G.8275.1 (Configuration Validée) :</span>
						<span class="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">JSON Formaté</span>
					</div>
					<pre class="rounded-lg bg-muted/80 p-4 font-mono text-xs text-foreground overflow-x-auto max-h-96 leading-relaxed border shadow-inner">{projections.configJSON}</pre>
				</div>
			{/if}
		</div>
	{:else}
		<div class="p-8 text-center text-xs text-muted-foreground border rounded-lg">
			Aucun sujet d'architecture actif sélectionné pour la projection.
		</div>
	{/if}
</div>

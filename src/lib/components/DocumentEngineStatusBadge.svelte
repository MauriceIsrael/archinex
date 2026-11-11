<script lang="ts">
	import { onMount } from 'svelte';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import FileText from 'lucide-svelte/icons/file-text';

	let { projectId }: { projectId?: string } = $props();

	onMount(() => {
		if (deliberationStore.docEngineStatus === 'idle') {
			deliberationStore.checkDocEngine({ silent: true, projectId }).catch((err) => {
				console.warn('[DocEngineStatus] Contrôle initial différé :', err);
			});
		}
	});

	const status = $derived(deliberationStore.docEngineStatus);
	const isChecking = $derived(deliberationStore.isCheckingDocEngine);
	const isConnected = $derived(status === 'connected');
	const url = $derived(deliberationStore.docEngineUrl);

	const titleText = $derived(
		isConnected
			? `Document Engine : Prêt (${url}) · Compilateur HLD Word/PDF actif · Cliquez pour retester`
			: isChecking
				? 'Vérification de la connectivité Document Engine en cours...'
				: `Document Engine : Hors ligne (${url}) · Lancez 'npm run server' dans document-engine pour activer l'export Word (.docx) · Cliquez pour retester`
	);
</script>

<button
	type="button"
	onclick={() => deliberationStore.checkDocEngine({ silent: false, projectId })}
	disabled={isChecking}
	class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer shrink-0 {isConnected
		? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
		: isChecking
			? 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30'
			: 'bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/30 hover:bg-amber-500/20'}"
	title={titleText}
	aria-label={titleText}
	data-testid="doc-engine-status-badge"
>
	<span
		class="inline-block h-2 w-2 rounded-full shrink-0 {isConnected
			? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
			: isChecking
				? 'bg-sky-500 animate-ping'
				: 'bg-amber-500'}"
	></span>
	<span class="font-mono text-[11px] font-semibold tracking-tight">DocEngine</span>
	{#if isChecking}
		<RefreshCw class="h-3 w-3 animate-spin ml-0.5" />
	{:else if isConnected}
		<span class="text-[10px] opacity-75 font-normal hidden sm:inline">3001</span>
	{:else}
		<span class="text-[10px] opacity-75 font-normal hidden sm:inline">Hors ligne</span>
	{/if}
</button>

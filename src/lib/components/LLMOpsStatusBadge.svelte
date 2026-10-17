<script lang="ts">
	import { onMount } from 'svelte';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';

	onMount(() => {
		if (deliberationStore.llmopsStatus === 'idle') {
			deliberationStore.syncWithLLMOps().catch((err) => {
				console.warn('[LLMOpsStatus] Synchro initiale différée :', err);
			});
		}
	});

	const status = $derived(deliberationStore.llmopsStatus);
	const isSyncing = $derived(deliberationStore.isSyncingLLMOps);
	const isConnected = $derived(status === 'connected');

	const titleText = $derived(
		isConnected
			? `LLMOps : Connecté au Knowledge Hub · Cliquez pour resynchroniser`
			: isSyncing
				? 'Synchronisation avec LLMOps en cours...'
				: 'LLMOps : Non connecté (mode 100% local souverain). Cliquez pour tester la connexion.'
	);
</script>

<button
	type="button"
	onclick={() => deliberationStore.syncWithLLMOps()}
	disabled={isSyncing}
	class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer shrink-0 mr-1 {isConnected
		? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
		: isSyncing
			? 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30'
			: 'bg-muted/60 text-muted-foreground border-border hover:bg-muted hover:text-foreground'}"
	title={titleText}
	aria-label={titleText}
>
	<span
		class="inline-block h-2 w-2 rounded-full shrink-0 {isConnected
			? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
			: isSyncing
				? 'bg-sky-500 animate-ping'
				: 'bg-muted-foreground/50'}"
	></span>
	<span class="font-mono text-[11px] font-semibold tracking-tight">LLMOps</span>
	{#if isSyncing}
		<RefreshCw class="h-3 w-3 animate-spin ml-0.5" />
	{:else if isConnected}
		<span class="text-[10px] opacity-75 font-normal hidden sm:inline">Connecté</span>
	{:else}
		<span class="text-[10px] opacity-75 font-normal hidden sm:inline">Local</span>
	{/if}
</button>

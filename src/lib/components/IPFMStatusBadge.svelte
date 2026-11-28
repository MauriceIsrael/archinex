<script lang="ts">
	import { onMount } from 'svelte';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';

	onMount(() => {
		if (deliberationStore.ipfmStatus === 'idle') {
			deliberationStore.checkIpfm({ silent: true }).catch((err) => {
				console.warn('[IPFMStatus] Contrôle initial différé :', err);
			});
		}
	});

	const status = $derived(deliberationStore.ipfmStatus);
	const isChecking = $derived(deliberationStore.isCheckingIpfm);
	const isConnected = $derived(status === 'connected');
	const url = $derived(deliberationStore.ipfmUrl);

	const portLabel = $derived.by(() => {
		try {
			const parsed = new URL(url);
			return parsed.port || '8001';
		} catch {
			return '8001';
		}
	});

	const titleText = $derived(
		isConnected
			? `IP Flow Manager : Prêt (${url}) · Import ARM & Réalité Nautobot actifs · Cliquez pour retester`
			: isChecking
				? 'Vérification de la connectivité IP Flow Manager en cours...'
				: `IP Flow Manager : Hors ligne (${url}) · Lancez uvicorn sur IP-flow-mngt pour activer l'import ARM synchrone · Cliquez pour retester`
	);
</script>

<button
	type="button"
	onclick={() => deliberationStore.checkIpfm({ silent: false })}
	disabled={isChecking}
	class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer shrink-0 {isConnected
		? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
		: isChecking
			? 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30'
			: 'bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/30 hover:bg-amber-500/20'}"
	title={titleText}
	aria-label={titleText}
	data-testid="ipfm-status-badge"
>
	<span
		class="inline-block h-2 w-2 rounded-full shrink-0 {isConnected
			? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
			: isChecking
				? 'bg-sky-500 animate-ping'
				: 'bg-amber-500'}"
	></span>
	<span class="font-mono text-[11px] font-semibold tracking-tight">IPFM</span>
	{#if isChecking}
		<RefreshCw class="h-3 w-3 animate-spin ml-0.5" />
	{:else if isConnected}
		<span class="text-[10px] opacity-75 font-normal hidden sm:inline">{portLabel}</span>
	{:else}
		<span class="text-[10px] opacity-75 font-normal hidden sm:inline">Hors ligne</span>
	{/if}
</button>

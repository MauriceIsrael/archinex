<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { Scale } from 'lucide-svelte';

	interface Detected { code: string; label: string; mentions: number; excerpt: string }
	const projectId = $derived(deliberationStore.activeEngagement?.id);

	let catalogue = $state<Array<{ code: string; label: string }>>([]);
	let detected = $state<Detected[]>([]);
	let selected = $state<string[]>([]);
	let saved = $state<string[]>([]);
	let isSaving = $state(false);

	async function load(pId: string) {
		const res = await fetch(`/api/projects/${encodeURIComponent(pId)}/frameworks/applicable`);
		if (!res.ok) return;
		const data = await res.json();
		catalogue = data.catalogue ?? [];
		detected = data.detected ?? [];
		saved = data.applicable ?? [];
		// Rien de déclaré : les référentiels cités par le RFP sont proposés, cochés, en attente de confirmation.
		selected = saved.length > 0 ? [...saved] : detected.map((d) => d.code);
	}

	$effect(() => {
		if (projectId) void load(projectId);
	});

	const dirty = $derived(JSON.stringify([...selected].sort()) !== JSON.stringify([...saved].sort()));

	function toggle(code: string) {
		selected = selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code];
	}

	async function save() {
		if (!projectId) return;
		isSaving = true;
		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/frameworks/applicable`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ frameworks: selected })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.reason || data.error || `HTTP ${res.status}`);
			saved = data.applicable;
			// La copie de l'espace côté navigateur porte aussi la stratégie : sans cela, sa prochaine sauvegarde l'écraserait.
			const eng = deliberationStore.activeEngagement;
			if (eng?.strategy) eng.strategy.applicableFrameworks = data.applicable;
			deliberationStore.logNotification(
				data.llmops === 'ok'
					? `Référentiels applicables déclarés à LLMOps : ${data.applicable.join(', ') || 'aucun'}.`
					: 'Référentiels enregistrés dans l\'espace ; LLMOps injoignable, ils lui seront transmis à la prochaine déclaration.',
				data.llmops === 'ok' ? 'success' : 'warning'
			);
		} catch (err) {
			deliberationStore.logNotification(`Référentiels non enregistrés : ${err instanceof Error ? err.message : err}`, 'warning');
		} finally {
			isSaving = false;
		}
	}
</script>

{#if projectId && catalogue.length}
	<section class="rounded-2xl border bg-card p-4 shadow-sm space-y-3 text-xs" data-testid="regulatory-frameworks-panel">
		<div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
			<div class="flex items-start gap-2.5">
				<div class="p-2 rounded-lg bg-primary/10 text-primary"><Scale class="h-5 w-5" /></div>
				<div>
					<h2 class="text-sm font-bold text-foreground">Référentiels réglementaires applicables</h2>
					<p class="text-muted-foreground">
						Leurs contrôles accompagnent chaque sujet ; une option jugée non conforme par une règle validée ne peut être retenue qu'en acceptant et justifiant l'écart.
					</p>
				</div>
			</div>
			<button type="button" onclick={save} disabled={!dirty || isSaving} class="shrink-0 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer">
				{isSaving ? 'Enregistrement…' : saved.length === 0 && selected.length ? 'Confirmer' : 'Enregistrer'}
			</button>
		</div>
		{#if saved.length === 0 && detected.length}
			<p class="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2">Aucun référentiel déclaré : ceux que cite le RFP sont proposés ci-dessous. Confirmez-les.</p>
		{/if}
		<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
			{#each catalogue as fw (fw.code)}
				{@const d = detected.find((x) => x.code === fw.code)}
				<label class="flex items-start gap-2 p-2 rounded-lg border cursor-pointer {selected.includes(fw.code) ? 'border-primary/40 bg-primary/5' : ''}" title={d?.excerpt}>
					<input type="checkbox" class="mt-0.5" checked={selected.includes(fw.code)} onchange={() => toggle(fw.code)} />
					<span>
						<span class="font-semibold text-foreground">{fw.label}</span>
						{#if d}<span class="block text-[10px] text-emerald-700 dark:text-emerald-300">Cité {d.mentions} fois par le RFP</span>{/if}
					</span>
				</label>
			{/each}
		</div>
	</section>
{/if}

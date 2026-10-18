<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { page } from '$app/state';
	import { Scale } from 'lucide-svelte';
	import KbClausesHealthBanner from '$lib/components/dashboard/KbClausesHealthBanner.svelte';
	import { rescopeKbClausesHealth, type KbClausesHealthSummary } from '$lib/domain/kbClausesHealth';

	interface Detected { code: string; label: string; mentions: number; excerpt: string }
	const projectId = $derived(deliberationStore.activeEngagement?.id);

	let catalogue = $state<Array<{ code: string; label: string }>>([]);
	let detected = $state<Detected[]>([]);
	let selected = $state<string[]>([]);
	let saved = $state<string[]>([]);
	let requirementsDossier = $state(true);
	let baseClausesHealth = $state<KbClausesHealthSummary | null>(null);
	let isSaving = $state(false);
	let isRepairing = $state(false);
	// Retour affiché dans le panneau : une notification fugace ne suffit pas à comprendre un refus.
	let feedback = $state<{ kind: 'ok' | 'warning' | 'error'; text: string } | null>(null);

	const activeClausesHealth = $derived(
		baseClausesHealth ? rescopeKbClausesHealth(baseClausesHealth, selected) : null
	);

	async function load(pId: string) {
		const res = await fetch(`/api/projects/${encodeURIComponent(pId)}/frameworks/applicable`);
		if (!res.ok) return;
		const data = await res.json();
		catalogue = data.catalogue ?? [];
		detected = data.detected ?? [];
		saved = data.applicable ?? [];
		requirementsDossier = data.requirementsDossier !== false;
		baseClausesHealth = data.clausesHealth ?? null;
		// Rien de déclaré : les référentiels cités par le RFP sont proposés, cochés, en attente de confirmation.
		selected = saved.length > 0 ? [...saved] : detected.map((d) => d.code);
	}

	$effect(() => {
		if (projectId) void load(projectId);
	});

	const dirty = $derived(JSON.stringify([...selected].sort()) !== JSON.stringify([...saved].sort()));

	function toggle(code: string) {
		selected = selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code];
		feedback = null;
	}

	function refusal(status: number, data: { reason?: string; error?: string }): string {
		if (status === 403) {
			const who = page.data?.session?.user?.email ?? 'ce compte';
			return `Refusé pour ${who} : seuls un administrateur, le créateur de l'espace ou un de ses participants (par son adresse e-mail) peuvent déclarer ses référentiels. Connectez-vous avec un tel compte (par exemple l'administrateur).`;
		}
		return data.reason || data.error || `Erreur HTTP ${status}`;
	}

	async function save() {
		if (!projectId) return;
		isSaving = true;
		feedback = null;
		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/frameworks/applicable`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ frameworks: selected })
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				feedback = { kind: 'error', text: refusal(res.status, data) };
				return;
			}
			saved = data.applicable;
			// La copie de l'espace côté navigateur porte aussi la stratégie : sans cela, sa prochaine sauvegarde l'écraserait.
			const eng = deliberationStore.activeEngagement;
			if (eng?.strategy) eng.strategy.applicableFrameworks = data.applicable;
			feedback =
				data.llmops === 'ok'
					? { kind: 'ok', text: `Enregistré et déclaré à LLMOps : ${data.applicable.join(', ') || 'aucun référentiel'}.` }
					: { kind: 'warning', text: "Enregistré dans l'espace ; LLMOps injoignable : relancez « Enregistrer » une fois LLMOps démarré." };
		} catch (err) {
			feedback = { kind: 'error', text: `Non enregistré : ${err instanceof Error ? err.message : err}` };
		} finally {
			isSaving = false;
		}
	}

	/** Le dossier d'exigences est la source des référentiels proposés : on peut l'enregistrer d'ici. */
	async function repairRequirements() {
		if (!projectId) return;
		isRepairing = true;
		feedback = null;
		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/requirements/from-run`, { method: 'POST' });
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				feedback = { kind: 'error', text: refusal(res.status, data) };
				return;
			}
			await load(projectId);
			feedback = { kind: 'ok', text: "Dossier d'exigences enregistré depuis l'analyse du RFP : les référentiels cités sont proposés ci-dessous." };
		} finally {
			isRepairing = false;
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
			<button
				type="button"
				onclick={save}
				disabled={!dirty || isSaving}
				title={dirty ? '' : 'Cochez ou décochez un référentiel pour pouvoir enregistrer'}
				class="shrink-0 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
			>
				{isSaving ? 'Enregistrement…' : saved.length === 0 && selected.length ? 'Confirmer' : 'Enregistrer'}
			</button>
		</div>

		{#if activeClausesHealth && !activeClausesHealth.offline}
			<KbClausesHealthBanner health={activeClausesHealth} compact={true} />
		{/if}

		{#if feedback}
			<p
				class="rounded-lg border p-2 {feedback.kind === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200' : feedback.kind === 'warning' ? 'border-amber-500/30 bg-amber-500/10' : 'border-destructive/30 bg-destructive/10 text-destructive'}"
				data-testid="frameworks-feedback"
			>
				{feedback.text}
			</p>
		{/if}

		{#if !requirementsDossier}
			<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
				<span>Le dossier d'exigences du RFP n'est pas enregistré : aucun référentiel ne peut être proposé d'après le texte. Vous pouvez cocher à la main, ou l'enregistrer d'abord.</span>
				<button type="button" onclick={repairRequirements} disabled={isRepairing} class="shrink-0 rounded-lg bg-amber-600 text-white px-2.5 py-1 font-semibold hover:bg-amber-700 disabled:opacity-60 cursor-pointer">
					{isRepairing ? 'Enregistrement…' : "Enregistrer depuis l'analyse du RFP"}
				</button>
			</div>
		{:else if saved.length === 0 && detected.length}
			<p class="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2">Aucun référentiel déclaré : ceux que cite le RFP sont proposés ci-dessous. Confirmez-les.</p>
		{/if}

		<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
			{#each catalogue as fw (fw.code)}
				{@const d = detected.find((x) => x.code === fw.code)}
				{@const fwStats = activeClausesHealth?.byFramework?.[fw.code.toUpperCase()]}
				<label class="flex items-start gap-2 p-2 rounded-lg border cursor-pointer {selected.includes(fw.code) ? 'border-primary/40 bg-primary/5' : ''}" title={d?.excerpt}>
					<input type="checkbox" class="mt-0.5" checked={selected.includes(fw.code)} onchange={() => toggle(fw.code)} />
					<span>
						<span class="font-semibold text-foreground">{fw.label}</span>
						{#if d}<span class="block text-[10px] text-emerald-700 dark:text-emerald-300">Cité {d.mentions} fois par le RFP</span>{/if}
						{#if saved.includes(fw.code)}<span class="block text-[10px] text-muted-foreground">Déclaré</span>{/if}
						{#if fwStats && !activeClausesHealth?.offline}
							{#if fwStats.activeControlsCount > 0}
								<span
									class="block text-[10px] font-medium {fwStats.isFullyValidated
										? 'text-emerald-700 dark:text-emerald-300'
										: 'text-amber-700 dark:text-amber-300'}"
								>
									{fwStats.validatedControlsCount}/{fwStats.activeControlsCount} ctrl actif{fwStats.activeControlsCount > 1 ? 's' : ''} · {fwStats.validatedClausesCount} clause{fwStats.validatedClausesCount > 1 ? 's' : ''} checks: validée{fwStats.validatedClausesCount > 1 ? 's' : ''}
									{#if fwStats.unvalidatedControlsCount > 0}
										({fwStats.unvalidatedControlsCount} draft/none)
									{/if}
								</span>
							{:else if selected.includes(fw.code)}
								<span class="block text-[10px] font-medium text-amber-700 dark:text-amber-300">
									0 contrôle actif / aucune clause checks: publiée
								</span>
							{/if}
						{/if}
					</span>
				</label>
			{/each}
		</div>
	</section>
{/if}


<script lang="ts">
	import { Layers, Plus, Save, Upload, Globe, Server } from 'lucide-svelte';

	let {
		projectId,
		onUpdated
	}: {
		projectId: string;
		onUpdated?: () => void;
	} = $props();

	let bundle = $state<any>(null);
	let selectedEnv = $state<string>('prod');
	let isLoading = $state(false);
	let isSaving = $state(false);
	let statusMessage = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	// Formulaire d'ajout rapide d'un composant logique
	let newName = $state('');
	let newDisplayName = $state('');
	let newDomain = $state('core-network');
	let newEditor = $state('netops-core');
	let newDataplane = $state<'sriov-dpdk' | 'standard-nis2' | 'dmz-isolated'>('standard-nis2');
	let newZone = $state('app');

	// Édition des substitutions de l'overlay sélectionné
	let overlayJsonText = $state('');

	async function loadCatalog() {
		if (!projectId) return;
		isLoading = true;
		errorMessage = null;
		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/catalog?env=${encodeURIComponent(selectedEnv)}`);
			if (res.ok) {
				const data = await res.json();
				bundle = data.bundle;
				const ov = bundle?.overlays?.find((o: any) => o.metadata?.environment === selectedEnv);
				overlayJsonText = ov ? JSON.stringify(ov.spec, null, 2) : '{}';
			}
		} catch (err: any) {
			errorMessage = err?.message || 'Erreur chargement catalogue';
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		if (projectId && selectedEnv) {
			void loadCatalog();
		}
	});

	async function handleAddComponent() {
		if (!newName.trim()) return;
		isSaving = true;
		errorMessage = null;
		statusMessage = null;
		const cleanName = newName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
		const component = {
			apiVersion: 'archinex.io/v1alpha1',
			kind: 'LogicalComponent',
			metadata: {
				name: cleanName,
				displayName: newDisplayName.trim() || cleanName,
				tenant: `tenant-${cleanName}`,
				external: false,
				functionalDomain: newDomain,
				editor: newEditor,
				status: 'active',
				version: '1.0.0',
				manifestVersion: 1
			},
			spec: {
				class: 'business',
				network: {
					vrfs: [{ name: `vrf-${cleanName}`, domain: `${cleanName}.internal` }],
					subnets: [
						{
							name: `sn-${cleanName}`,
							cidr: `ref(param.${cleanName}.subnet.app)`,
							vrf: `vrf-${cleanName}`,
							zone: newZone,
							class: 'business',
							reserved: { gateway: { offset: 1 }, vip: { offset: 10 } }
						}
					]
				},
				compute: {
					modules: [
						{
							name: `${cleanName}-app`,
							kind: 'container',
							role: 'service',
							status: 'active',
							instances: 2,
							placement: {
								requiredDataplane: newDataplane,
								zone: newZone,
								pool: newDataplane === 'sriov-dpdk' ? 'sylva-cnf-sriov-dpdk' : 'sylva-standard-nis2'
							},
							nics: [
								{
									class: 'business',
									index: 1,
									vrf: `vrf-${cleanName}`,
									subnetRef: `sn-${cleanName}`,
									ip: { by: 'offset', value: 40, perInstance: true },
									defaultRoute: true
								}
							],
							helm: { repo: 'oci://registry.sylva.internal/apps', chart: cleanName, version: '1.0.0' }
						}
					]
				},
				firewall: { policy: 'deny-by-default', groups: [], rules: [] }
			}
		};

		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/catalog`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'upsert_component', component })
			});
			const data = await res.json();
			if (!res.ok) {
				errorMessage = data.lintIssues?.map((i: any) => i.message).join(' | ') || data.error;
			} else {
				statusMessage = `Composant '${cleanName}' ajouté au catalogue.`;
				newName = '';
				newDisplayName = '';
				await loadCatalog();
				onUpdated?.();
			}
		} catch (err: any) {
			errorMessage = err?.message || 'Erreur sauvegarde composant';
		} finally {
			isSaving = false;
		}
	}

	async function handleSaveOverlay() {
		isSaving = true;
		errorMessage = null;
		statusMessage = null;
		try {
			const parsedSpec = JSON.parse(overlayJsonText);
			const currentOv = bundle?.overlays?.find((o: any) => o.metadata?.environment === selectedEnv);
			const overlay = {
				apiVersion: 'archinex.io/v1alpha1',
				kind: 'EnvironmentOverlay',
				metadata: {
					name: selectedEnv,
					environment: selectedEnv,
					version: currentOv?.metadata?.version || '1.0.0',
					manifestVersion: (currentOv?.metadata?.manifestVersion || 1) + 1
				},
				spec: parsedSpec
			};
			const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/catalog`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'upsert_overlay', overlay })
			});
			const data = await res.json();
			if (!res.ok) {
				errorMessage = data.error;
			} else {
				statusMessage = `Overlay '${selectedEnv}' enregistré (What-If / DCs mis à jour).`;
				await loadCatalog();
				onUpdated?.();
			}
		} catch (err: any) {
			errorMessage = `JSON Overlay invalide : ${err?.message}`;
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="rounded-xl border bg-card p-4 shadow-xs space-y-4" data-testid="component-catalog-editor">
	<div class="flex items-center justify-between gap-2 flex-wrap border-b pb-2.5">
		<div>
			<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-violet-500/15 text-violet-700 dark:text-violet-300">
				Catalogue Composants & Overlays (Séparé de l'Ontologie)
			</span>
			<h3 class="text-sm font-bold text-foreground mt-1 flex items-center gap-1.5">
				<Layers class="h-4 w-4 text-violet-500" />
				<span>Éditeur de Composants Logiques & Paramètres d'Environnement / DC</span>
			</h3>
		</div>
		<div class="flex items-center gap-1.5 text-xs">
			<Globe class="h-3.5 w-3.5 text-muted-foreground" />
			<select
				bind:value={selectedEnv}
				class="rounded border bg-background px-2 py-1 text-xs font-mono"
				data-testid="catalog-env-select"
			>
				<option value="prod">prod</option>
				<option value="preprod">preprod</option>
				<option value="lab">lab</option>
			</select>
		</div>
	</div>

	{#if errorMessage}
		<div class="p-2.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200 text-xs">
			{errorMessage}
		</div>
	{/if}
	{#if statusMessage}
		<div class="p-2.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 text-xs">
			{statusMessage}
		</div>
	{/if}

	{#if isLoading}
		<p class="text-xs text-muted-foreground">Chargement du catalogue...</p>
	{:else if bundle}
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<!-- Colonne 1 : Liste & Ajout rapide de Composants Logiques -->
			<div class="space-y-3">
				<h4 class="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
					<Server class="h-3.5 w-3.5" />
					<span>Composants du Catalogue ({bundle.components?.length || 0})</span>
				</h4>
				<div class="space-y-1.5 max-h-52 overflow-y-auto pr-1">
					{#each bundle.components || [] as comp}
						<div class="p-2 rounded border bg-muted/20 text-xs flex items-center justify-between gap-2">
							<div>
								<div class="font-mono font-bold text-foreground">
									{comp.metadata.name}
									{#if comp.metadata.external}
										<span class="ml-1 text-[10px] px-1 rounded bg-amber-500/15 text-amber-700">external</span>
									{/if}
								</div>
								<div class="text-[11px] text-muted-foreground">
									{comp.metadata.displayName} · Domaine: <code class="font-mono">{comp.metadata.functionalDomain}</code>
								</div>
							</div>
							<span class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
								{comp.metadata.status}
							</span>
						</div>
					{/each}
				</div>

				<div class="p-3 rounded-lg border bg-muted/10 space-y-2">
					<div class="text-xs font-bold text-foreground flex items-center gap-1">
						<Plus class="h-3.5 w-3.5" />
						<span>Ajouter un composant logique (Base agnostique)</span>
					</div>
					<div class="grid grid-cols-2 gap-2 text-xs">
						<input
							type="text"
							placeholder="id (ex: billing-api)"
							bind:value={newName}
							class="rounded border bg-background px-2 py-1 font-mono"
						/>
						<input
							type="text"
							placeholder="Libellé affiché"
							bind:value={newDisplayName}
							class="rounded border bg-background px-2 py-1"
						/>
						<select bind:value={newDomain} class="rounded border bg-background px-2 py-1 font-mono">
							{#each bundle.catalogs?.functionalDomains || [] as fd}
								<option value={fd.name}>{fd.name}</option>
							{/each}
						</select>
						<select bind:value={newDataplane} class="rounded border bg-background px-2 py-1 font-mono">
							<option value="standard-nis2">standard-nis2</option>
							<option value="sriov-dpdk">sriov-dpdk</option>
							<option value="dmz-isolated">dmz-isolated</option>
						</select>
					</div>
					<button
						type="button"
						disabled={isSaving || !newName.trim()}
						onclick={handleAddComponent}
						class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
					>
						<Plus class="h-3.5 w-3.5" />
						<span>Ajouter au catalogue</span>
					</button>
				</div>
			</div>

			<!-- Colonne 2 : Saisie / Import de l'Overlay Environnement & Datacenters -->
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<h4 class="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
						<Upload class="h-3.5 w-3.5" />
						<span>Overlay « {selectedEnv} » (Datacenters & Substitutions param.*)</span>
					</h4>
					<button
						type="button"
						disabled={isSaving}
						onclick={handleSaveOverlay}
						class="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold cursor-pointer"
					>
						<Save class="h-3 w-3" />
						<span>Enregistrer Overlay</span>
					</button>
				</div>
				<textarea
					bind:value={overlayJsonText}
					rows={12}
					class="w-full rounded-lg border bg-slate-950 text-slate-100 font-mono text-[11px] p-2.5"
					spellcheck="false"
				></textarea>
			</div>
		</div>
	{/if}
</div>

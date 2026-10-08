<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { ShieldCheck, ShieldAlert, Lock, CheckCircle2, X, Download, Copy, ExternalLink, Hash } from 'lucide-svelte';
	import { formatMaturityLevel } from '$lib/domain/debate';

	const activeSubject = $derived(deliberationStore.activeSubject);
	const activeDraft = $derived(deliberationStore.activeDraft);
	const isOpen = $derived(deliberationStore.isFreezeDialogOpen);

	const gating = $derived(
		activeSubject ? deliberationStore.getGatingCheck(activeSubject.id) : { allowed: false, reason: 'Aucun sujet' }
	);

	const existingSnapshot = $derived(
		activeSubject ? deliberationStore.frozenSnapshots[activeSubject.id] || null : null
	);

	let activeTab = $state<'section' | 'bundle'>('section');
	let confidentiality = $state<'public' | 'internal' | 'confidential' | 'secret'>('internal');
	let isExportingBundle = $state(false);
	let bundleExportError = $state<string | null>(null);
	let exportedBundleResult = $state<{ bundle: any; snapshotRef: any } | null>(null);
	let exportHistory = $state<Array<{ snapshotId: string; checksum: string; isProvisional: boolean; createdAt: string; by: string }>>([]);

	// Dérivation des règles de l'étage épistémique provisoire pour l'engagement
	const unripeSubjects = $derived(
		deliberationStore.subjects.filter((s) => ['L0_named', 'L1_framed', 'L2_decomposed'].includes(s.level))
	);

	const openConflicts = $derived(
		Object.values(deliberationStore.drafts).flatMap((d) => (d.conflit || []))
	);

	const isBundleProvisional = $derived(
		unripeSubjects.length > 0 || openConflicts.length > 0
	);

	const blockingGaps = $derived(
		Object.entries(deliberationStore.drafts).flatMap(([subjId, d]) =>
			(d.manque || []).map((m) => ({ subjectId: subjId, text: m }))
		)
	);

	const proposedElements = $derived(
		deliberationStore.statements.filter((st) => st.authority?.productionMode !== 'human-authored' || st.maturity?.confidence === 'assumed')
	);

	let copySuccess = $state(false);
	let copySnapshotRefSuccess = $state(false);

	function handleClose() {
		deliberationStore.closeFreezeDialog();
	}

	function handleFreeze() {
		if (!activeSubject) return;
		deliberationStore.freezeSection(activeSubject.id);
	}

	async function handleExportBundle() {
		if (!activeSubject) return;
		isExportingBundle = true;
		bundleExportError = null;

		try {
			const res = await fetch(`/api/projects/${activeSubject.id}/bundle-export`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ confidentiality })
			});

			const data = await res.json();
			if (!res.ok) {
				bundleExportError = data.error || 'Erreur lors de l export du bundle';
				return;
			}

			exportedBundleResult = {
				bundle: data.bundle,
				snapshotRef: data.snapshotRef
			};

			exportHistory.unshift({
				snapshotId: data.snapshotRef.snapshotId,
				checksum: data.snapshotRef.checksum,
				isProvisional: data.bundle.data.is_provisional,
				createdAt: data.snapshotRef.producedAt,
				by: deliberationStore.currentRole
			});
		} catch (err: any) {
			bundleExportError = err.message || 'Erreur réseau';
		} finally {
			isExportingBundle = false;
		}
	}

	function downloadExportedBundle() {
		if (!exportedBundleResult) return;
		const blob = new Blob([JSON.stringify(exportedBundleResult.bundle, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `engagement-bundle-${exportedBundleResult.snapshotRef.snapshotId}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function copySnapshotRefToClipboard() {
		if (!exportedBundleResult?.snapshotRef) return;
		navigator.clipboard.writeText(JSON.stringify(exportedBundleResult.snapshotRef, null, 2));
		copySnapshotRefSuccess = true;
		setTimeout(() => {
			copySnapshotRefSuccess = false;
		}, 2000);
	}

	function downloadSnapshot() {
		if (!existingSnapshot) return;
		const blob = new Blob([JSON.stringify(existingSnapshot, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `sealed_snapshot_${existingSnapshot.subjectId}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function copySnapshotToClipboard() {
		if (!existingSnapshot) return;
		navigator.clipboard.writeText(JSON.stringify(existingSnapshot, null, 2));
		copySuccess = true;
		setTimeout(() => {
			copySuccess = false;
		}, 2000);
	}
</script>

{#if isOpen && activeSubject && activeDraft}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
		role="dialog"
		aria-modal="true"
		aria-labelledby="freeze-title"
	>
		<div class="relative w-full max-w-3xl rounded-xl border bg-card p-6 shadow-xl transition-all">
			<!-- Header -->
			<div class="flex items-start justify-between border-b pb-4">
				<div class="flex items-center gap-2">
					<div class="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
						<Lock class="h-5 w-5" />
					</div>
					<div>
						<h3 id="freeze-title" class="text-base font-bold text-foreground">
							Homologation & Scellement · {activeSubject.section_ref}
						</h3>
						<p class="text-xs text-muted-foreground">
							{activeSubject.name} — Instantanés scellés de la suite (SHA-256)
						</p>
					</div>
				</div>
				<button
					type="button"
					onclick={handleClose}
					class="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
					aria-label="Fermer la boîte de dialogue"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Tab Switcher -->
			<div class="mt-4 flex border-b text-xs font-semibold">
				<button
					type="button"
					onclick={() => (activeTab = 'section')}
					class={`pb-2.5 px-4 transition-colors border-b-2 -mb-px ${activeTab === 'section' ? 'border-primary text-primary font-bold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
				>
					Section Active ({activeSubject.section_ref})
				</button>
				<button
					type="button"
					onclick={() => (activeTab = 'bundle')}
					class={`pb-2.5 px-4 transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${activeTab === 'bundle' ? 'border-primary text-primary font-bold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
				>
					<span>Dossier d'Engagement Scellé (Bundle)</span>
					{#if isBundleProvisional}
						<span class="rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[10px]">Provisoire</span>
					{/if}
				</button>
			</div>

			<div class="mt-4 space-y-4 max-h-[70vh] overflow-y-auto pr-1">
				{#if activeTab === 'section'}
					{#if existingSnapshot}
						<!-- Section Déjà Scellée -->
						<div class="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
							<div class="flex items-center gap-2">
								<CheckCircle2 class="h-5 w-5 text-emerald-600" />
								<h4 class="text-sm font-bold text-emerald-800 dark:text-emerald-300">
									Section Scellée & Homologuée
								</h4>
							</div>

							<p class="text-xs text-muted-foreground">
								Cette section a été figée par <strong class="text-foreground">{existingSnapshot.sealedBy.name}</strong> ({existingSnapshot.sealedBy.role}) le {new Date(existingSnapshot.sealedAt).toLocaleString()}.
							</p>

							<div class="rounded bg-muted p-2.5 font-mono text-[11px] space-y-1 border">
								<div class="text-muted-foreground flex items-center gap-1">
									<Hash class="h-3.5 w-3.5 text-primary" />
									<span>Condensat SHA-256 Officiel :</span>
								</div>
								<div class="break-all font-bold text-foreground select-all bg-background p-1.5 rounded border">
									{existingSnapshot.sealSha256}
								</div>
							</div>

							<!-- Références Immuables Scellées -->
							<div>
								<span class="text-xs font-semibold text-muted-foreground">
									Références Externes Scellées ({existingSnapshot.externalRefs.length}) :
								</span>
								<div class="mt-1.5 space-y-1">
									{#each existingSnapshot.externalRefs as ref}
										<div class="flex items-center justify-between text-xs font-mono rounded bg-background p-2 border">
											<span class="font-bold text-primary">{ref.canonical}</span>
										{#if ref.version}<span class="text-muted-foreground"> @{ref.version} (déclarée, non vérifiée)</span>{:else}<span class="text-amber-600"> version non publiée : référence non citable</span>{/if}
											<span class="text-[10px] text-muted-foreground">{ref.sha256Seal.substring(0, 16)}...</span>
										</div>
									{/each}
								</div>
							</div>

							<div class="flex items-center gap-2 pt-2">
								<button
									type="button"
									onclick={downloadSnapshot}
									class="inline-flex items-center gap-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 text-xs font-bold shadow-xs transition-colors"
								>
									<Download class="h-3.5 w-3.5" />
									<span>Télécharger Snapshot JSON</span>
								</button>

								<button
									type="button"
									onclick={copySnapshotToClipboard}
									class="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
								>
									<Copy class="h-3.5 w-3.5" />
									<span>{copySuccess ? 'Copié !' : 'Copier JSON'}</span>
								</button>
							</div>
						</div>
					{:else}
						<!-- Grille de Vérification Section -->
						<div class="space-y-3">
							<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
								Vérification des Critères d'Homologation de la Section
							</span>

							<div class="space-y-2 text-xs">
								<!-- 1. Maturité >= L3 -->
								<div class="flex items-center justify-between p-2.5 rounded-lg border bg-card">
									<div class="flex items-center gap-2">
										{#if activeSubject.level === 'L3_decided' || activeSubject.level === 'L4_specified' || activeSubject.level === 'L5_archived'}
											<CheckCircle2 class="h-4 w-4 text-emerald-600" />
										{:else}
											<ShieldAlert class="h-4 w-4 text-amber-600" />
										{/if}
										<span>Maturité requise &ge; L3 · Décidé</span>
									</div>
									<span class="font-mono font-bold text-foreground">{formatMaturityLevel(activeSubject.level)}</span>
								</div>

								<!-- 2. Zéro Conflit Ouvert -->
								<div class="flex items-center justify-between p-2.5 rounded-lg border bg-card">
									<div class="flex items-center gap-2">
										{#if !activeDraft.conflit || activeDraft.conflit.length === 0}
											<CheckCircle2 class="h-4 w-4 text-emerald-600" />
										{:else}
											<ShieldAlert class="h-4 w-4 text-red-600" />
										{/if}
										<span>Zéro Conflit d'Architecture Ouvert</span>
									</div>
									<span class="font-mono font-bold text-foreground">
										{activeDraft.conflit ? activeDraft.conflit.length : 0} conflit(s)
									</span>
								</div>

								<!-- 3. Rôle Lead Architect -->
								<div class="flex items-center justify-between p-2.5 rounded-lg border bg-card">
									<div class="flex items-center gap-2">
										{#if deliberationStore.currentRole === 'lead_architect' || deliberationStore.currentRole === 'Lead Architect'}
											<CheckCircle2 class="h-4 w-4 text-emerald-600" />
										{:else}
											<ShieldAlert class="h-4 w-4 text-amber-600" />
										{/if}
										<span>Habilitation Lead Architect pour Scellement</span>
									</div>
									<span class="font-mono font-bold text-foreground">{deliberationStore.currentRole}</span>
								</div>
							</div>

							<!-- Résultat Gating -->
							{#if !gating.allowed}
								<div class="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-800 dark:text-red-300 flex items-start gap-2">
									<ShieldAlert class="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
									<div>
										<strong class="font-bold">Scellement Bloqué :</strong> {gating.reason}
									</div>
								</div>
							{:else}
								<div class="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
									<CheckCircle2 class="h-4 w-4 text-emerald-600 shrink-0" />
									<span>Tous les critères d'homologation sont satisfaits. Prêt pour scellement officiel SHA-256.</span>
								</div>
							{/if}
						</div>
					{/if}
				{:else}
					<!-- Onglet Bundle d'engagement (Lots A16-A17) -->
					<div class="space-y-4">
						<!-- Sélecteur de Confidentialité Obligatoire -->
						<div class="rounded-lg border p-3 bg-muted/20 space-y-2">
							<label for="bundle-confidentiality" class="text-xs font-bold text-foreground block">
								Niveau de Confidentialité du Dossier (Obligatoire) *
							</label>
							<select
								id="bundle-confidentiality"
								bind:value={confidentiality}
								class="w-full text-xs rounded-md border border-input bg-background p-2 font-medium focus:ring-1 focus:ring-primary"
							>
								<option value="internal">Interne (internal) — Diffusion interne autorisée</option>
								<option value="confidential">Confidentiel (confidential) — Strict besoin d'en connaître</option>
								<option value="secret">Secret (secret) — Protection souveraine renforcée</option>
								<option value="public">Public (public) — Accessible sans restriction</option>
							</select>
						</div>

						<!-- Bandeau Provisoire (si applicable) -->
						{#if isBundleProvisional}
							<div class="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200 space-y-2">
								<div class="flex items-center gap-2 font-bold">
									<ShieldAlert class="h-4 w-4 text-amber-600 shrink-0" />
									<span>Bandeau Légal : Dossier Provisoire (Non Homologué)</span>
								</div>
								<p class="text-[11px] leading-relaxed">
									Ce dossier sera exporté avec l'attribut <code>is_provisional: true</code> car certains éléments n'ont pas atteint la maturité d'homologation requise.
								</p>
								<div class="space-y-1 text-[11px] bg-background/50 p-2 rounded border border-amber-500/20">
									{#if unripeSubjects.length > 0}
										<div>
											<strong>Sujets en cours d'élaboration (&lt; L3 · Décidé) :</strong>
											<ul class="list-disc list-inside ml-2">
												{#each unripeSubjects as sub}
													<li>{sub.name} ({formatMaturityLevel(sub.level)})</li>
												{/each}
											</ul>
										</div>
									{/if}
									{#if openConflicts.length > 0}
										<div>
											<strong>Conflits d'architecture ouverts ({openConflicts.length}) :</strong>
											<ul class="list-disc list-inside ml-2">
												{#each openConflicts as c}
													<li>{c.text}</li>
												{/each}
											</ul>
										</div>
									{/if}
								</div>
							</div>
						{/if}

						<!-- Écarts Bloquants -->
						{#if blockingGaps.length > 0}
							<div class="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs space-y-1.5">
								<div class="flex items-center gap-1.5 font-bold text-red-800 dark:text-red-300">
									<ShieldAlert class="h-4 w-4 text-red-600" />
									<span>Écarts Bloquants Détectés ({blockingGaps.length})</span>
								</div>
								<ul class="list-disc list-inside text-[11px] text-muted-foreground ml-1 space-y-0.5">
									{#each blockingGaps as gap}
										<li>{gap.text} (section {gap.subjectId})</li>
									{/each}
								</ul>
							</div>
						{/if}

						<!-- Éléments Proposés / Hypothèses (Jamais présentés comme validés) -->
						{#if proposedElements.length > 0}
							<div class="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs space-y-1.5">
								<span class="font-bold text-blue-800 dark:text-blue-300 block">
									Éléments Proposés ou Hypothèses ({proposedElements.length})
								</span>
								<p class="text-[11px] text-muted-foreground">
									Ces éléments portent le niveau épistémique <code>proposed</code> ou <code>assumption</code> et ne sont jamais affirmés comme des faits acquis.
								</p>
							</div>
						{/if}

						<!-- Résultat de l'Export Récent -->
						{#if exportedBundleResult}
							<div class="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
								<div class="flex items-center gap-2">
									<CheckCircle2 class="h-5 w-5 text-emerald-600" />
									<h4 class="text-sm font-bold text-emerald-800 dark:text-emerald-300">
										Dossier d'Engagement Scellé avec Succès
									</h4>
								</div>

								<div class="rounded bg-muted p-2.5 font-mono text-[11px] space-y-1.5 border">
									<div class="text-muted-foreground flex items-center justify-between">
										<span>SnapshotId :</span>
										<span class="font-bold text-foreground">{exportedBundleResult.snapshotRef.snapshotId}</span>
									</div>
									<div class="text-muted-foreground">
										<span>Condensat SHA-256 (canonical-json v1) :</span>
										<div class="break-all font-bold text-foreground select-all bg-background p-1 rounded border mt-0.5">
											{exportedBundleResult.snapshotRef.checksum}
										</div>
									</div>
								</div>

								<div class="flex items-center gap-2 pt-1">
									<button
										type="button"
										onclick={downloadExportedBundle}
										class="inline-flex items-center gap-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 text-xs font-bold shadow-xs transition-colors"
									>
										<Download class="h-3.5 w-3.5" />
										<span>Télécharger engagement-bundle.json</span>
									</button>

									<button
										type="button"
										onclick={copySnapshotRefToClipboard}
										class="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
									>
										<Copy class="h-3.5 w-3.5" />
										<span>{copySnapshotRefSuccess ? 'SnapshotRef Copiée !' : 'Copier SnapshotRef JSON'}</span>
									</button>
								</div>
							</div>
						{/if}

						{#if bundleExportError}
							<div class="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-800 dark:text-red-300">
								<strong>Erreur d'export :</strong> {bundleExportError}
							</div>
						{/if}

						<!-- Historique des Exports Immuables -->
						{#if exportHistory.length > 0}
							<div class="space-y-2 pt-2 border-t">
								<span class="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
									Historique des Dossiers Scellés ({exportHistory.length})
								</span>
								<div class="space-y-1 text-xs">
									{#each exportHistory as h}
										<div class="flex items-center justify-between p-2 rounded border bg-card text-[11px] font-mono">
											<div>
												<span class="font-bold text-primary">{h.snapshotId}</span>
												<span class="text-muted-foreground ml-2">({h.isProvisional ? 'Provisoire' : 'Homologué'})</span>
											</div>
											<span class="text-muted-foreground">{new Date(h.createdAt).toLocaleTimeString()}</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="mt-6 flex items-center justify-between border-t pt-4">
				<button
					type="button"
					onclick={handleClose}
					class="rounded-md border border-input bg-background px-4 py-2 text-xs font-semibold hover:bg-muted transition-colors"
				>
					Fermer
				</button>

				{#if activeTab === 'section'}
					{#if !existingSnapshot}
						<button
							type="button"
							disabled={!gating.allowed}
							onclick={handleFreeze}
							class="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 text-xs font-bold shadow-xs transition-colors"
						>
							<Lock class="h-3.5 w-3.5" />
							<span>Sceller la Section (SHA-256)</span>
						</button>
					{/if}
				{:else}
					<button
						type="button"
						disabled={isExportingBundle}
						onclick={handleExportBundle}
						class="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 text-xs font-bold shadow-xs transition-colors"
					>
						<Lock class="h-3.5 w-3.5" />
						<span>{isExportingBundle ? 'Export en cours...' : 'Exporter le dossier scellé (SHA-256)'}</span>
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

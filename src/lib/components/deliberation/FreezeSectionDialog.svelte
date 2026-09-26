<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { ShieldCheck, ShieldAlert, Lock, CheckCircle2, X, Download, Copy, ExternalLink, Hash } from 'lucide-svelte';

	const activeSubject = $derived(deliberationStore.activeSubject);
	const activeDraft = $derived(deliberationStore.activeDraft);
	const isOpen = $derived(deliberationStore.isFreezeDialogOpen);

	const gating = $derived(
		activeSubject ? deliberationStore.getGatingCheck(activeSubject.id) : { allowed: false, reason: 'Aucun sujet' }
	);

	const existingSnapshot = $derived(
		activeSubject ? deliberationStore.frozenSnapshots[activeSubject.id] || null : null
	);

	let copySuccess = $state(false);

	function handleClose() {
		deliberationStore.closeFreezeDialog();
	}

	function handleFreeze() {
		if (!activeSubject) return;
		deliberationStore.freezeSection(activeSubject.id);
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
		<div class="relative w-full max-w-2xl rounded-xl border bg-card p-6 shadow-xl transition-all">
			<!-- Header -->
			<div class="flex items-start justify-between border-b pb-4">
				<div class="flex items-center gap-2">
					<div class="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
						<Lock class="h-5 w-5" />
					</div>
					<div>
						<h3 id="freeze-title" class="text-base font-bold text-foreground">
							Scellement Officiel · {activeSubject.section_ref}
						</h3>
						<p class="text-xs text-muted-foreground">
							{activeSubject.name} — Génération du livrable scellé SHA-256
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

			<div class="mt-4 space-y-4 max-h-[75vh] overflow-y-auto pr-1">
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
					<!-- Grille de Vérification de la Barrière de Certification -->
					<div class="space-y-3">
						<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
							Vérification des Critères d'Homologation (Gating Checklist)
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
									<span>Maturité $\ge$ L3_decided</span>
								</div>
								<span class="font-mono font-bold text-foreground">{activeSubject.level}</span>
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
			</div>
		</div>
	</div>
{/if}

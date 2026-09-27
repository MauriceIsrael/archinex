<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { EngagementProfile } from '$lib/domain/engagements';
	import {
		X,
		FolderKanban,
		Building2,
		FileText,
		Archive,
		RotateCcw,
		Trash2,
		Download,
		CheckCircle2,
		ShieldCheck,
		Plus,
		AlertTriangle,
		Layers
	} from 'lucide-svelte';

	interface Props {
		open?: boolean;
		onclose: () => void;
		onOpenCreateWorkspace?: () => void;
	}

	let { open = $bindable(false), onclose, onOpenCreateWorkspace }: Props = $props();

	type FilterTab = 'all' | 'active' | 'archived';
	let currentFilter = $state<FilterTab>('all');

	const displayedEngagements = $derived.by(() => {
		if (currentFilter === 'active') return deliberationStore.activeEngagements;
		if (currentFilter === 'archived') return deliberationStore.archivedEngagements;
		return deliberationStore.engagements;
	});

	function handleSwitch(id: string) {
		deliberationStore.switchEngagement(id);
		onclose();
	}

	function handleArchive(eng: EngagementProfile) {
		deliberationStore.archiveEngagement(eng.id);
	}

	function handleUnarchive(eng: EngagementProfile) {
		deliberationStore.unarchiveEngagement(eng.id);
	}

	function handleDelete(eng: EngagementProfile) {
		if (deliberationStore.engagements.length <= 1) {
			alert('Impossible de supprimer le dernier espace de travail disponible.');
			return;
		}

		const confirmMsg = `Êtes-vous certain de vouloir supprimer définitivement le projet "${eng.title}" ?\n\nToutes ses controverses locales et matrices de maturité spécifiques seront effacées.\n(Les documents versés dans la base commune restent préservés).`;
		if (!confirm(confirmMsg)) return;

		deliberationStore.deleteEngagement(eng.id);
	}

	function handleExport(eng: EngagementProfile) {
		const jsonStr = deliberationStore.exportWorkspaceJSON(eng.id);
		const blob = new Blob([jsonStr], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `archinex-workspace-${eng.id}-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
	>
		<div
			class="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden max-h-[92vh] flex flex-col text-foreground"
		>
			<!-- ─── Header ──────────────────────────────────────────────────────── -->
			<div class="p-4 sm:p-5 border-b flex items-center justify-between bg-muted/30 shrink-0">
				<div class="flex items-center gap-3">
					<div class="p-2.5 rounded-xl bg-primary text-primary-foreground shadow-xs">
						<FolderKanban class="h-5 w-5" />
					</div>
					<div>
						<div class="flex items-center gap-2">
							<h2 class="text-base sm:text-lg font-bold">
								Gestion des Espaces de Travail & Projets
							</h2>
							<span
								class="inline-flex items-center gap-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 px-2 py-0.5 text-[10px] font-semibold"
							>
								<ShieldCheck class="h-3 w-3" />
								100% Souverain & Local
							</span>
						</div>
						<p class="text-xs text-muted-foreground mt-0.5">
							Basculez, archivez ou supprimez vos projets. La base de connaissance reste commune et enrichie de facto.
						</p>
					</div>
				</div>
				<button
					type="button"
					onclick={onclose}
					class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
					aria-label="Fermer"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- ─── Filter Tabs & Actions ────────────────────────────────────────── -->
			<div class="px-4 py-2.5 border-b bg-muted/15 flex flex-wrap items-center justify-between gap-2 text-xs">
				<div class="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
					<button
						type="button"
						onclick={() => (currentFilter = 'all')}
						class="px-3 py-1 rounded-md transition-colors {currentFilter === 'all'
							? 'bg-background shadow-xs font-bold text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						Tous ({deliberationStore.engagements.length})
					</button>
					<button
						type="button"
						onclick={() => (currentFilter = 'active')}
						class="px-3 py-1 rounded-md transition-colors {currentFilter === 'active'
							? 'bg-background shadow-xs font-bold text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						Actifs ({deliberationStore.activeEngagements.length})
					</button>
					<button
						type="button"
						onclick={() => (currentFilter = 'archived')}
						class="px-3 py-1 rounded-md transition-colors {currentFilter === 'archived'
							? 'bg-background shadow-xs font-bold text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						Archivés ({deliberationStore.archivedEngagements.length})
					</button>
				</div>

				{#if onOpenCreateWorkspace}
					<button
						type="button"
						onclick={() => {
							onclose();
							onOpenCreateWorkspace?.();
						}}
						class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold shadow-xs hover:bg-primary/90 transition-colors cursor-pointer"
					>
						<Plus class="h-3.5 w-3.5" />
						<span>Nouveau Projet</span>
					</button>
				{/if}
			</div>

			<!-- ─── Projects List ────────────────────────────────────────────────── -->
			<div class="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3">
				{#if displayedEngagements.length === 0}
					<div class="text-center py-12 border rounded-xl bg-muted/20 space-y-2">
						<FolderKanban class="h-8 w-8 text-muted-foreground mx-auto opacity-50" />
						<p class="text-xs text-muted-foreground">Aucun espace de travail dans cette catégorie.</p>
					</div>
				{:else}
					{#each displayedEngagements as eng (eng.id)}
						{@const isCurrentActive = deliberationStore.activeEngagementId === eng.id}
						{@const isArchived = eng.status === 'archived'}

						<div
							class="p-4 rounded-xl border transition-all space-y-3 {isCurrentActive
								? 'bg-primary/5 border-primary/40 shadow-xs'
								: isArchived
									? 'bg-muted/20 border-border opacity-75'
									: 'bg-card border-border hover:border-border/80'}"
						>
							<div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
								<div class="flex items-start gap-3">
									<div
										class="p-2 rounded-lg mt-0.5 shrink-0 {isCurrentActive
											? 'bg-primary text-primary-foreground'
											: isArchived
												? 'bg-muted text-muted-foreground'
												: 'bg-muted/70 text-foreground'}"
									>
										{#if eng.type === 'generic_blueprint'}
											<Building2 class="h-4 w-4" />
										{:else}
											<FileText class="h-4 w-4" />
										{/if}
									</div>

									<div class="space-y-1">
										<div class="flex flex-wrap items-center gap-2">
											<h3 class="font-bold text-sm text-foreground">
												{eng.title}
											</h3>
											{#if isCurrentActive}
												<span
													class="rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-[10px] font-bold"
												>
													Espace Actif
												</span>
											{/if}
											{#if isArchived}
												<span
													class="rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25 px-2 py-0.5 text-[10px] font-bold flex items-center gap-1"
												>
													<Archive class="h-3 w-3" />
													Archivé
												</span>
											{/if}
											<span class="rounded bg-muted text-muted-foreground px-1.5 py-0.5 text-[10px] font-mono">
												{eng.badge}
											</span>
										</div>

										<p class="text-xs text-muted-foreground line-clamp-2">
											{eng.description}
										</p>

										<div class="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] text-muted-foreground font-mono">
											<span>{eng.subjects.length} sujet(s)</span>
											<span>·</span>
											<span>{eng.corpusDocuments.length} doc(s) amont(s)</span>
											{#if eng.participants}
												<span>·</span>
												<span>{eng.participants.length} participant(s)</span>
											{/if}
											{#if eng.createdAt}
												<span>·</span>
												<span>Créé le {new Date(eng.createdAt).toLocaleDateString('fr-FR')}</span>
											{/if}
										</div>
									</div>
								</div>

								<!-- Action Buttons -->
								<div class="flex items-center gap-1.5 self-end sm:self-center shrink-0">
									{#if !isCurrentActive}
										<button
											type="button"
											onclick={() => handleSwitch(eng.id)}
											class="px-2.5 py-1 rounded-lg border bg-background hover:bg-muted text-xs font-semibold transition-colors cursor-pointer"
											title="Basculer sur ce projet"
										>
											Basculer
										</button>
									{/if}

									<!-- Exporter JSON -->
									<button
										type="button"
										onclick={() => handleExport(eng)}
										class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
										title="Exporter la configuration du projet en JSON"
									>
										<Download class="h-4 w-4" />
									</button>

									<!-- Archiver / Désarchiver -->
									{#if isArchived}
										<button
											type="button"
											onclick={() => handleUnarchive(eng)}
											class="inline-flex items-center gap-1 px-2 py-1 rounded-lg border bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20 text-xs font-bold transition-colors cursor-pointer"
											title="Désarchiver et réactiver cet espace"
										>
											<RotateCcw class="h-3 w-3" />
											<span>Désarchiver</span>
										</button>
									{:else}
										<button
											type="button"
											onclick={() => handleArchive(eng)}
											class="p-1.5 rounded-lg text-muted-foreground hover:text-amber-600 hover:bg-muted transition-colors cursor-pointer"
											title="Archiver cet espace (le conserve sans encombrer la vue)"
										>
											<Archive class="h-4 w-4" />
										</button>
									{/if}

									<!-- Supprimer définitivement -->
									<button
										type="button"
										onclick={() => handleDelete(eng)}
										disabled={deliberationStore.engagements.length <= 1}
										class="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
										title={deliberationStore.engagements.length <= 1
											? 'Impossible de supprimer le seul espace existant'
											: 'Supprimer définitivement ce projet'}
									>
										<Trash2 class="h-4 w-4" />
									</button>
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>

			<!-- ─── Footer ──────────────────────────────────────────────────────── -->
			<div class="p-4 border-t bg-muted/20 flex items-center justify-between text-xs">
				<span class="text-muted-foreground text-[11px]">
					Données persistées automatiquement dans votre navigateur ({deliberationStore.engagements.length} espace(s) enregistré(s)).
				</span>
				<button
					type="button"
					onclick={onclose}
					class="px-4 py-1.5 rounded-lg border bg-background hover:bg-muted text-xs font-bold transition-colors cursor-pointer"
				>
					Fermer
				</button>
			</div>
		</div>
	</div>
{/if}

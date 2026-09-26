<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { DocumentCategory } from '$lib/domain/corpus';
	import { X, Plus, FileText, Globe } from 'lucide-svelte';

	interface Props {
		open: boolean;
		onclose: () => void;
	}

	let { open, onclose }: Props = $props();

	let title = $state('');
	let category = $state<DocumentCategory>('standard');
	let categoryLabel = $state('Norme Technique');
	let sourceOrAuthor = $state('Architecte Contributeur');
	let version = $state('v1.0');
	let pageCount = $state<number>(30);
	let selectedSubjectId = $state(deliberationStore.activeSubjectId);
	let summary = $state('');
	let clauseRef = $state('');
	let clauseTitle = $state('');
	let clauseText = $state('');
	let clauseCriticality = $state<'bloquant' | 'majeur' | 'info'>('majeur');

	const categories: Array<{ id: DocumentCategory; label: string }> = [
		{ id: 'standard', label: 'Norme Internationale (3GPP, ITU, ISO)' },
		{ id: 'regulation', label: 'Réglementation (ANSSI, NIS2, RGPD)' },
		{ id: 'vendor_whitepaper', label: 'Whitepaper Constructeur / Spécification' },
		{ id: 'guideline', label: 'Doctrine & Recommandation d\'Entreprise' },
		{ id: 'benchmark', label: 'Benchmark & Mesures Terrain' }
	];

	function handleCategoryChange(catId: DocumentCategory) {
		category = catId;
		const found = categories.find((c) => c.id === catId);
		categoryLabel = found ? found.label : 'Norme';
	}

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!title.trim() || !summary.trim()) return;

		deliberationStore.addContributorDocument({
			title: title.trim(),
			category,
			categoryLabel,
			sourceOrAuthor: sourceOrAuthor.trim() || 'Contributeur',
			contributorRole: deliberationStore.currentRole,
			version: version.trim() || 'v1.0',
			pageCount: pageCount || undefined,
			relatedSubjectIds: [selectedSubjectId],
			summary: summary.trim(),
			keyClauses: [
				{
					id: `cl-${Math.random().toString(36).substring(2, 7)}`,
					clauseRef: clauseRef.trim() || 'Exigence §1.1',
					title: clauseTitle.trim() || 'Exigence clé',
					text: clauseText.trim() || summary.trim(),
					criticality: clauseCriticality,
					impactSummary: `Impact direct sur le sujet ${selectedSubjectId}`
				}
			]
		});

		// Reset form
		title = '';
		summary = '';
		clauseRef = '';
		clauseTitle = '';
		clauseText = '';
		onclose();
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
		<div class="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
			<!-- Header -->
			<div class="p-4 border-b flex items-center justify-between bg-muted/30">
				<div class="flex items-center gap-2">
					<div class="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
						<Globe class="h-4 w-4" />
					</div>
					<div>
						<h3 class="text-sm font-bold text-foreground">Ajouter un Document Externe</h3>
						<p class="text-xs text-muted-foreground">Enrichir le corpus d'ingénierie (Norme, ANSSI, RFC, Whitepaper)</p>
					</div>
				</div>
				<button
					type="button"
					onclick={onclose}
					class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Form Content -->
			<form onsubmit={handleSubmit} class="p-4 space-y-3.5 overflow-y-auto flex-1 text-xs">
				<div>
					<label for="doc-title" class="block font-semibold text-foreground mb-1">
						Titre complet du document *
					</label>
					<input
						id="doc-title"
						type="text"
						bind:value={title}
						required
						placeholder="ex: ITU-T G.8275.1 ou ANSSI Guide d'hygiène..."
						class="w-full rounded-lg border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
					/>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					<div>
						<label for="doc-category" class="block font-semibold text-foreground mb-1">
							Type de référence *
						</label>
						<select
							id="doc-category"
							class="w-full rounded-lg border bg-background px-3 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary"
							onchange={(e) => handleCategoryChange(e.currentTarget.value as DocumentCategory)}
						>
							{#each categories as cat}
								<option value={cat.id} selected={category === cat.id}>{cat.label}</option>
							{/each}
						</select>
					</div>

					<div>
						<label for="doc-author" class="block font-semibold text-foreground mb-1">
							Ajouté par (Contributeur) *
						</label>
						<input
							id="doc-author"
							type="text"
							bind:value={sourceOrAuthor}
							required
							placeholder="ex: P. Durand (Infra Expert)"
							class="w-full rounded-lg border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
						/>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label for="doc-version" class="block font-semibold text-foreground mb-1">
							Version / Révision
						</label>
						<input
							id="doc-version"
							type="text"
							bind:value={version}
							placeholder="ex: Rel 17 v17.4"
							class="w-full rounded-lg border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
						/>
					</div>

					<div>
						<label for="doc-subject" class="block font-semibold text-foreground mb-1">
							Sujet CCTP rattaché
						</label>
						<select
							id="doc-subject"
							bind:value={selectedSubjectId}
							class="w-full rounded-lg border bg-background px-3 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary"
						>
							{#each deliberationStore.subjects as s}
								<option value={s.id}>{s.section_ref} {s.name}</option>
							{/each}
						</select>
					</div>
				</div>

				<div>
					<label for="doc-summary" class="block font-semibold text-foreground mb-1">
						Résumé opérationnel & Portée *
					</label>
					<textarea
						id="doc-summary"
						bind:value={summary}
						rows="2"
						required
						placeholder="Décrivez en 2 phrases pourquoi ce document externe s'applique au projet..."
						class="w-full rounded-lg border bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
					></textarea>
				</div>

				<!-- Exigence clé initiale -->
				<div class="rounded-lg border bg-muted/30 p-3 space-y-2">
					<span class="block text-[11px] font-bold text-foreground uppercase tracking-wider">
						Clause clé initiale
					</span>
					<div class="grid grid-cols-2 gap-2">
						<input
							type="text"
							bind:value={clauseRef}
							placeholder="Réf (ex: Art. 4.2)"
							class="rounded-md border bg-background px-2.5 py-1 text-xs text-foreground focus:ring-1 focus:ring-primary"
						/>
						<select
							bind:value={clauseCriticality}
							class="rounded-md border bg-background px-2 py-1 text-xs text-foreground focus:ring-1 focus:ring-primary"
						>
							<option value="bloquant">Bloquant</option>
							<option value="majeur">Majeur</option>
							<option value="info">Recommandation</option>
						</select>
					</div>
					<input
						type="text"
						bind:value={clauseTitle}
						placeholder="Titre de l'exigence"
						class="w-full rounded-md border bg-background px-2.5 py-1 text-xs text-foreground focus:ring-1 focus:ring-primary"
					/>
					<textarea
						bind:value={clauseText}
						rows="2"
						placeholder="Texte de l'exigence / Contrainte technique..."
						class="w-full rounded-md border bg-background p-2 text-xs text-foreground focus:ring-1 focus:ring-primary"
					></textarea>
				</div>

				<!-- Footer Actions -->
				<div class="pt-2 flex items-center justify-end gap-2 border-t">
					<button
						type="button"
						onclick={onclose}
						class="px-3 py-1.5 rounded-lg border hover:bg-muted text-muted-foreground font-medium"
					>
						Annuler
					</button>
					<button
						type="submit"
						class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
					>
						<Plus class="h-3.5 w-3.5" />
						<span>Ajouter au Corpus</span>
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

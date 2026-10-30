<script lang="ts">
	import { Plus, X, Sparkles, Lightbulb, Check } from 'lucide-svelte';
	import type { OptionOrigin } from '$lib/domain/options';

	let {
		isOpen = false,
		initialData = null,
		onClose = () => {},
		onSave = (option: { id?: string; title: string; summary: string; origin: OptionOrigin; expectedVersion?: number }) => {}
	}: {
		isOpen: boolean;
		initialData?: { id: string; title: string; summary: string; origin: OptionOrigin; version?: number } | null;
		onClose: () => void;
		onSave: (option: { id?: string; title: string; summary: string; origin: OptionOrigin; expectedVersion?: number }) => Promise<void> | void;
	} = $props();

	let title = $state('');
	let summary = $state('');
	let origin = $state<OptionOrigin>('human');
	let error = $state<string | null>(null);
	let isSubmitting = $state(false);

	$effect(() => {
		if (isOpen) {
			if (initialData) {
				title = initialData.title || '';
				summary = initialData.summary || '';
				origin = initialData.origin || 'human';
			} else {
				title = '';
				summary = '';
				origin = 'human';
			}
			error = null;
			isSubmitting = false;
		}
	});

	async function handleSubmit() {
		const trimmedTitle = title.trim();
		const trimmedSummary = summary.trim();

		if (!trimmedTitle) {
			error = "Le titre de l'option est obligatoire.";
			return;
		}
		if (!trimmedSummary) {
			error = 'Le résumé technique de cette option est obligatoire.';
			return;
		}

		error = null;
		isSubmitting = true;
		try {
			await onSave({
				id: initialData?.id,
				title: trimmedTitle,
				summary: trimmedSummary,
				origin,
				expectedVersion: initialData?.version
			});
			title = '';
			summary = '';
			origin = 'human';
			onClose();
		} catch (err: any) {
			error = err.message || "Erreur lors de l'enregistrement de l'option";
		} finally {
			isSubmitting = false;
		}
	}
</script>

{#if isOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
		<div class="w-full max-w-md rounded-xl bg-card p-5 shadow-lg border space-y-4">
			<div class="flex items-center justify-between border-b pb-3">
				<div class="flex items-center gap-2 font-bold text-sm text-foreground">
					<Lightbulb class="h-4 w-4 text-purple-600 dark:text-purple-400" />
					<span>{initialData ? "Modifier l'Option d'Architecture" : "Proposer une Alternative / Option d'Architecture"}</span>
				</div>
				<button
					type="button"
					onclick={onClose}
					class="text-muted-foreground hover:text-foreground text-xs p-1 rounded-md"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			{#if error}
				<div class="rounded-lg bg-destructive/10 border border-destructive/25 p-2 text-destructive text-xs font-medium">
					{error}
				</div>
			{/if}

			<div class="space-y-3 text-xs">
				<div>
					<label for="option-title" class="font-bold text-foreground block mb-1">
						Titre de l'option *
					</label>
					<input
						id="option-title"
						type="text"
						bind:value={title}
						placeholder="ex: Mesh eBPF Cilium sans passerelle physique..."
						class="w-full rounded-md border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
					/>
				</div>

				<div>
					<label for="option-summary" class="font-bold text-foreground block mb-1">
						Résumé technique & hypothèses clés *
					</label>
					<textarea
						id="option-summary"
						bind:value={summary}
						rows={3}
						placeholder="Détailler l'architecture proposée, les composants retenus et le principe de fonctionnement..."
						class="w-full rounded-md border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
					></textarea>
				</div>

				<div>
					<label for="option-origin" class="font-bold text-foreground block mb-1">
						Origine de l'option
					</label>
					<select
						id="option-origin"
						bind:value={origin}
						disabled={!!initialData}
						class="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs text-foreground disabled:opacity-60"
					>
						<option value="human">Proposition Expert Humain</option>
						<option value="llm-proposed">Générée par LLM (assistée)</option>
						<option value="kb-pattern">Pattern de Doctrine / Base de Connaissances</option>
					</select>
				</div>
			</div>

			<div class="flex justify-end gap-2 border-t pt-3">
				<button
					type="button"
					onclick={onClose}
					disabled={isSubmitting}
					class="px-3 py-1.5 rounded-lg border text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
				>
					Annuler
				</button>
				<button
					type="button"
					onclick={handleSubmit}
					disabled={isSubmitting}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-semibold shadow-xs cursor-pointer"
				>
					{#if initialData}
						<Check class="h-3.5 w-3.5" />
						<span>{isSubmitting ? 'Mise à jour...' : "Enregistrer les modifications"}</span>
					{:else}
						<Plus class="h-3.5 w-3.5" />
						<span>{isSubmitting ? 'Enregistrement...' : 'Verser au débat'}</span>
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

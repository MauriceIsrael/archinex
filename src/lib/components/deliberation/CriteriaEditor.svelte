<script lang="ts">
	import { Plus, X, Sliders, Info } from 'lucide-svelte';
	import type { CriterionKind } from '$lib/domain/options';

	let {
		isOpen = false,
		onClose = () => {},
		onSave = (criterion: { name: string; description: string; kind: CriterionKind; weight: number; kbRef?: string }) => {}
	}: {
		isOpen: boolean;
		onClose: () => void;
		onSave: (criterion: { name: string; description: string; kind: CriterionKind; weight: number; kbRef?: string }) => void;
	} = $props();

	let name = $state('');
	let description = $state('');
	let kind = $state<CriterionKind>('nfr');
	let weight = $state<number>(3);
	let kbRef = $state('');
	let error = $state<string | null>(null);

	function handleSubmit() {
		const trimmedName = name.trim();
		if (!trimmedName) {
			error = 'Le nom du critère est obligatoire.';
			return;
		}
		if (weight < 1 || weight > 5) {
			error = 'Le poids doit être compris entre 1 et 5.';
			return;
		}

		error = null;
		onSave({
			name: trimmedName,
			description: description.trim(),
			kind,
			weight,
			kbRef: kbRef.trim() || undefined
		});

		// Reset
		name = '';
		description = '';
		kind = 'nfr';
		weight = 3;
		kbRef = '';
		onClose();
	}
</script>

{#if isOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
		<div class="w-full max-w-md rounded-xl bg-card p-5 shadow-lg border space-y-4">
			<div class="flex items-center justify-between border-b pb-3">
				<div class="flex items-center gap-2 font-bold text-sm text-foreground">
					<Sliders class="h-4 w-4 text-primary" />
					<span>Ajouter un Critère d'Évaluation</span>
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
					<label for="criterion-name" class="font-bold text-foreground block mb-1">
						Nom du critère *
					</label>
					<input
						id="criterion-name"
						type="text"
						bind:value={name}
						placeholder="ex: Latence réseau p99, Conformité ANSSI, TCO sur 3 ans..."
						class="w-full rounded-md border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
					/>
				</div>

				<div>
					<label for="criterion-desc" class="font-bold text-foreground block mb-1">
						Description / Mesure attendue
					</label>
					<textarea
						id="criterion-desc"
						bind:value={description}
						rows={2}
						placeholder="Préciser l'indicateur ou la contrainte mesurée..."
						class="w-full rounded-md border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
					></textarea>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label for="criterion-kind" class="font-bold text-foreground block mb-1">
							Catégorie
						</label>
						<select
							id="criterion-kind"
							bind:value={kind}
							class="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs text-foreground"
						>
							<option value="functional">Fonctionnel</option>
							<option value="nfr">Exigence Non-Fonctionnelle</option>
							<option value="cost">Coût / TCO</option>
							<option value="risk">Risque & Vulnérabilité</option>
							<option value="compliance">Conformité / Souveraineté</option>
						</select>
					</div>

					<div>
						<label for="criterion-weight" class="font-bold text-foreground block mb-1">
							Poids (1 à 5) : <span class="font-mono text-primary font-extrabold">{weight}</span>
						</label>
						<input
							id="criterion-weight"
							type="range"
							min="1"
							max="5"
							step="1"
							bind:value={weight}
							class="w-full accent-primary"
						/>
						<div class="flex justify-between text-[10px] text-muted-foreground font-mono">
							<span>1 (faible)</span>
							<span>3 (moyen)</span>
							<span>5 (critique)</span>
						</div>
					</div>
				</div>

				<div>
					<label for="criterion-kb" class="font-bold text-foreground block mb-1">
						Référence doctrine / KB (optionnel)
					</label>
					<input
						id="criterion-kb"
						type="text"
						bind:value={kbRef}
						placeholder="ex: sec-04, perf-req-01..."
						class="w-full rounded-md border bg-background px-3 py-1.5 text-xs text-foreground font-mono placeholder:text-muted-foreground"
					/>
				</div>
			</div>

			<div class="flex justify-end gap-2 border-t pt-3">
				<button
					type="button"
					onclick={onClose}
					class="px-3 py-1.5 rounded-lg border text-xs font-semibold text-muted-foreground hover:bg-muted"
				>
					Annuler
				</button>
				<button
					type="button"
					onclick={handleSubmit}
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-xs"
				>
					<Plus class="h-3.5 w-3.5" />
					<span>Enregistrer le critère</span>
				</button>
			</div>
		</div>
	</div>
{/if}

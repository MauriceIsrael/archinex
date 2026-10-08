<script lang="ts">
	import type { MaturitySubject } from '$lib/domain/maturityBoard';
	import type { ArchitectRole } from '$lib/types/epistemic';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import {
		PlusCircle,
		X,
		Target,
		Lightbulb,
		UserCheck,
		Layers,
		Check,
		FileText
	} from 'lucide-svelte';

	let {
		isOpen = false,
		projectId = '',
		onClose = () => {},
		onSubjectCreated = (_subject: MaturitySubject) => {}
	}: {
		isOpen: boolean;
		projectId?: string;
		onClose?: () => void;
		onSubjectCreated?: (subject: MaturitySubject) => void;
	} = $props();

	const availableRoles: Array<{ id: ArchitectRole; label: string }> = [
		{ id: 'lead_architect', label: 'Lead Architect' },
		{ id: 'infra_expert_architect', label: 'Expert Infra / Télécom' },
		{ id: 'security_architect', label: 'Expert Sécurité / SecOps' },
		{ id: 'domain_architect', label: 'Architecte Domaine' },
		{ id: 'data_architect', label: 'Architecte Data & IA' },
		{ id: 'domain_expert', label: 'Expert Métier' }
	];

	const effortLevels: Array<'S' | 'M' | 'L' | 'XL'> = ['S', 'M', 'L', 'XL'];

	// État du formulaire
	let sectionRef = $state('');
	let name = $state('');
	let question = $state('');
	let hypothesis = $state('');
	let role = $state<ArchitectRole>('lead_architect');
	let effort = $state<'S' | 'M' | 'L' | 'XL'>('M');
	let isSubmitting = $state(false);

	// Réinitialisation ou auto-génération à l'ouverture
	$effect(() => {
		if (isOpen) {
			const nextNum = deliberationStore.subjects.length + 1;
			sectionRef = `§${nextNum}.0`;
			name = '';
			question = '';
			hypothesis = '';
			role = (deliberationStore.currentRole as ArchitectRole) || 'lead_architect';
			effort = 'M';
			isSubmitting = false;
		}
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!name.trim() || !question.trim() || isSubmitting) return;

		isSubmitting = true;

		try {
			const cleanSection = sectionRef.trim() || `§${deliberationStore.subjects.length + 1}.0`;
			const cleanName = name.trim();
			const cleanQuestion = question.trim();
			const cleanHypothesis = hypothesis.trim() || undefined;

			// 1. Ajout dans le store local réactif
			const createdSubject = deliberationStore.addMaturitySubject({
				sectionRef: cleanSection,
				name: cleanName,
				waitingForRole: role,
				effort,
				initialQuestion: cleanQuestion,
				initialHypothesis: cleanHypothesis
			});

			// 2. Synchronisation en tâche de fond avec l'API backend si projectId actif
			const effectiveProjId = projectId || deliberationStore.activeEngagement?.id;
			if (effectiveProjId) {
				fetch(`/api/projects/${effectiveProjId}/subjects`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						id: createdSubject.id,
						sectionRef: cleanSection,
						name: cleanName,
						domain: 'architecture',
						problemStatement: cleanQuestion,
						maturityLevel: 'L0_named',
						deliberationStatus: 'open',
						waitingForRole: role,
						relativeEffort: effort,
						blockingCount: 1,
						unlocksCount: 2
					})
				}).catch((err) => {
					console.warn('[Archinex] Notification création sujet backend différée:', err);
				});
			}

			// 3. Bascule automatique sur ce nouveau sujet
			deliberationStore.selectSubject(createdSubject.id);
			onSubjectCreated(createdSubject);
			onClose();
		} finally {
			isSubmitting = false;
		}
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
	>
		<div
			class="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[92vh] flex flex-col text-foreground"
		>
			<!-- ─── En-tête ──────────────────────────────────────────────────────── -->
			<div class="p-4 sm:p-5 border-b flex items-center justify-between bg-muted/30 shrink-0">
				<div class="flex items-center gap-3">
					<div class="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
						<PlusCircle class="h-5 w-5" />
					</div>
					<div>
						<div class="flex items-center gap-2">
							<h2 class="text-base sm:text-lg font-bold">
								Créer un nouveau sujet d'architecture
							</h2>
							<span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-muted text-muted-foreground border">
								L0 · Nommé
							</span>
						</div>
						<p class="text-xs text-muted-foreground mt-0.5">
							Ouvrez une nouvelle question clé pour l'instruction, le débat contradictoire et l'arbitrage.
						</p>
					</div>
				</div>
				<button
					type="button"
					onclick={onClose}
					class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
					aria-label="Fermer"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- ─── Formulaire ───────────────────────────────────────────────────── -->
			<form onsubmit={handleSubmit} class="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 text-xs">
				<!-- Section Ref & Intitulé -->
				<div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
					<div class="sm:col-span-1 space-y-1">
						<label for="create-subject-ref" class="font-semibold text-foreground text-[11px] block">
							Référence section :
						</label>
						<input
							id="create-subject-ref"
							type="text"
							bind:value={sectionRef}
							placeholder="§1.0"
							class="w-full px-3 py-1.5 rounded-lg border bg-background text-foreground font-mono text-xs focus:ring-2 focus:ring-primary focus:outline-none"
							required
						/>
					</div>

					<div class="sm:col-span-3 space-y-1">
						<label for="create-subject-name" class="font-semibold text-foreground text-[11px] block">
							Intitulé du sujet d'architecture :
						</label>
						<input
							id="create-subject-name"
							type="text"
							bind:value={name}
							placeholder="Ex : Partitionnement Multi-Région & Résilience des Données"
							class="w-full px-3 py-1.5 rounded-lg border bg-background text-foreground text-xs focus:ring-2 focus:ring-primary focus:outline-none"
							required
						/>
					</div>
				</div>

				<!-- Question centrale / Problème à trancher -->
				<div class="space-y-1">
					<div class="flex items-center justify-between">
						<label for="create-subject-question" class="font-semibold text-foreground text-[11px] flex items-center gap-1">
							<Target class="h-3.5 w-3.5 text-primary" />
							<span>Problème d'architecture à trancher (Question clé) :</span>
						</label>
						<span class="text-[10px] text-muted-foreground">Obligatoire</span>
					</div>
					<textarea
						id="create-subject-question"
						bind:value={question}
						rows="3"
						placeholder="Ex : Quelle stratégie de réplication synchrone ou asynchrone adopter entre les zones pour garantir un RPO=0 sans dégrader la latence transactionnelle ?"
						class="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-xs focus:ring-2 focus:ring-primary focus:outline-none resize-none leading-relaxed"
						required
					></textarea>
				</div>

				<!-- Hypothèse pressentie (optionnelle) -->
				<div class="space-y-1">
					<label for="create-subject-hypothesis" class="font-semibold text-foreground text-[11px] flex items-center gap-1">
						<Lightbulb class="h-3.5 w-3.5 text-blue-500" />
						<span>Hypothèse pressentie initiale (Optionnelle) :</span>
					</label>
					<textarea
						id="create-subject-hypothesis"
						bind:value={hypothesis}
						rows="2"
						placeholder="Ex : Déploiement d'un cluster Raft actif/actif étendu sur 3 zones de disponibilité souveraines."
						class="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none leading-relaxed"
					></textarea>
				</div>

				<!-- Rôle assigné & Effort estimé -->
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
					<div class="space-y-1">
						<label for="create-subject-role" class="font-semibold text-foreground text-[11px] flex items-center gap-1">
							<UserCheck class="h-3.5 w-3.5 text-muted-foreground" />
							<span>Rôle référent / Attribué :</span>
						</label>
						<select
							id="create-subject-role"
							bind:value={role}
							class="w-full px-3 py-1.5 rounded-lg border bg-background text-foreground text-xs focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer"
						>
							{#each availableRoles as r}
								<option value={r.id}>{r.label}</option>
							{/each}
						</select>
					</div>

					<div class="space-y-1">
						<label for="create-subject-effort" class="font-semibold text-foreground text-[11px] flex items-center gap-1">
							<Layers class="h-3.5 w-3.5 text-muted-foreground" />
							<span>Effort relatif estimé :</span>
						</label>
						<div class="flex items-center gap-1.5 pt-0.5">
							{#each effortLevels as eff}
								<button
									type="button"
									onclick={() => (effort = eff)}
									class="flex-1 py-1 rounded text-center font-mono font-bold text-xs border transition-colors cursor-pointer {effort === eff
										? 'bg-primary text-primary-foreground border-primary'
										: 'bg-background hover:bg-muted text-muted-foreground'}"
								>
									{eff}
								</button>
							{/each}
						</div>
					</div>
				</div>

				<!-- Actions -->
				<div class="p-4 sm:p-5 border-t bg-muted/20 flex items-center justify-end gap-2.5 shrink-0 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 mt-4">
					<button
						type="button"
						onclick={onClose}
						disabled={isSubmitting}
						class="px-4 py-2 rounded-xl border border-border bg-background hover:bg-muted font-semibold text-xs transition-colors cursor-pointer"
					>
						Annuler
					</button>

					<button
						type="submit"
						disabled={!name.trim() || !question.trim() || isSubmitting}
						class="px-5 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-all cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
					>
						{#if isSubmitting}
							<span>Création en cours...</span>
						{:else}
							<Check class="h-4 w-4" />
							<span>Créer le sujet</span>
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

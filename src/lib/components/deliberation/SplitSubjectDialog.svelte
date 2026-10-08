<script lang="ts">
	import type { MaturitySubject } from '$lib/domain/maturityBoard';
	import type { TelegraphicDraft } from '$lib/domain/telegraphic';
	import type { ArchitectRole } from '$lib/types/epistemic';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import {
		Scissors,
		X,
		Sparkles,
		Layers,
		CheckCircle2,
		ArrowRight,
		ShieldAlert,
		Server,
		Activity
	} from 'lucide-svelte';

	let {
		isOpen = false,
		parentSubject,
		parentDraft = null,
		onClose = () => {},
		onSplitCreated = (_childAId: string, _childBId: string) => {}
	}: {
		isOpen: boolean;
		parentSubject: MaturitySubject | undefined;
		parentDraft?: TelegraphicDraft | null;
		onClose?: () => void;
		onSplitCreated?: (childAId: string, childBId: string) => void;
	} = $props();

	const availableRoles: Array<{ id: ArchitectRole; label: string }> = [
		{ id: 'lead_architect', label: 'Lead Architect' },
		{ id: 'infra_expert_architect', label: 'Expert Infra / Télécom' },
		{ id: 'security_architect', label: 'Expert Sécurité / SecOps' },
		{ id: 'domain_architect', label: 'Architecte Domaine' },
		{ id: 'data_architect', label: 'Architecte Data & IA' },
		{ id: 'domain_expert', label: 'Expert Métier' }
	];

	// État des 2 sous-problèmes
	let titleA = $state('');
	let questionA = $state('');
	let roleA = $state<ArchitectRole>('infra_expert_architect');
	let effortA = $state<'S' | 'M' | 'L' | 'XL'>('M');

	let titleB = $state('');
	let questionB = $state('');
	let roleB = $state<ArchitectRole>('security_architect');
	let effortB = $state<'S' | 'M' | 'L' | 'XL'>('M');

	let isSubmitting = $state(false);

	// Initialisation réactive lors de l'ouverture
	$effect(() => {
		if (isOpen && parentSubject) {
			const lowerName = parentSubject.name.toLowerCase();

			if (lowerName.includes('noc') || lowerName.includes('soc')) {
				applyNocSocPreset();
			} else if (lowerName.includes('résilience') || lowerName.includes('infra')) {
				applyResiliencePreset();
			} else {
				applyGenericPreset();
			}
		}
	});

	function applyNocSocPreset() {
		titleA = "Salles d'Opérations NOC : Supervision & Télémétrie Temps Réel";
		questionA = "Comment concevoir l'architecture de la salle d'opérations NOC pour assurer la télémétrie, la supervision réseau et les SLAs 24/7 ?";
		roleA = 'infra_expert_architect';
		effortA = 'M';

		titleB = "Salles d'Opérations SOC : Détection d'Incidents & Zéro-Trust";
		questionB = "Comment organiser la salle d'opérations SOC pour la surveillance continue, la corrélation SIEM/SOAR et l'isolation des flux sensibles ?";
		roleB = 'security_architect';
		effortB = 'M';
	}

	function applyResiliencePreset() {
		titleA = `${parentSubject?.name || 'Sujet'} — Cœur Résilient N+1 & Haute Disponibilité`;
		questionA = "Quels mécanismes de bascule active/passive et de tolérance aux pannes déployer sur le socle primaire ?";
		roleA = 'infra_expert_architect';
		effortA = 'M';

		titleB = `${parentSubject?.name || 'Sujet'} — Secours, PRA & Continuité Opérationnelle`;
		questionB = "Comment garantir l'étanchéité des sauvegardes, le PCA/PRA et la reprise d'activité sans impact utilisateur ?";
		roleB = 'security_architect';
		effortB = 'M';
	}

	function applyGenericPreset() {
		const baseName = parentSubject?.name || 'Sujet';
		titleA = `${baseName} — Volet Exploitation & Opérations`;
		questionA = `Comment orchestrer les processus d'exploitation, l'observabilité et l'outillage de gestion ?`;
		roleA = parentSubject?.waiting_for_role || 'infra_expert_architect';
		effortA = 'M';

		titleB = `${baseName} — Volet Sécurité & Gouvernance`;
		questionB = `Quelles contraintes de conformité, d'isolation et de souveraineté imposer à cette brique ?`;
		roleB = 'security_architect';
		effortB = 'M';
	}

	function handleConfirm() {
		if (!parentSubject || !titleA.trim() || !titleB.trim() || isSubmitting) return;
		isSubmitting = true;

		try {
			const result = deliberationStore.splitSubject(
				parentSubject.id,
				{
					name: titleA.trim(),
					question: questionA.trim() || `Quel est le problème clé à trancher pour ${titleA.trim()} ?`,
					role: roleA,
					effort: effortA
				},
				{
					name: titleB.trim(),
					question: questionB.trim() || `Quel est le problème clé à trancher pour ${titleB.trim()} ?`,
					role: roleB,
					effort: effortB
				}
			);

			if (result) {
				onSplitCreated(result.subA.id, result.subB.id);
				onClose();
			}
		} finally {
			isSubmitting = false;
		}
	}
</script>

{#if isOpen && parentSubject}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
	>
		<div
			class="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden max-h-[92vh] flex flex-col text-foreground"
		>
			<!-- ─── Header ──────────────────────────────────────────────────────── -->
			<div class="p-4 sm:p-5 border-b flex items-center justify-between bg-muted/30 shrink-0">
				<div class="flex items-center gap-3">
					<div class="p-2.5 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
						<Scissors class="h-5 w-5" />
					</div>
					<div>
						<div class="flex items-center gap-2">
							<h2 class="text-base sm:text-lg font-bold">
								Scinder le sujet en 2 sous-problèmes d'architecture
							</h2>
							<span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300">
								L2 · Décomposé
							</span>
						</div>
						<p class="text-xs text-muted-foreground mt-0.5">
							Décomposez ce macro-sujet en deux questions plus ciblées pour accélérer l'analyse et l'arbitrage.
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

			<!-- ─── Body ─────────────────────────────────────────────────────────── -->
			<div class="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 text-xs">
				<!-- Rappel du Macro-Sujet Parent -->
				<div class="p-3.5 rounded-xl border bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
					<div>
						<div class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
							Macro-Sujet d'origine ({parentSubject.section_ref})
						</div>
						<div class="text-sm font-bold text-foreground mt-0.5">
							{parentSubject.name}
						</div>
						{#if parentDraft?.manque?.[0]?.question}
							<div class="text-xs text-muted-foreground italic mt-1">
								« {parentDraft.manque[0].question} »
							</div>
						{/if}
					</div>

					<!-- Raccourcis de pré-remplissage -->
					<div class="flex items-center gap-1.5 shrink-0 flex-wrap">
						<button
							type="button"
							onclick={applyNocSocPreset}
							class="px-2.5 py-1 rounded-lg border text-[11px] font-medium bg-background hover:bg-muted transition-colors cursor-pointer flex items-center gap-1"
						>
							<Activity class="h-3 w-3 text-blue-500" />
							<span>NOC vs SOC</span>
						</button>
						<button
							type="button"
							onclick={applyResiliencePreset}
							class="px-2.5 py-1 rounded-lg border text-[11px] font-medium bg-background hover:bg-muted transition-colors cursor-pointer flex items-center gap-1"
						>
							<Server class="h-3 w-3 text-emerald-500" />
							<span>Cœur vs Secours</span>
						</button>
					</div>
				</div>

				<!-- Grille des 2 Sous-Problèmes -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<!-- ─── Sous-Problème A ──────────────────────────────────────── -->
					<div class="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-3 flex flex-col">
						<div class="flex items-center justify-between">
							<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300">
								<span>1️⃣ Sous-problème A</span>
								<span class="font-mono text-[10px] opacity-75">({parentSubject.section_ref.replace(/\.0$/, '')}.1)</span>
							</span>
							<span class="text-[10px] text-muted-foreground">Premier volet</span>
						</div>

						<div class="space-y-1">
							<label for="split-title-a" class="font-semibold text-foreground text-[11px] block">
								Titre du sous-sujet :
							</label>
							<input
								id="split-title-a"
								type="text"
								bind:value={titleA}
								placeholder="Ex : Salles d'Opérations NOC : Supervision & Télémétrie"
								class="w-full px-3 py-1.5 rounded-lg border bg-background text-foreground text-xs focus:ring-2 focus:ring-primary focus:outline-none"
							/>
						</div>

						<div class="space-y-1 flex-1">
							<label for="split-question-a" class="font-semibold text-foreground text-[11px] block">
								🎯 Problème d'architecture à trancher :
							</label>
							<textarea
								id="split-question-a"
								bind:value={questionA}
								rows="3"
								placeholder="Formulez la question clé à trancher..."
								class="w-full px-3 py-1.5 rounded-lg border bg-background text-foreground text-xs focus:ring-2 focus:ring-primary focus:outline-none resize-none leading-relaxed"
							></textarea>
						</div>

						<div class="grid grid-cols-2 gap-2 pt-1 border-t border-border/40">
							<div>
								<label for="split-role-a" class="text-[10px] font-medium text-muted-foreground block">
									Expert attendu :
								</label>
								<select
									id="split-role-a"
									bind:value={roleA}
									class="w-full mt-0.5 px-2 py-1 rounded-md border bg-background text-[11px] text-foreground"
								>
									{#each availableRoles as role}
										<option value={role.id}>{role.label}</option>
									{/each}
								</select>
							</div>

							<div>
								<label for="split-effort-a" class="text-[10px] font-medium text-muted-foreground block">
									Effort estimé :
								</label>
								<select
									id="split-effort-a"
									bind:value={effortA}
									class="w-full mt-0.5 px-2 py-1 rounded-md border bg-background text-[11px] text-foreground"
								>
									<option value="S">S (Court)</option>
									<option value="M">M (Moyen)</option>
									<option value="L">L (Important)</option>
									<option value="XL">XL (Majeur)</option>
								</select>
							</div>
						</div>
					</div>

					<!-- ─── Sous-Problème B ──────────────────────────────────────── -->
					<div class="p-4 rounded-xl border border-purple-500/30 bg-purple-500/5 space-y-3 flex flex-col">
						<div class="flex items-center justify-between">
							<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300">
								<span>2️⃣ Sous-problème B</span>
								<span class="font-mono text-[10px] opacity-75">({parentSubject.section_ref.replace(/\.0$/, '')}.2)</span>
							</span>
							<span class="text-[10px] text-muted-foreground">Second volet</span>
						</div>

						<div class="space-y-1">
							<label for="split-title-b" class="font-semibold text-foreground text-[11px] block">
								Titre du sous-sujet :
							</label>
							<input
								id="split-title-b"
								type="text"
								bind:value={titleB}
								placeholder="Ex : Salles d'Opérations SOC : Détection & Sécurité Zéro-Trust"
								class="w-full px-3 py-1.5 rounded-lg border bg-background text-foreground text-xs focus:ring-2 focus:ring-primary focus:outline-none"
							/>
						</div>

						<div class="space-y-1 flex-1">
							<label for="split-question-b" class="font-semibold text-foreground text-[11px] block">
								🎯 Problème d'architecture à trancher :
							</label>
							<textarea
								id="split-question-b"
								bind:value={questionB}
								rows="3"
								placeholder="Formulez la question clé à trancher..."
								class="w-full px-3 py-1.5 rounded-lg border bg-background text-foreground text-xs focus:ring-2 focus:ring-primary focus:outline-none resize-none leading-relaxed"
							></textarea>
						</div>

						<div class="grid grid-cols-2 gap-2 pt-1 border-t border-border/40">
							<div>
								<label for="split-role-b" class="text-[10px] font-medium text-muted-foreground block">
									Expert attendu :
								</label>
								<select
									id="split-role-b"
									bind:value={roleB}
									class="w-full mt-0.5 px-2 py-1 rounded-md border bg-background text-[11px] text-foreground"
								>
									{#each availableRoles as role}
										<option value={role.id}>{role.label}</option>
									{/each}
								</select>
							</div>

							<div>
								<label for="split-effort-b" class="text-[10px] font-medium text-muted-foreground block">
									Effort estimé :
								</label>
								<select
									id="split-effort-b"
									bind:value={effortB}
									class="w-full mt-0.5 px-2 py-1 rounded-md border bg-background text-[11px] text-foreground"
								>
									<option value="S">S (Court)</option>
									<option value="M">M (Moyen)</option>
									<option value="L">L (Important)</option>
									<option value="XL">XL (Majeur)</option>
								</select>
							</div>
						</div>
					</div>
				</div>

				<div class="rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground space-y-1">
					<div class="font-semibold text-foreground flex items-center gap-1.5">
						<span>ℹ️ Ce que cette action va produire :</span>
					</div>
					<ul class="list-disc list-inside space-y-0.5">
						<li>Le macro-sujet parent passera automatiquement au jalon <strong>L2_decomposed</strong>.</li>
						<li>Deux nouveaux sujets indépendants apparaîtront dans votre tableau de maturité, rattachés à ce parent.</li>
						<li>Chaque sous-problème pourra délibérer, poser ses options et atteindre son propre arbitrage.</li>
					</ul>
				</div>
			</div>

			<!-- ─── Footer ──────────────────────────────────────────────────────── -->
			<div class="p-4 border-t flex items-center justify-between bg-muted/30 shrink-0">
				<button
					type="button"
					onclick={onClose}
					class="px-4 py-2 rounded-lg border bg-background hover:bg-muted text-xs font-semibold cursor-pointer transition-colors"
				>
					Annuler
				</button>

				<button
					type="button"
					onclick={handleConfirm}
					disabled={!titleA.trim() || !titleB.trim() || isSubmitting}
					class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold disabled:opacity-50 cursor-pointer shadow-xs transition-colors"
				>
					<Scissors class="h-3.5 w-3.5" />
					<span>Créer les 2 sous-sujets & Décomposer</span>
				</button>
			</div>
		</div>
	</div>
{/if}

<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ARCHINEX_FACT_VOCABULARY,
		type ReferenceRule,
		type LocalRule,
		type RuleCondition,
		type RuleOperator,
		type ProjectRuleOverride
	} from '$lib/domain/projectRules';
	import {
		Scale,
		ShieldCheck,
		AlertTriangle,
		Plus,
		Trash2,
		Eye,
		Send,
		CheckCircle2,
		XCircle,
		Sliders,
		Lock,
		BookOpen,
		Sparkles,
		RefreshCw
	} from 'lucide-svelte';

	interface Props {
		projectId: string;
		subjectId?: string;
		userRole?: string;
		userId?: string;
		onRuleChanged?: () => void;
	}

	let {
		projectId,
		subjectId = '',
		userRole = 'lead_architect',
		userId = 'lead-architect',
		onRuleChanged = () => {}
	}: Props = $props();

	let referenceRules = $state<Array<ReferenceRule & { status: 'active' | 'disabled'; override?: ProjectRuleOverride }>>([]);
	let localRules = $state<LocalRule[]>([]);
	let disabledOverrides = $state<ProjectRuleOverride[]>([]);
	let isLoading = $state(false);
	let errorMsg = $state<string | null>(null);
	let successMsg = $state<string | null>(null);

	// Désactivation d'une règle
	let ruleToDisable = $state<ReferenceRule | null>(null);
	let disableJustification = $state('');
	let isDisabling = $state(false);

	// Éditeur de règle locale
	let showLocalRuleEditor = $state(false);
	let newRuleName = $state('');
	let newRuleConditions = $state<RuleCondition[]>([
		{ key: 'resilience_mode', op: 'eq', value: 'actif/actif' }
	]);
	let newRuleQuestion = $state('');
	let newRuleSubjectName = $state('');
	let newRuleRationale = $state('');
	let newRuleRole = $state('lead_architect');
	let newRuleLevel = $state<'L0_named' | 'L1_framed'>('L1_framed');
	let newRuleMandatory = $state(false);
	let isProposing = $state(false);

	// Aperçu en direct
	let previewResult = $state<{
		matches: boolean;
		triggeredSubjectName?: string;
		triggeredQuestion?: string;
		details: string[];
		currentFacts: Array<{ key: string; value: string }>;
	} | null>(null);
	let isPreviewing = $state(false);

	const isDecider = $derived(
		['lead_architect', 'admin', 'decider', 'domain_expert', 'domain_architect', 'security_officer'].includes(
			(userRole || '').toLowerCase().replace(/[\s-]+/g, '_')
		)
	);

	onMount(async () => {
		await loadRules();
	});

	async function loadRules() {
		if (!projectId) return;
		isLoading = true;
		errorMsg = null;
		try {
			const res = await fetch(`/api/projects/${projectId}/rules`);
			if (res.ok) {
				const data = await res.json();
				referenceRules = data.referenceRules || [];
				localRules = data.localRules || [];
				disabledOverrides = data.disabledOverrides || [];
			} else {
				const err = await res.json();
				errorMsg = err.error || 'Erreur lors du chargement des règles.';
			}
		} catch (err: any) {
			errorMsg = err.message || 'Erreur réseau lors du chargement des règles.';
		} finally {
			isLoading = false;
		}
	}

	function openDisableModal(rule: ReferenceRule) {
		ruleToDisable = rule;
		disableJustification = '';
		errorMsg = null;
		successMsg = null;
	}

	async function handleDisableRule() {
		if (!ruleToDisable) return;
		if (!disableJustification || disableJustification.trim().length < 5) {
			errorMsg = 'Une justification détaillée (au moins 5 caractères) est obligatoire.';
			return;
		}

		isDisabling = true;
		errorMsg = null;
		successMsg = null;
		try {
			const res = await fetch(`/api/projects/${projectId}/rules/${ruleToDisable.id}/disable`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-user-role': userRole,
					'x-user-id': userId
				},
				body: JSON.stringify({ justification: disableJustification })
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || 'Erreur lors de la désactivation.');
			}

			successMsg = `Règle [${ruleToDisable.id}] désactivée avec succès pour le projet.`;
			ruleToDisable = null;
			await loadRules();
			onRuleChanged();
		} catch (err: any) {
			errorMsg = err.message;
		} finally {
			isDisabling = false;
		}
	}

	async function handleEnableRule(ruleId: string) {
		isLoading = true;
		errorMsg = null;
		successMsg = null;
		try {
			const res = await fetch(`/api/projects/${projectId}/rules/${ruleId}/enable`, {
				method: 'POST',
				headers: {
					'x-user-role': userRole,
					'x-user-id': userId
				}
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || 'Erreur lors de la réactivation.');
			}

			successMsg = `Règle [${ruleId}] réactivée avec succès.`;
			await loadRules();
			onRuleChanged();
		} catch (err: any) {
			errorMsg = err.message;
		} finally {
			isLoading = false;
		}
	}

	function addCondition() {
		newRuleConditions.push({ key: 'site_count', op: 'gte', value: '2' });
	}

	function removeCondition(index: number) {
		if (newRuleConditions.length > 1) {
			newRuleConditions.splice(index, 1);
		}
	}

	async function handleLivePreview() {
		isPreviewing = true;
		errorMsg = null;
		try {
			const payload = {
				customRule: {
					conditions: newRuleConditions,
					action: {
						question: newRuleQuestion || 'Question test',
						subjectName: newRuleSubjectName || 'Sujet test',
						rationale: newRuleRationale,
						initialLevel: newRuleLevel,
						suggestedRole: newRuleRole,
						mandatory: newRuleMandatory
					}
				}
			};

			const query = subjectId ? `?subjectId=${subjectId}` : '';
			const res = await fetch(`/api/projects/${projectId}/rules/custom/preview${query}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (res.ok) {
				previewResult = await res.json();
			} else {
				const err = await res.json();
				throw new Error(err.error || 'Erreur d’évaluation');
			}
		} catch (err: any) {
			errorMsg = err.message;
		} finally {
			isPreviewing = false;
		}
	}

	async function handleProposeLocalRule() {
		if (!newRuleName || newRuleName.trim().length < 3) {
			errorMsg = 'Le nom de la règle locale doit comporter au moins 3 caractères.';
			return;
		}
		if (!newRuleQuestion || newRuleQuestion.trim().length < 5) {
			errorMsg = 'La question doit comporter au moins 5 caractères.';
			return;
		}

		isProposing = true;
		errorMsg = null;
		successMsg = null;
		try {
			const res = await fetch(`/api/projects/${projectId}/rules`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-user-role': userRole,
					'x-user-id': userId
				},
				body: JSON.stringify({
					name: newRuleName,
					conditions: newRuleConditions,
					action: {
						question: newRuleQuestion,
						subjectName: newRuleSubjectName || newRuleName,
						rationale: newRuleRationale || 'Règle locale de projet',
						suggestedRole: newRuleRole,
						initialLevel: newRuleLevel,
						mandatory: newRuleMandatory
					}
				})
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || 'Erreur lors de la proposition.');
			}

			successMsg = 'Règle locale proposée avec succès. Elle est en attente d’affirmation par un arbitre distinct (K16).';
			showLocalRuleEditor = false;
			newRuleName = '';
			newRuleQuestion = '';
			newRuleSubjectName = '';
			newRuleRationale = '';
			previewResult = null;
			await loadRules();
			onRuleChanged();
		} catch (err: any) {
			errorMsg = err.message;
		} finally {
			isProposing = false;
		}
	}

	async function handleAffirmLocalRule(ruleId: string) {
		isLoading = true;
		errorMsg = null;
		successMsg = null;
		try {
			const res = await fetch(`/api/projects/${projectId}/rules/${ruleId}/affirm`, {
				method: 'POST',
				headers: {
					'x-user-role': userRole,
					'x-user-id': userId
				}
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || 'Erreur lors de l’affirmation.');
			}

			successMsg = `Règle locale [${ruleId}] formellement affirmée (K16 validé).`;
			await loadRules();
			onRuleChanged();
		} catch (err: any) {
			errorMsg = err.message;
		} finally {
			isLoading = false;
		}
	}

	async function handleCapitalizeLocalRule(ruleId: string) {
		isLoading = true;
		errorMsg = null;
		successMsg = null;
		try {
			const res = await fetch(`/api/projects/${projectId}/rules/${ruleId}/propose-kb`, {
				method: 'POST',
				headers: {
					'x-user-role': userRole,
					'x-user-id': userId
				}
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || 'Erreur lors de la soumission KB.');
			}

			const data = await res.json();
			successMsg = `✨ Règle locale transmise au référentiel KB (${data.candidateId}) sans ancre de programme (K13 respecté).`;
			await loadRules();
		} catch (err: any) {
			errorMsg = err.message;
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="space-y-4 p-4 text-sm" data-testid="project-rules-panel">
	<!-- En-tête -->
	<div class="flex items-center justify-between pb-2 border-b">
		<div class="flex items-center gap-2">
			<Sliders class="h-4 w-4 text-primary" />
			<h3 class="font-bold text-foreground text-sm">Règles du Projet & Déclencheurs de Cascade (K21/A30)</h3>
		</div>
		<button
			type="button"
			onclick={loadRules}
			disabled={isLoading}
			class="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
			title="Actualiser les règles"
		>
			<RefreshCw class="h-3.5 w-3.5 {isLoading ? 'animate-spin' : ''}" />
		</button>
	</div>

	{#if errorMsg}
		<div class="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
			<XCircle class="h-4 w-4 shrink-0 mt-0.5" />
			<span>{errorMsg}</span>
		</div>
	{/if}

	{#if successMsg}
		<div class="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-start gap-2">
			<CheckCircle2 class="h-4 w-4 shrink-0 mt-0.5" />
			<span>{successMsg}</span>
		</div>
	{/if}

	<!-- Section 1 : Règles de Référence (K19) -->
	<section class="space-y-2">
		<div class="flex items-center justify-between">
			<h4 class="font-semibold text-xs text-foreground flex items-center gap-1.5">
				<BookOpen class="h-3.5 w-3.5 text-indigo-500" />
				<span>Règles de Référence Applicables ({referenceRules.length})</span>
			</h4>
			<span class="text-[10px] text-muted-foreground">Socle de connaissances commun</span>
		</div>

		<div class="space-y-2">
			{#each referenceRules as rule (rule.id)}
				<div class="p-3 rounded-lg border bg-card/60 transition-all {rule.status === 'disabled' ? 'border-amber-500/40 opacity-75' : 'border-border'}">
					<div class="flex items-start justify-between gap-2">
						<div class="space-y-1">
							<div class="flex items-center gap-1.5 flex-wrap">
								<span class="font-mono text-xs font-bold text-foreground">{rule.id}</span>
								<span class="text-xs font-semibold text-foreground">{rule.title}</span>
								<span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground border">
									Actif: {rule.assetRef} ({rule.assetType})
								</span>
								{#if rule.mandatory}
									<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30">
										Obligatoire
									</span>
								{/if}
								{#if rule.status === 'disabled'}
									<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
										Désactivée
									</span>
								{:else}
									<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
										Active
									</span>
								{/if}
							</div>

							<div class="text-[11px] text-muted-foreground">
								<span class="font-medium">Conditions :</span>
								{rule.conditions.map(c => `[${c.key} ${c.op} ${c.value}]`).join(' ET ')}
								<span class="mx-1">→</span>
								<span class="italic text-foreground">Ouvre : {rule.action.subjectName}</span>
							</div>

							{#if rule.status === 'disabled' && rule.override}
								<div class="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200 mt-2">
									<div class="font-semibold text-[11px] flex items-center gap-1">
										<AlertTriangle class="h-3.5 w-3.5" />
										<span>Justification de désactivation :</span>
									</div>
									<p class="text-[11px] mt-0.5">{rule.override.justification}</p>
									<span class="text-[10px] text-muted-foreground">Par {rule.override.disabledBy}</span>
								</div>
							{/if}
						</div>

						<div class="shrink-0 flex items-center gap-1.5">
							{#if rule.status === 'active'}
								<button
									type="button"
									onclick={() => openDisableModal(rule)}
									disabled={!isDecider}
									class="px-2.5 py-1 text-xs rounded-md border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
									title={isDecider ? 'Désactiver avec justification obligatoire' : 'Rôle decider requis'}
								>
									Désactiver
								</button>
							{:else}
								<button
									type="button"
									onclick={() => handleEnableRule(rule.id)}
									disabled={!isDecider}
									class="px-2.5 py-1 text-xs rounded-md border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
									title={isDecider ? 'Réactiver la règle' : 'Rôle decider requis'}
								>
									Réactiver
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- Modal Désactivation Justifiée -->
	{#if ruleToDisable}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
			<div class="bg-card rounded-xl border max-w-md w-full p-4 space-y-3 shadow-lg">
				<div class="flex items-center justify-between pb-2 border-b">
					<h4 class="font-bold text-sm text-foreground flex items-center gap-1.5">
						<AlertTriangle class="h-4 w-4 text-rose-500" />
						<span>Désactivation de la règle {ruleToDisable.id}</span>
					</h4>
					<button
						type="button"
						onclick={() => (ruleToDisable = null)}
						class="text-muted-foreground hover:text-foreground text-xs"
					>
						✕
					</button>
				</div>

				{#if ruleToDisable.mandatory}
					<div class="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-800 dark:text-rose-200 text-xs">
						<strong>⚠️ Attention (Règle Impérative) :</strong>
						Cette règle est obligatoire / issue d'un contrôle réglementaire. Sa désactivation fera l'objet d'un audit strict et sera mise en évidence dans l'arbre de découverte.
					</div>
				{/if}

				<div class="space-y-1.5">
					<label for="disable-justif-input" class="text-xs font-semibold text-foreground">
						Justification obligatoire (min. 5 caractères) :
					</label>
					<textarea
						id="disable-justif-input"
						bind:value={disableJustification}
						placeholder="Expliquez rigoureusement pourquoi cette règle ne s'applique pas au projet..."
						class="w-full h-24 p-2 text-xs rounded-md border bg-background text-foreground"
					></textarea>
				</div>

				<div class="flex items-center justify-end gap-2 pt-2 border-t">
					<button
						type="button"
						onclick={() => (ruleToDisable = null)}
						class="px-3 py-1.5 text-xs rounded-md border hover:bg-muted text-muted-foreground cursor-pointer"
					>
						Annuler
					</button>
					<button
						type="button"
						onclick={handleDisableRule}
						disabled={isDisabling || disableJustification.trim().length < 5}
						class="px-3 py-1.5 text-xs rounded-md bg-rose-600 text-white font-semibold hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isDisabling ? 'Désactivation...' : 'Confirmer la désactivation'}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Section 2 : Règles Locales (K21) -->
	<section class="space-y-2 pt-2 border-t">
		<div class="flex items-center justify-between">
			<h4 class="font-semibold text-xs text-foreground flex items-center gap-1.5">
				<Scale class="h-3.5 w-3.5 text-amber-500" />
				<span>Règles Locales au Projet ({localRules.length})</span>
			</h4>
			<button
				type="button"
				onclick={() => (showLocalRuleEditor = !showLocalRuleEditor)}
				class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
			>
				<Plus class="h-3 w-3" />
				<span>{showLocalRuleEditor ? 'Fermer éditeur' : 'Nouvelle règle locale'}</span>
			</button>
		</div>

		<!-- Éditeur de Règle Locale -->
		{#if showLocalRuleEditor}
			<div class="p-3 rounded-lg border bg-muted/30 space-y-3">
				<h5 class="text-xs font-bold text-foreground">Éditeur de Condition sur le Vocabulaire des Faits (K18)</h5>

				<div class="space-y-1">
					<label for="rule-name-input" class="text-xs font-medium text-foreground">Nom de la règle :</label>
					<input
						id="rule-name-input"
						type="text"
						bind:value={newRuleName}
						placeholder="ex: Règle de résilience cloud hybride"
						class="w-full px-2 py-1 text-xs rounded-md border bg-background"
					/>
				</div>

				<!-- Conjonction de conditions avec sélecteurs typés -->
				<div class="space-y-1.5">
					<div class="flex items-center justify-between">
						<span class="text-xs font-semibold text-foreground">Conditions déclenchantes (Conjonction ET) :</span>
						<button
							type="button"
							onclick={addCondition}
							class="text-[11px] text-primary hover:underline flex items-center gap-0.5 cursor-pointer"
						>
							<Plus class="h-3 w-3" />
							<span>Ajouter condition</span>
						</button>
					</div>

					{#each newRuleConditions as cond, index}
						<div class="flex items-center gap-2">
							<!-- Sélecteur typé sur le vocabulaire -->
							<select
								bind:value={cond.key}
								class="px-2 py-1 text-xs rounded-md border bg-background font-mono"
							>
								{#each ARCHINEX_FACT_VOCABULARY as vocKey}
									<option value={vocKey}>{vocKey}</option>
								{/each}
							</select>

							<!-- Opérateur -->
							<select
								bind:value={cond.op}
								class="px-2 py-1 text-xs rounded-md border bg-background font-mono"
							>
								<option value="eq">=</option>
								<option value="neq">≠</option>
								<option value="gte">≥</option>
								<option value="lte">≤</option>
								<option value="in">dans (liste)</option>
							</select>

							<!-- Valeur -->
							<input
								type="text"
								bind:value={cond.value}
								placeholder="valeur"
								class="flex-1 px-2 py-1 text-xs rounded-md border bg-background font-mono"
							/>

							{#if newRuleConditions.length > 1}
								<button
									type="button"
									onclick={() => removeCondition(index)}
									class="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
									title="Supprimer la condition"
								>
									<Trash2 class="h-3.5 w-3.5" />
								</button>
							{/if}
						</div>
					{/each}
				</div>

				<!-- Déclenchement / Question qui s'ouvre -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t">
					<div class="space-y-1">
						<label for="subject-name-input" class="text-xs font-medium text-foreground">Nom du sujet cascade :</label>
						<input
							id="subject-name-input"
							type="text"
							bind:value={newRuleSubjectName}
							placeholder="ex: Arbitrage Routage Hybride"
							class="w-full px-2 py-1 text-xs rounded-md border bg-background"
						/>
					</div>
					<div class="space-y-1">
						<label for="rule-role-select" class="text-xs font-medium text-foreground">Rôle assigné :</label>
						<select
							id="rule-role-select"
							bind:value={newRuleRole}
							class="w-full px-2 py-1 text-xs rounded-md border bg-background"
						>
							<option value="lead_architect">lead_architect</option>
							<option value="security_officer">security_officer</option>
							<option value="compliance_officer">compliance_officer</option>
							<option value="cloud_architect">cloud_architect</option>
						</select>
					</div>
				</div>

				<div class="space-y-1">
					<label for="rule-question-input" class="text-xs font-medium text-foreground">Question qui s'ouvrirait :</label>
					<input
						id="rule-question-input"
						type="text"
						bind:value={newRuleQuestion}
						placeholder="ex: Quel mécanisme d'interconnexion réseau WAN sécurisé déployer ?"
						class="w-full px-2 py-1 text-xs rounded-md border bg-background"
					/>
				</div>

				<div class="flex items-center gap-2 pt-1">
					<input
						type="checkbox"
						id="mandatory-check"
						bind:checked={newRuleMandatory}
						class="rounded border"
					/>
					<label for="mandatory-check" class="text-xs text-foreground cursor-pointer">
						Règle impérative (mandatory - exige justification à la clôture)
					</label>
				</div>

				<!-- Bloc Aperçu en direct -->
				<div class="p-2.5 rounded-lg border bg-card/80 space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-xs font-semibold text-foreground flex items-center gap-1">
							<Eye class="h-3.5 w-3.5 text-primary" />
							<span>Aperçu « avec les faits actuels, voici ce qui s'ouvrirait »</span>
						</span>
						<button
							type="button"
							onclick={handleLivePreview}
							disabled={isPreviewing}
							class="px-2 py-0.5 text-xs rounded border hover:bg-muted font-medium transition-colors cursor-pointer"
						>
							{isPreviewing ? 'Évaluation...' : 'Tester les faits'}
						</button>
					</div>

					{#if previewResult}
						<div class="p-2 rounded text-xs {previewResult.matches ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200' : 'bg-muted border text-muted-foreground'}">
							{#if previewResult.matches}
								<div class="font-bold flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
									<CheckCircle2 class="h-3.5 w-3.5" />
									<span>La règle se déclencherait immédiatement !</span>
								</div>
								<p class="mt-1">
									<strong>Sujet ouvert :</strong> {previewResult.triggeredSubjectName}
									<br />
									<strong>Question :</strong> {previewResult.triggeredQuestion}
								</p>
							{:else}
								<div class="font-medium">
									Conditions non réunies avec les faits actuels du projet.
								</div>
							{/if}
							<div class="mt-1.5 space-y-0.5 text-[11px] font-mono">
								{#each previewResult.details as detail}
									<div>{detail}</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				<div class="flex items-center justify-end gap-2 pt-2 border-t">
					<button
						type="button"
						onclick={() => (showLocalRuleEditor = false)}
						class="px-3 py-1.5 text-xs rounded-md border hover:bg-muted text-muted-foreground cursor-pointer"
					>
						Annuler
					</button>
					<button
						type="button"
						onclick={handleProposeLocalRule}
						disabled={isProposing || !newRuleName || !newRuleQuestion}
						class="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isProposing ? 'Proposition...' : 'Proposer la règle locale'}
					</button>
				</div>
			</div>
		{/if}

		<!-- Liste des règles locales -->
		<div class="space-y-2">
			{#if localRules.length === 0}
				<p class="text-xs text-muted-foreground italic p-2">Aucune règle locale n’a encore été créée pour ce projet.</p>
			{/if}

			{#each localRules as lRule (lRule.id)}
				<div class="p-3 rounded-lg border bg-card/60 space-y-2 border-border">
					<div class="flex items-start justify-between gap-2">
						<div class="space-y-1">
							<div class="flex items-center gap-1.5 flex-wrap">
								<span class="font-mono text-xs font-bold text-foreground">{lRule.id}</span>
								<span class="text-xs font-semibold text-foreground">{lRule.name}</span>
								{#if lRule.status === 'affirmed'}
									<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
										Affirmée
									</span>
								{:else}
									<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
										Proposée (en attente K16)
									</span>
								{/if}
								{#if lRule.action.mandatory}
									<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30">
										Obligatoire
									</span>
								{/if}
							</div>

							<div class="text-[11px] text-muted-foreground">
								<span class="font-medium">Conditions :</span>
								{lRule.conditions.map(c => `[${c.key} ${c.op} ${c.value}]`).join(' ET ')}
								<span class="mx-1">→</span>
								<span class="italic text-foreground">{lRule.action.subjectName} : {lRule.action.question}</span>
							</div>

							<div class="text-[10px] text-muted-foreground">
								Auteur : <span class="font-mono">{lRule.authorId}</span> ({lRule.authorRole})
								{#if lRule.affirmedById}
									· Affirmée par : <span class="font-mono">{lRule.affirmedById}</span>
								{/if}
							</div>
						</div>

						<div class="shrink-0 flex items-center gap-1.5">
							{#if lRule.status === 'proposed'}
								<!-- Bouton Affirmation K16 : décideur distinct de l'auteur -->
								{#if isDecider && lRule.authorId !== userId}
									<button
										type="button"
										onclick={() => handleAffirmLocalRule(lRule.id)}
										class="px-2.5 py-1 text-xs rounded-md bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors cursor-pointer"
										title="Affirmer la règle locale (K16 respecté)"
									>
										Affirmer (K16)
									</button>
								{:else if lRule.authorId === userId}
									<span
										class="px-2 py-1 text-[10px] rounded border border-muted text-muted-foreground cursor-not-allowed"
										title="Invariant K16 : Un arbitre distinct est requis pour affirmer cette règle"
									>
										Auteur (K16 requis)
									</span>
								{/if}
							{:else}
								<!-- Proposer au référentiel (K22 / K13) -->
								<button
									type="button"
									onclick={() => handleCapitalizeLocalRule(lRule.id)}
									class="px-2.5 py-1 text-xs rounded-md border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10 font-medium transition-colors cursor-pointer flex items-center gap-1"
									title="Proposer au référentiel commun sans ancre de programme (K13)"
								>
									<Sparkles class="h-3 w-3" />
									<span>Capitaliser (K22)</span>
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	</section>
</div>

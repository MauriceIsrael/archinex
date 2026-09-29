<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { renderTelegraphicDraft, validateTelegraphicTone } from '$lib/domain/telegraphic';
	import {
		AlertTriangle,
		CheckCircle2,
		Flame,
		HelpCircle,
		Split,
		Send,
		FileText,
		Edit2,
		ShieldCheck,
		Coins,
		MessagesSquare,
		Scale,
		UserCheck,
		Bot,
		ArrowRight,
		Check,
		Lightbulb,
		Sparkles,
		Plus,
		Compass,
		Database,
		RefreshCw
	} from 'lucide-svelte';
	import OptionsMatrix from './OptionsMatrix.svelte';
	import type { Criterion, Option, OptionEvaluation, TradeOff, Decision } from '$lib/domain/options';

	type ViewTab = 'decision' | 'discussion' | 'draft';
	let activeTab = $state<ViewTab>('decision');

	const draft = $derived(deliberationStore.activeDraft);
	const activeSubject = $derived(deliberationStore.activeSubject);
	const renderedText = $derived(draft ? renderTelegraphicDraft(draft) : '');
	const toneCheck = $derived(renderedText ? validateTelegraphicTone(renderedText) : { valid: true, errors: [] });
	const subjectMessages = $derived(deliberationStore.messagesForActiveSubject);

	let editingHypothesisIndex = $state<number | null>(null);
	let editText = $state<string>('');
	let newExpertComment = $state<string>('');
	let rejectingVariant = $state<boolean>(false);
	let variantRejectReason = $state<string>('');

	// Saisie libre d'une alternative innovante
	let isProposingVariant = $state<boolean>(false);
	let newVariantTitle = $state<string>('');
	let newVariantCostDelta = $state<string>('');
	let newVariantTradeOff = $state<string>('');
	let variantFormError = $state<string | null>(null);

	// Multi-criteria options matrix state
	let matrixCriteria = $state<Criterion[]>([]);
	let matrixOptions = $state<Option[]>([]);
	let matrixEvaluations = $state<OptionEvaluation[]>([]);
	let matrixTradeOffs = $state<TradeOff[]>([]);
	let matrixDecision = $state<Decision | null>(null);
	let isLoadingMatrix = $state<boolean>(false);

	async function loadSubjectMatrix(projectId: string, subjectId: string) {
		if (!projectId || !subjectId) return;
		isLoadingMatrix = true;
		try {
			const [cRes, oRes, eRes, tRes, dRes] = await Promise.all([
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/criteria`),
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/options`),
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/evaluations`),
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/tradeoffs`),
				fetch(`/api/projects/${projectId}/subjects/${subjectId}/decision`)
			]);

			if (cRes.ok) matrixCriteria = await cRes.json();
			if (oRes.ok) matrixOptions = await oRes.json();
			if (eRes.ok) matrixEvaluations = await eRes.json();
			if (tRes.ok) matrixTradeOffs = await tRes.json();
			if (dRes.ok) matrixDecision = await dRes.json();
		} catch (err) {
			console.warn('Erreur chargement matrice options:', err);
		} finally {
			isLoadingMatrix = false;
		}
	}

	$effect(() => {
		const pId = deliberationStore.activeEngagement?.id;
		const sId = deliberationStore.activeSubjectId;
		if (pId && sId) {
			loadSubjectMatrix(pId, sId);
		}
	});

	function handleDecisionMade(dec: Decision) {
		matrixDecision = dec;
		const retained = matrixOptions.find((o) => o.id === dec.retainedOptionId);
		if (retained && draft) {
			if (!draft.retenu.includes(retained.title)) {
				draft.retenu = [retained.title, ...draft.retenu];
			}
		}
		if (activeSubject) {
			deliberationStore.setSubjectLevel(activeSubject.id, 'L3_decided');
		}
		deliberationStore.logNotification(
			`Décision formelle L3 enregistrée : option "${retained?.title || dec.retainedOptionId}" retenue.`,
			'success'
		);
	}

	async function handleConvertVarianteB() {
		const pId = deliberationStore.activeEngagement?.id;
		const sId = deliberationStore.activeSubjectId;
		if (!pId || !sId || !draft?.variante_b) return;

		try {
			const optATitle = draft.retenu[0] || draft.suppose[0]?.text || 'Option A (Référence CCTP)';
			const optASummary = draft.suppose[0]?.consequence || 'Conformité directe avec les exigences';
			await fetch(`/api/projects/${pId}/subjects/${sId}/options`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: optATitle,
					summary: optASummary,
					origin: 'human'
				})
			});

			await fetch(`/api/projects/${pId}/subjects/${sId}/options`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: draft.variante_b.title,
					summary: draft.variante_b.trade_off,
					origin: 'llm-proposed'
				})
			});

			await loadSubjectMatrix(pId, sId);
			deliberationStore.logNotification('Variante B convertie avec succès en option structurée A2.', 'success');
		} catch (err: any) {
			deliberationStore.logNotification('Erreur conversion : ' + err.message, 'warning');
		}
	}

	function handleSendComment() {
		if (!newExpertComment.trim()) return;
		deliberationStore.sendSubjectMessage(newExpertComment.trim());
		newExpertComment = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSendComment();
		}
	}

	function handleProposeVariant() {
		const title = newVariantTitle.trim();
		if (!title) {
			variantFormError = "Veuillez renseigner au moins le titre de l'alternative technique.";
			return;
		}

		variantFormError = null;
		const costDelta = newVariantCostDelta.trim() || 'À chiffrer en séance';
		const tradeOff = newVariantTradeOff.trim() || 'Alternative innovante versée au débat contradictoire';

		const res = deliberationStore.proposeCustomVariant(deliberationStore.activeSubjectId, {
			title,
			cost_delta: costDelta,
			trade_off: tradeOff
		});

		if (res.success) {
			isProposingVariant = false;
			newVariantTitle = '';
			newVariantCostDelta = '';
			newVariantTradeOff = '';
			variantFormError = null;
		} else {
			variantFormError = res.message;
		}
	}

	let isEliciting = $state<boolean>(false);
	let isHarvesting = $state<boolean>(false);

	async function handleElicitDetails() {
		if (!draft || !activeSubject) return;
		isEliciting = true;

		try {
			const res = await fetch('/api/deliberation/elicit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					subjectId: activeSubject.id,
					subjectName: activeSubject.name,
					sectionRef: draft.section_id,
					currentLevel: activeSubject.level,
					existingRetenu: draft.retenu,
					existingHypotheses: draft.suppose,
					existingConflicts: draft.conflit,
					clausesText: activeSubject.name
				})
			});

			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.message || `Erreur serveur (${res.status})`);
			}

			const data = await res.json();
			if (data.elicitedDraft) {
				// Enrichissement du draft
				if (data.elicitedDraft.suppose && data.elicitedDraft.suppose.length > 0) {
					draft.suppose = [...data.elicitedDraft.suppose];
				}
				if (data.elicitedDraft.conflit && data.elicitedDraft.conflit.length > 0) {
					draft.conflit = [...data.elicitedDraft.conflit];
				}
				if (data.elicitedDraft.manque && data.elicitedDraft.manque.length > 0) {
					draft.manque = [...data.elicitedDraft.manque];
				}
				if (data.elicitedDraft.variante_b) {
					draft.variante_b = data.elicitedDraft.variante_b;
				}

				// Progression de maturité : passage en L2 (Décomposé / En débat)
				if (activeSubject.level === 'L0_named' || activeSubject.level === 'L1_framed') {
					deliberationStore.setSubjectLevel(activeSubject.id, 'L2_decomposed');
				}

				// Provocation dialectique injectée dans le chat d'experts
				if (data.provocationMessage) {
					deliberationStore.sendSubjectMessage(data.provocationMessage, activeSubject.id);
				}

				deliberationStore.logNotification(
					`✨ Élicitation réussie (${data.modelUsed}) : sous-questions et hypothèses intégrées. Le débat d'experts est lancé !`,
					'success'
				);
			}
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : 'Échec de l\'élicitation';
			deliberationStore.logNotification(msg, 'warning');
		} finally {
			isEliciting = false;
		}
	}

	async function handleHarvestSubject() {
		if (!activeSubject) return;
		isHarvesting = true;
		try {
			await deliberationStore.harvestSubjectToKnowledgeBase(activeSubject.id);
		} finally {
			isHarvesting = false;
		}
	}

	function formatMaturityLabel(level?: string) {
		switch (level) {
			case 'L0_named': return 'L0 · En émergence';
			case 'L1_framed': return 'L1 · Cadré (Dilemmes posés)';
			case 'L2_decomposed': return 'L2 · En débat (Options ouvertes)';
			case 'L3_decided': return 'L3 · Décision Validée & Arbitrée';
			case 'L4_specified': return 'L4 · Spécifié';
			case 'L5_archived': return 'L5 · Scellé opposable';
			default: return level || 'L0';
		}
	}
</script>

<div class="rounded-xl border bg-card p-4 shadow-xs h-full flex flex-col space-y-3">
	<!-- En-tête de section avec Maturité & Action Sceller -->
	<div class="flex items-start justify-between gap-3 pb-3 border-b">
		<div>
			<div class="flex items-center gap-2 mb-1 flex-wrap">
				<span class="text-xs font-mono font-bold bg-muted px-2 py-0.5 rounded text-foreground">
					{draft?.section_id || '§0.0'}
				</span>
				{#if draft?.is_provisional}
					<span class="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400 border border-amber-500/30">
						{formatMaturityLabel(activeSubject?.level || draft?.maturity)}
					</span>
				{:else}
					<span class="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
						✅ {formatMaturityLabel(activeSubject?.level || draft?.maturity)}
					</span>
				{/if}
				{#if activeSubject && activeSubject.blocking_count > 0}
					<span class="font-mono text-[10px] px-1.5 py-0.2 rounded bg-destructive/10 text-destructive font-bold">
						{activeSubject.blocking_count} bloquant
					</span>
				{/if}
			</div>
			<h3 class="text-base font-bold tracking-tight text-foreground">
				{draft?.subject || 'Aucun sujet sélectionné'}
			</h3>
		</div>

		<!-- Actions Rapides -->
		<div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
			{#if draft}
				<!-- Bouton Élicitation Assistée par LLM Local Souverain -->
				<button
					type="button"
					class="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-primary to-primary/80 hover:opacity-95 text-primary-foreground px-2.5 py-1 text-xs font-semibold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
					onclick={handleElicitDetails}
					disabled={isEliciting}
					title="Éliciter les hypothèses (SUPPOSE), controverses (CONFLIT) et sous-questions (MANQUE) via le LLM local"
				>
					{#if isEliciting}
						<RefreshCw class="h-3.5 w-3.5 animate-spin" />
						<span>Élicitation...</span>
					{:else}
						<Sparkles class="h-3.5 w-3.5 text-amber-300" />
						<span>Éliciter (LLM Local)</span>
					{/if}
				</button>

				<!-- Bouton Récolter (Harvesting) dans LLMOps -->
				{#if draft.retenu.length > 0}
					<button
						type="button"
						class="inline-flex items-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 text-xs font-semibold shadow-2xs transition-colors shrink-0 cursor-pointer disabled:opacity-50"
						onclick={handleHarvestSubject}
						disabled={isHarvesting}
						title="Récolter les décisions validées de ce sujet dans le Patrimoine Commun (LLMOps)"
					>
						{#if isHarvesting}
							<RefreshCw class="h-3.5 w-3.5 animate-spin" />
							<span>Récolte...</span>
						{:else}
							<Database class="h-3.5 w-3.5 text-indigo-200" />
							<span>Récolter dans LLMOps</span>
						{/if}
					</button>
				{/if}
			{/if}

			<button
				type="button"
				class="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-xs font-semibold shadow-2xs transition-colors shrink-0"
				onclick={() => deliberationStore.openFreezeDialog()}
				title="Sceller la section pour homologation (SHA-256)"
			>
				<ShieldCheck class="h-3.5 w-3.5" />
				<span>Sceller</span>
			</button>
		</div>
	</div>

	<!-- Onglets de Délibération du Sujet (Problème & Alternatives / Débat Experts / Fiche Télégraphique) -->
	<div class="flex items-center gap-1 bg-muted/60 p-1 rounded-lg overflow-x-auto text-xs border">
		<button
			type="button"
			onclick={() => (activeTab = 'decision')}
			class="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-semibold transition-all whitespace-nowrap {activeTab === 'decision'
				? 'bg-background text-foreground shadow-2xs'
				: 'text-muted-foreground hover:text-foreground'}"
		>
			<Scale class="h-3.5 w-3.5 text-amber-500" />
			<span>1. Problème & Alternatives</span>
		</button>

		<button
			type="button"
			onclick={() => (activeTab = 'discussion')}
			class="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-semibold transition-all whitespace-nowrap {activeTab === 'discussion'
				? 'bg-background text-foreground shadow-2xs'
				: 'text-muted-foreground hover:text-foreground'}"
		>
			<MessagesSquare class="h-3.5 w-3.5 text-blue-500" />
			<span>2. Débat Experts ({subjectMessages.length})</span>
		</button>

		<button
			type="button"
			onclick={() => (activeTab = 'draft')}
			class="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-semibold transition-all whitespace-nowrap {activeTab === 'draft'
				? 'bg-background text-foreground shadow-2xs'
				: 'text-muted-foreground hover:text-foreground'}"
		>
			<FileText class="h-3.5 w-3.5 text-primary" />
			<span>3. Synthèse Télégraphique</span>
		</button>
	</div>

	{#if !draft}
		<div class="flex-1 flex items-center justify-center p-8 text-center text-muted-foreground text-xs border rounded-lg">
			Sélectionnez un sujet dans la Matrice d'Allocation d'Effort pour afficher son dossier de délibération.
		</div>
	{:else}
		<div class="flex-1 overflow-y-auto space-y-3.5 pr-1 text-xs">
			<!-- ═════════════════════════════════════════════════════════════════ -->
			<!-- VUE 1 : LE PROBLÈME À TRANCHER ET LES ALTERNATIVES EN CONFRONTATION-->
			<!-- ═════════════════════════════════════════════════════════════════ -->
			{#if activeTab === 'decision'}
				<!-- 1. LE PROBLÈME À TRANCHER (CLAIREMENT IDENTIFIÉ) -->
				<div class="rounded-xl border-2 border-amber-500/30 bg-amber-500/[0.04] p-3.5 space-y-2.5">
					<div class="flex items-center justify-between">
						<span class="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
							<AlertTriangle class="h-4 w-4 text-amber-600" />
							<span>Le Problème à Trancher (Dilemme d'Architecture)</span>
						</span>
						{#if draft.conflit.length > 0}
							<span class="font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
								Arbitrage Requis (L3)
							</span>
						{:else}
							<span class="font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
								Conflit Résolu
							</span>
						{/if}
					</div>

					{#if draft.conflit.length > 0}
						{#each draft.conflit as c}
							<div class="bg-background rounded-lg p-3 border border-amber-500/30 space-y-1.5 shadow-2xs">
								<div class="text-xs font-semibold text-foreground leading-relaxed">
									<strong class="text-amber-700 dark:text-amber-400">Contradiction :</strong> {c.text}
									<span class="text-muted-foreground"> opposé à </span>
									<span class="font-mono font-bold text-destructive bg-destructive/10 px-1 py-0.2 rounded">{c.opposing_reference}</span>
								</div>
								{#if activeSubject && activeSubject.dependent_subject_ids.length > 0}
									<div class="text-[11px] text-muted-foreground pt-1 border-t flex items-center gap-1">
										<span>Bloque <strong>{activeSubject.dependent_subject_ids.length} sections aval :</strong></span>
										<span class="font-mono text-foreground font-semibold">[{activeSubject.dependent_subject_ids.join(', ')}]</span>
									</div>
								{/if}
							</div>
						{/each}
					{:else}
						<div class="bg-background rounded-lg p-3.5 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5 shadow-2xs">
							<CheckCircle2 class="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
							<div class="space-y-1">
								<div class="flex items-center gap-2 flex-wrap">
									<strong class="text-xs font-bold">Décision d'Architecture Validée & Arbitrée (Niveau L3)</strong>
									<span class="font-mono text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold uppercase">
										Opposable & Validé
									</span>
								</div>
								<p class="text-[11px] text-muted-foreground leading-relaxed">
									Le choix technique sur cette section est formellement acté par le Lead Architect. Toutes les contradictions bloquantes sont levées et les sections avals dépendantes sont autorisées à entrer en spécification détaillée.
								</p>
							</div>
						</div>
					{/if}
				</div>

				<!-- 2. MATRICE MULTI-CRITÈRES & ALTERNATIVES (LOT A2) -->
				<div class="space-y-3">
					{#if matrixOptions.length > 0 || matrixCriteria.length > 0}
						<OptionsMatrix
							projectId={deliberationStore.activeEngagement?.id || ''}
							subjectId={deliberationStore.activeSubjectId}
							bind:criteria={matrixCriteria}
							bind:options={matrixOptions}
							bind:evaluations={matrixEvaluations}
							bind:tradeOffs={matrixTradeOffs}
							bind:decision={matrixDecision}
							userRole={deliberationStore.currentRole}
							onDecisionMade={handleDecisionMade}
							onError={(msg) => deliberationStore.logNotification(msg, 'warning')}
						/>
					{:else}
						<!-- Si aucune option n'a encore été créée, proposer l'élicitation ou la conversion -->
						<div class="rounded-xl border border-dashed p-4 bg-card text-center space-y-3">
							<div class="flex flex-col items-center justify-center space-y-1">
								<Scale class="h-6 w-6 text-primary" />
								<h4 class="text-xs font-bold text-foreground">Matrice Multi-Critères (Lot A2)</h4>
								<p class="text-[11px] text-muted-foreground max-w-md">
									Ce sujet ne dispose pas encore de critères d'évaluation ni d'options normalisées. Vous pouvez lancer l'élicitation automatique (3 critères, 3 options) ou convertir la variante existante.
								</p>
							</div>

							<div class="flex items-center justify-center gap-2 flex-wrap pt-1">
								<button
									type="button"
									onclick={handleElicitDetails}
									disabled={isEliciting}
									class="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 text-xs font-semibold shadow-xs"
								>
									<Sparkles class="h-3.5 w-3.5" />
									<span>Éliciter critères & options (LLM)</span>
								</button>

								{#if draft.variante_b}
									<button
										type="button"
										onclick={handleConvertVarianteB}
										class="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-800 dark:text-purple-300 px-3 py-1.5 text-xs font-semibold shadow-xs"
									>
										<Split class="h-3.5 w-3.5 text-purple-600" />
										<span>Convertir Variante B (« {draft.variante_b.title} »)</span>
									</button>
								{/if}
							</div>
						</div>

						<OptionsMatrix
							projectId={deliberationStore.activeEngagement?.id || ''}
							subjectId={deliberationStore.activeSubjectId}
							bind:criteria={matrixCriteria}
							bind:options={matrixOptions}
							bind:evaluations={matrixEvaluations}
							bind:tradeOffs={matrixTradeOffs}
							bind:decision={matrixDecision}
							userRole={deliberationStore.currentRole}
							onDecisionMade={handleDecisionMade}
							onError={(msg) => deliberationStore.logNotification(msg, 'warning')}
						/>
					{/if}
				</div>

				<!-- APERÇU DE LA DISCUSSION EXPERTS (Raccourci vers Tab 2) -->
				<div class="rounded-xl border bg-muted/20 p-3 space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
							<MessagesSquare class="h-3.5 w-3.5 text-blue-500" />
							<span>Dernier Échange d'Experts sur {activeSubject?.section_ref || 'ce sujet'}</span>
						</span>
						<button
							type="button"
							onclick={() => (activeTab = 'discussion')}
							class="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
						>
							<span>Voir les {subjectMessages.length} échanges</span>
							<ArrowRight class="h-3 w-3" />
						</button>
					</div>
					{#if subjectMessages.length > 0}
						{@const lastMsg = subjectMessages[subjectMessages.length - 1]}
						<div class="bg-card rounded-lg p-2.5 border text-xs space-y-1">
							<div class="flex items-center justify-between text-[11px]">
								<strong class="text-foreground">{lastMsg.author}</strong>
								<span class="text-muted-foreground font-mono">{lastMsg.timestamp}</span>
							</div>
							<p class="text-muted-foreground leading-relaxed italic">
								« {lastMsg.content} »
							</p>
						</div>
					{:else}
						<p class="text-xs text-muted-foreground italic">Aucun échange spécifique archivé pour ce sujet.</p>
					{/if}
				</div>

			<!-- ═════════════════════════════════════════════════════════════════ -->
			<!-- VUE 2 : DISCUSSION ENTRE EXPERTS SUR CE SUJET                     -->
			<!-- ═════════════════════════════════════════════════════════════════ -->
			{:else if activeTab === 'discussion'}
				<div class="rounded-xl border bg-card p-3 space-y-3">
					<div class="flex items-center justify-between border-b pb-2">
						<div class="flex items-center gap-2">
							<MessagesSquare class="h-4 w-4 text-blue-500" />
							<h4 class="text-xs font-bold text-foreground">
								Discussion entre Experts sur {activeSubject?.section_ref} {activeSubject?.name}
							</h4>
						</div>
						<div class="flex items-center gap-1.5">
							<span class="font-mono text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 font-bold">
								{subjectMessages.length} sur {activeSubject?.section_ref || 'cette section'}
							</span>
							{#if deliberationStore.generalDialogueMessages.length > 0}
								<span class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground" title="Messages généraux au niveau du projet consultables dans le fil général">
									+{deliberationStore.generalDialogueMessages.length} globaux
								</span>
							{/if}
						</div>
					</div>

					<!-- Liste des messages d'experts -->
					<div class="space-y-2.5 max-h-80 overflow-y-auto pr-1">
						{#if subjectMessages.length === 0}
							<div class="p-6 text-center text-xs text-muted-foreground border rounded-lg bg-muted/10 space-y-1">
								<p class="font-semibold text-foreground">Aucun échange spécifique pour {activeSubject?.section_ref} {activeSubject?.name}.</p>
								<p class="text-[11px]">Saisissez ci-dessous votre premier avis technique ou directive d'architecture pour initier la concertation.</p>
							</div>
						{:else}
							{#each subjectMessages as msg}
								<div class="rounded-lg p-2.5 border text-xs space-y-1 {msg.isAi ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-border'}">
									<div class="flex items-center justify-between gap-2">
										<div class="flex items-center gap-1.5">
											{#if msg.isAi}
												<Bot class="h-3.5 w-3.5 text-primary" />
											{:else}
												<UserCheck class="h-3.5 w-3.5 text-emerald-600" />
											{/if}
											<strong class="font-semibold text-foreground">{msg.author}</strong>
											<span class="rounded bg-muted px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
												{msg.role}
											</span>
										</div>
										<span class="font-mono text-[10px] text-muted-foreground">{msg.timestamp}</span>
									</div>
									<p class="text-muted-foreground leading-relaxed pl-5">
										{msg.content}
									</p>
								</div>
							{/each}
						{/if}
					</div>

					<!-- Champ de saisie pour intervenir dans le débat -->
					<div class="pt-2 border-t space-y-2">
						<label for="expert-comment-input" class="sr-only">Participer au débat expert</label>
						<div class="flex gap-2">
							<input
								id="expert-comment-input"
								type="text"
								bind:value={newExpertComment}
								onkeydown={handleKeydown}
								placeholder="Participer au débat ou argumenter un arbitrage..."
								class="flex-1 bg-background border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary shadow-xs"
							/>
							<button
								type="button"
								onclick={handleSendComment}
								class="inline-flex items-center gap-1 bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-colors shrink-0"
							>
								<Send class="h-3.5 w-3.5" />
								<span>Envoyer</span>
							</button>
						</div>
					</div>
				</div>

			<!-- ═════════════════════════════════════════════════════════════════ -->
			<!-- VUE 3 : SYNTHÈSE TÉLÉGRAPHIQUE DU SUJET                           -->
			<!-- ═════════════════════════════════════════════════════════════════ -->
			{:else if activeTab === 'draft'}
				<!-- 1. RETENU -->
				<div class="rounded-lg bg-muted/30 p-3 border space-y-1.5">
					<span class="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
						Décisions Actées & Retenues
					</span>
					{#if draft.retenu.length === 0}
						<p class="text-xs italic text-muted-foreground">Aucune décision actée pour le moment.</p>
					{:else}
						<div class="flex flex-wrap gap-1.5">
							{#each draft.retenu as ret}
								<span class="inline-flex items-center rounded-md bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 text-xs font-mono font-medium border border-emerald-500/20">
									{ret}
								</span>
							{/each}
						</div>
					{/if}
				</div>

				<!-- 2. HYPOTHÈSES (DIFF SENSOR) -->
				<div class="rounded-lg bg-amber-500/5 p-3 border border-amber-500/20 space-y-2">
					<span class="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400 flex items-center gap-1">
						<Flame class="h-3 w-3" />
						Hypothèses & Impacts Matériels
					</span>
					<div class="space-y-2">
						{#each draft.suppose as hyp, idx}
							<div class="bg-card rounded p-2.5 border border-amber-500/20 space-y-1.5 shadow-2xs">
								<div class="flex items-start justify-between gap-2">
									<div class="font-medium text-foreground flex-1 leading-snug">
										<span class="font-mono text-amber-700 dark:text-amber-400 font-semibold">supposé :</span> {hyp.text}
										<span class="text-muted-foreground font-mono">⇒</span> {hyp.consequence}
									</div>
									<button
										type="button"
										class="shrink-0 inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
										onclick={() => {
											editingHypothesisIndex = editingHypothesisIndex === idx ? null : idx;
											editText = hyp.text;
										}}
									>
										<Edit2 class="h-3 w-3" />
										Modifier
									</button>
								</div>
								{#if editingHypothesisIndex === idx}
									<div class="p-2.5 rounded bg-muted/60 border border-primary/30 space-y-2">
										<input
											type="text"
											bind:value={editText}
											class="w-full text-xs font-mono px-2 py-1.5 rounded border border-border bg-background"
										/>
										<div class="flex items-center justify-end gap-2">
											<button
												type="button"
												class="text-[11px] px-2 py-1 rounded border"
												onclick={() => (editingHypothesisIndex = null)}
											>
												Annuler
											</button>
											<button
												type="button"
												class="text-[11px] px-2.5 py-1 rounded bg-primary text-primary-foreground font-semibold"
												onclick={() => {
													deliberationStore.amendHypothesis(deliberationStore.activeSubjectId, idx, editText);
													editingHypothesisIndex = null;
												}}
											>
												Valider le Diff
											</button>
										</div>
									</div>
								{/if}
								{#if hyp.cost_hint}
									<div class="inline-flex items-center gap-1 font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded border border-destructive/20 font-mono text-[11px]">
										<Coins class="h-3 w-3" />
										<span>Chiffrage :</span> {hyp.cost_hint}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>

				<!-- 3. QUESTIONS OUVERTES AUX EXPERTS -->
				<div class="rounded-lg bg-blue-500/5 p-3 border border-blue-500/20 space-y-2">
					<span class="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1">
						<HelpCircle class="h-3 w-3" />
						Questions Ouvertes aux Experts ({draft.manque.length})
					</span>
					<div class="space-y-1.5">
						{#each draft.manque as m}
							<div class="bg-card rounded p-2.5 border border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
								<div>
									<span class="font-mono font-bold text-blue-600 dark:text-blue-400">[{m.id}]</span>
									<span class="font-medium text-foreground ml-1">{m.question}</span>
									<span class="text-muted-foreground block mt-0.5 text-[11px]">
										Destinataire : <strong class="text-foreground">{m.assigned_role}</strong>
									</span>
								</div>
								<button
									type="button"
									class="shrink-0 inline-flex items-center gap-1 border border-border bg-muted/60 hover:bg-muted text-foreground text-xs font-medium px-2 py-1 rounded transition-colors self-end sm:self-auto"
									onclick={() => deliberationStore.sendRelance(deliberationStore.activeSubjectId, m.id)}
								>
									<Send class="h-3 w-3" />
									Relancer
								</button>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

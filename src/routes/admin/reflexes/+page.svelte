<script lang="ts">
	import {
		REFLEX_DOMAINS,
		type AgentBlindspotCandidate,
		type CanonicalFactValue,
		type FactVocabularyItem,
		type ReflexOverlapWarning,
		type ReflexProjectMetrics,
		type ReflexRuleRecord,
		type ReflexRuleStatus,
		type ReflexSimulationMatch
	} from '$lib/domain/reflexStudio';
	import type { RuleCondition } from '$lib/domain/projectRules';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import GitFork from 'lucide-svelte/icons/git-fork';
	import Plus from 'lucide-svelte/icons/plus';
	import Play from 'lucide-svelte/icons/play';
	import Sparkles from 'lucide-svelte/icons/sparkles';
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import XCircle from 'lucide-svelte/icons/x-circle';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Edit from 'lucide-svelte/icons/edit';
	import Save from 'lucide-svelte/icons/save';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import ShieldAlert from 'lucide-svelte/icons/shield-alert';

	let { data } = $props();

	let rules = $state<ReflexRuleRecord[]>(data.rules || []);
	let vocabulary = $state<FactVocabularyItem[]>(data.vocabulary || []);
	let metrics = $state<Record<string, ReflexProjectMetrics>>(data.metrics || {});
	let overlaps = $state<ReflexOverlapWarning[]>(data.overlaps || []);
	let blindspotCandidates = $state<AgentBlindspotCandidate[]>(data.blindspotCandidates || []);

	type StudioTab = 'catalog' | 'sandbox' | 'vocabulary' | 'signals';
	let activeTab = $state<StudioTab>('catalog');
	let statusFilter = $state<'all' | ReflexRuleStatus>('all');
	let domainFilter = $state<string>('all');

	let feedbackMsg = $state<{ type: 'ok' | 'err'; text: string } | null>(null);
	let isBusy = $state(false);

	// ── Éditeur No-Code (« Si on décide X → Penser à Y ») ────────────────────
	let showEditor = $state(false);
	let editingRuleId = $state<string | null>(null);
	let formId = $state('');
	let formTitle = $state('');
	let formDomain = $state('resilience');
	let formAssetRef = $state('');
	let formAssetType = $state<'pattern' | 'principle' | 'control' | 'standard'>('pattern');
	let formMandatory = $state(false);
	let formStatus = $state<ReflexRuleStatus>('draft');
	let formConditions = $state<RuleCondition[]>([{ key: 'resilience_mode', op: 'eq', value: 'actif/actif' }]);
	let formSemanticHintsText = $state('');
	let formSubjectName = $state('');
	let formQuestion = $state('');
	let formRationale = $state('');
	let formInitialLevel = $state<'L0_named' | 'L1_framed'>('L1_framed');
	let formSuggestedRole = $state('lead_architect');
	let formSource = $state<'catalog' | 'promoted_agent' | 'admin_authored'>('admin_authored');

	// ── Bac à sable & Replay ────────────────────────────────────────────────
	let sandboxText = $state(
		'Nous retenons une topologie sur 2 datacenters en mode active-active avec une exigence SecNumCloud pour les données critiques.'
	);
	let sandboxRuleId = $state<string>('');
	let isSimulating = $state(false);
	let simResult = $state<{
		extractedFacts: Array<{ key: string; rawValue?: string; canonicalValue: string; matchedAlias?: string }>;
		matches: ReflexSimulationMatch[];
		replaySummary?: {
			totalDecisions: number;
			deterministicHits: number;
			semanticSuggestions: number;
			samples: Array<{ sectionRef: string; domain: string; matchKind: string; factsCount: number }>;
		};
	} | null>(null);

	// ── Éditeur Vocabulaire & Synonymes ─────────────────────────────────────
	let selectedVocabKey = $state<string>(data.vocabulary?.[0]?.key || 'resilience_mode');
	let newCanonicalCode = $state('');
	let newCanonicalLabel = $state('');
	let newCanonicalAliases = $state('');

	const filteredRules = $derived(
		rules.filter(
			(r) =>
				(statusFilter === 'all' || r.status === statusFilter) &&
				(domainFilter === 'all' || r.domain === domainFilter)
		)
	);

	const selectedVocabEntry = $derived(
		vocabulary.find((v) => v.key === selectedVocabKey) || null
	);

	const disabledRulesList = $derived(
		rules
			.map((r) => ({ rule: r, m: metrics[r.id] }))
			.filter((x) => x.m && x.m.disabledCount > 0)
			.sort((a, b) => (b.m?.disabledCount || 0) - (a.m?.disabledCount || 0))
	);

	function getVocabEntry(key: string): FactVocabularyItem | undefined {
		return vocabulary.find((v) => v.key === key);
	}

	function formatConditionHuman(c: RuleCondition): string {
		const entry = getVocabEntry(c.key);
		const keyLabel = entry?.label || c.key;
		const cv = entry?.canonicalValues.find((v) => v.canonical === String(c.value));
		const valLabel = cv?.label || String(c.value);
		const opLabel =
			c.op === 'eq' ? 'est' : c.op === 'neq' ? 'n’est pas' : c.op === 'gte' ? '≥' : c.op === 'lte' ? '≤' : 'parmi';
		return `${keyLabel} ${opLabel} « ${valLabel} »`;
	}

	async function refreshStudio() {
		const res = await fetch('/api/admin/reflexes');
		if (res.ok) {
			const fresh = await res.json();
			rules = fresh.rules || [];
			vocabulary = fresh.vocabulary || [];
			metrics = fresh.metrics || {};
			overlaps = fresh.overlaps || [];
			blindspotCandidates = fresh.blindspotCandidates || [];
		}
	}

	function openCreateEditor(preset?: Partial<ReflexRuleRecord>) {
		editingRuleId = null;
		formId = preset?.id || '';
		formTitle = preset?.title || '';
		formDomain = preset?.domain || 'resilience';
		formAssetRef = preset?.assetRef || '';
		formAssetType = preset?.assetType || 'pattern';
		formMandatory = preset?.mandatory ?? false;
		formStatus = preset?.status || 'draft';
		formConditions = preset?.conditions?.length
			? preset.conditions.map((c) => ({ ...c }))
			: [{ key: vocabulary[0]?.key || 'resilience_mode', op: 'eq', value: vocabulary[0]?.canonicalValues[0]?.canonical || '' }];
		formSemanticHintsText = (preset?.semanticHints || []).join(', ');
		formSubjectName = preset?.action?.subjectName || '';
		formQuestion = preset?.action?.question || '';
		formRationale = preset?.action?.rationale || '';
		formInitialLevel = preset?.action?.initialLevel || 'L1_framed';
		formSuggestedRole = preset?.action?.suggestedRole || 'lead_architect';
		formSource = preset?.source || 'admin_authored';
		showEditor = true;
		activeTab = 'catalog';
		feedbackMsg = null;
	}

	function openEditEditor(rule: ReflexRuleRecord) {
		editingRuleId = rule.id;
		formId = rule.id;
		formTitle = rule.title;
		formDomain = rule.domain;
		formAssetRef = rule.assetRef;
		formAssetType = rule.assetType;
		formMandatory = rule.mandatory;
		formStatus = rule.status;
		formConditions = rule.conditions.map((c) => ({ ...c }));
		formSemanticHintsText = (rule.semanticHints || []).join(', ');
		formSubjectName = rule.action.subjectName;
		formQuestion = rule.action.question;
		formRationale = rule.action.rationale || '';
		formInitialLevel = rule.action.initialLevel || 'L1_framed';
		formSuggestedRole = rule.action.suggestedRole || 'lead_architect';
		formSource = rule.source;
		showEditor = true;
		activeTab = 'catalog';
		feedbackMsg = null;
	}

	function addConditionRow() {
		const firstKey = vocabulary[0]?.key || 'site_count';
		const firstVal = vocabulary[0]?.canonicalValues[0]?.canonical || '';
		formConditions = [...formConditions, { key: firstKey, op: 'eq', value: firstVal }];
	}

	function removeConditionRow(idx: number) {
		if (formConditions.length > 1) {
			formConditions = formConditions.filter((_, i) => i !== idx);
		}
	}

	function onConditionKeyChange(idx: number, newKey: string) {
		const entry = getVocabEntry(newKey);
		const defaultVal = entry?.canonicalValues[0]?.canonical || '';
		formConditions = formConditions.map((c, i) =>
			i === idx ? { ...c, key: newKey, value: defaultVal } : c
		);
	}

	async function saveRule() {
		isBusy = true;
		feedbackMsg = null;
		const hints = formSemanticHintsText
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);

		const payload = {
			...(editingRuleId ? {} : formId.trim() ? { id: formId.trim() } : {}),
			title: formTitle,
			domain: formDomain,
			assetRef: formAssetRef || formId || undefined,
			assetType: formAssetType,
			mandatory: formMandatory,
			status: formStatus,
			conditions: formConditions,
			semanticHints: hints,
			source: formSource,
			action: {
				subjectName: formSubjectName,
				question: formQuestion,
				rationale: formRationale || formTitle,
				initialLevel: formInitialLevel,
				suggestedRole: formSuggestedRole,
				mandatory: formMandatory
			}
		};

		try {
			const url = editingRuleId
				? `/api/admin/reflexes/${encodeURIComponent(editingRuleId)}`
				: '/api/admin/reflexes';
			const res = await fetch(url, {
				method: editingRuleId ? 'PATCH' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Échec de sauvegarde');

			await refreshStudio();
			showEditor = false;
			feedbackMsg = {
				type: 'ok',
				text: editingRuleId
					? `Réflexe ${data.rule.id} mis à jour (v${data.rule.version}).`
					: `Réflexe ${data.rule.id} créé.`
			};
		} catch (err: any) {
			feedbackMsg = { type: 'err', text: err.message };
		} finally {
			isBusy = false;
		}
	}

	async function setRuleStatus(rule: ReflexRuleRecord, nextStatus: ReflexRuleStatus) {
		isBusy = true;
		feedbackMsg = null;
		try {
			const res = await fetch(`/api/admin/reflexes/${encodeURIComponent(rule.id)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: nextStatus })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Erreur de transition');
			await refreshStudio();
			feedbackMsg = {
				type: 'ok',
				text: `Réflexe ${rule.id} passé au statut « ${nextStatus} ».`
			};
		} catch (err: any) {
			feedbackMsg = { type: 'err', text: err.message };
		} finally {
			isBusy = false;
		}
	}

	async function removeRule(rule: ReflexRuleRecord) {
		if (!confirm(`Supprimer le réflexe ${rule.id} (${rule.title}) ?`)) return;
		isBusy = true;
		try {
			const res = await fetch(`/api/admin/reflexes/${encodeURIComponent(rule.id)}`, {
				method: 'DELETE'
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error || 'Erreur de suppression');
			}
			await refreshStudio();
			feedbackMsg = { type: 'ok', text: `Réflexe ${rule.id} supprimé.` };
		} catch (err: any) {
			feedbackMsg = { type: 'err', text: err.message };
		} finally {
			isBusy = false;
		}
	}

	async function runSimulation(targetRuleId?: string) {
		isSimulating = true;
		feedbackMsg = null;
		try {
			const res = await fetch('/api/admin/reflexes/simulate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					text: sandboxText,
					ruleId: targetRuleId || sandboxRuleId || undefined,
					includeHistoricalReplay: true
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Erreur de simulation');
			simResult = {
				extractedFacts: data.extractedFacts || [],
				matches: data.matches || [],
				replaySummary: data.replaySummary
			};
		} catch (err: any) {
			feedbackMsg = { type: 'err', text: err.message };
		} finally {
			isSimulating = false;
		}
	}

	async function saveCanonicalValue() {
		if (!selectedVocabEntry || !newCanonicalCode.trim()) return;
		isBusy = true;
		feedbackMsg = null;
		try {
			const nextValues: CanonicalFactValue[] = [
				...selectedVocabEntry.canonicalValues,
				{
					canonical: newCanonicalCode.trim().toLowerCase(),
					label: newCanonicalLabel.trim() || newCanonicalCode.trim(),
					aliases: newCanonicalAliases
						.split(',')
						.map((a) => a.trim())
						.filter(Boolean)
				}
			];
			const res = await fetch('/api/admin/reflexes/vocabulary', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...selectedVocabEntry,
					canonicalValues: nextValues
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Erreur sauvegarde vocabulaire');
			await refreshStudio();
			newCanonicalCode = '';
			newCanonicalLabel = '';
			newCanonicalAliases = '';
			feedbackMsg = { type: 'ok', text: `Valeur canonique ajoutée à « ${selectedVocabEntry.key} ».` };
		} catch (err: any) {
			feedbackMsg = { type: 'err', text: err.message };
		} finally {
			isBusy = false;
		}
	}

	async function updateAliasesForValue(canon: string, aliasesText: string) {
		if (!selectedVocabEntry) return;
		isBusy = true;
		try {
			const nextValues = selectedVocabEntry.canonicalValues.map((cv) =>
				cv.canonical === canon
					? {
							...cv,
							aliases: aliasesText
								.split(',')
								.map((a) => a.trim())
								.filter(Boolean)
						}
					: cv
			);
			const res = await fetch('/api/admin/reflexes/vocabulary', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...selectedVocabEntry,
					canonicalValues: nextValues
				})
			});
			if (!res.ok) throw new Error('Erreur mise à jour des alias');
			await refreshStudio();
			feedbackMsg = { type: 'ok', text: `Alias mis à jour pour « ${canon} ».` };
		} catch (err: any) {
			feedbackMsg = { type: 'err', text: err.message };
		} finally {
			isBusy = false;
		}
	}

	function promoteBlindspot(cand: AgentBlindspotCandidate) {
		const presetConditions: RuleCondition[] =
			cand.sampleFacts.length > 0
				? cand.sampleFacts.slice(0, 2).map((f) => ({ key: f.key, op: 'eq', value: f.value }))
				: [{ key: 'topology', op: 'eq', value: 'baremetal' }];

		openCreateEditor({
			title: `Réflexe : ${cand.subjectName}`,
			domain: 'general',
			assetType: 'pattern',
			mandatory: false,
			status: 'draft',
			source: 'promoted_agent',
			conditions: presetConditions,
			semanticHints: cand.subjectName.toLowerCase().split(/\s+/).filter((w) => w.length >= 4),
			action: {
				subjectName: cand.subjectName,
				question: cand.questionText,
				rationale: cand.grounds,
				initialLevel: 'L1_framed',
				suggestedRole: 'lead_architect',
				mandatory: false
			}
		});
	}

	function statusBadgeStyle(status: ReflexRuleStatus): string {
		switch (status) {
			case 'published':
				return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
			case 'draft':
				return 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30';
			case 'deprecated':
				return 'bg-muted text-muted-foreground border-border';
		}
	}
</script>

<svelte:head>
	<title>Studio Admin des Réflexes d'Architecture — Archinex</title>
</svelte:head>

<div class="flex-1 space-y-6 p-4 md:p-8 pt-6" data-testid="admin-reflexes-studio">
	<!-- En-tête réservé Admin -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div class="flex items-center gap-3">
			<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
				<GitFork class="h-5 w-5" />
			</div>
			<div>
				<div class="flex items-center gap-2">
					<h1 class="text-2xl font-bold tracking-tight">Studio Admin · Réflexes d'Architecture</h1>
					<span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
						Back-office Admin
					</span>
				</div>
				<p class="text-sm text-muted-foreground">
					Gouvernez les « bons réflexes » de cascade, leur vocabulaire canonique à synonymes, et testez leur déclenchement avant publication.
				</p>
			</div>
		</div>

		<Button onclick={() => openCreateEditor()} class="gap-1.5" data-testid="btn-new-reflex">
			<Plus class="h-4 w-4" />
			<span>Nouveau réflexe</span>
		</Button>
	</div>

	{#if feedbackMsg}
		<div
			class="rounded-lg border p-3 text-xs flex items-center gap-2 {feedbackMsg.type === 'ok'
				? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
				: 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-200'}"
		>
			{#if feedbackMsg.type === 'ok'}
				<CheckCircle2 class="h-4 w-4 shrink-0" />
			{:else}
				<XCircle class="h-4 w-4 shrink-0" />
			{/if}
			<span>{feedbackMsg.text}</span>
		</div>
	{/if}

	<!-- Barre d'onglets du Studio -->
	<div class="flex items-center gap-1.5 border-b pb-2 overflow-x-auto">
		<button
			type="button"
			onclick={() => (activeTab = 'catalog')}
			class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer {activeTab === 'catalog'
				? 'bg-primary text-primary-foreground'
				: 'text-muted-foreground hover:bg-muted'}"
		>
			1. Catalogue & Éditeur ({rules.length})
		</button>
		<button
			type="button"
			data-testid="tab-reflex-sandbox"
			onclick={() => (activeTab = 'sandbox')}
			class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer {activeTab === 'sandbox'
				? 'bg-primary text-primary-foreground'
				: 'text-muted-foreground hover:bg-muted'}"
		>
			2. Bac à sable & Replay
		</button>
		<button
			type="button"
			data-testid="tab-reflex-vocab"
			onclick={() => (activeTab = 'vocabulary')}
			class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer {activeTab === 'vocabulary'
				? 'bg-primary text-primary-foreground'
				: 'text-muted-foreground hover:bg-muted'}"
		>
			3. Vocabulaire & Synonymes ({vocabulary.length})
		</button>
		<button
			type="button"
			data-testid="tab-reflex-signals"
			onclick={() => (activeTab = 'signals')}
			class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer {activeTab === 'signals'
				? 'bg-primary text-primary-foreground'
				: 'text-muted-foreground hover:bg-muted'}"
		>
			4. Signaux Terrain & Angles morts ({blindspotCandidates.length})
		</button>
	</div>

	<!-- ═══════════════════════════════════════════════════════════════════════ -->
	<!-- ONGLET 1 : CATALOGUE & ÉDITEUR NO-CODE                                 -->
	<!-- ═══════════════════════════════════════════════════════════════════════ -->
	{#if activeTab === 'catalog'}
		{#if overlaps.length > 0}
			<div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-1.5">
				<div class="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
					<AlertTriangle class="h-4 w-4" />
					<span>Recouvrements détectés dans le catalogue ({overlaps.length})</span>
				</div>
				{#each overlaps as ov}
					<p class="text-xs text-muted-foreground pl-6">
						<strong class="font-mono text-foreground">{ov.ruleAId}</strong> ↔
						<strong class="font-mono text-foreground">{ov.ruleBId}</strong> : {ov.reason}
					</p>
				{/each}
			</div>
		{/if}

		<!-- Éditeur structuré « Si on décide X → Penser à Y » -->
		{#if showEditor}
			<Card.Root class="border-primary/40 shadow-sm" data-testid="reflex-nocode-editor">
				<Card.Header class="pb-3">
					<Card.Title class="text-base flex items-center justify-between">
						<span>{editingRuleId ? `Modifier le réflexe ${editingRuleId}` : 'Créer un réflexe d’architecture'}</span>
						<button
							type="button"
							onclick={() => (showEditor = false)}
							class="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
						>
							Fermer ✕
						</button>
					</Card.Title>
					<Card.Description class="text-xs">
						Formulez la règle en français métier : « Quand une décision satisfait ces faits → Penser à ouvrir ce sous-sujet ».
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-4 text-xs">
					<div class="grid grid-cols-1 md:grid-cols-4 gap-3">
						<div class="space-y-1">
							<label for="rfx-id" class="font-semibold">Code (optionnel)</label>
							<input
								id="rfx-id"
								type="text"
								bind:value={formId}
								disabled={Boolean(editingRuleId)}
								placeholder="ex: FINOPS-GPU-01"
								class="w-full px-2.5 py-1.5 rounded-md border bg-background font-mono disabled:opacity-60"
							/>
						</div>
						<div class="space-y-1 md:col-span-2">
							<label for="rfx-title" class="font-semibold">Intitulé du réflexe *</label>
							<input
								id="rfx-title"
								type="text"
								bind:value={formTitle}
								placeholder="ex: Dimensionnement réseau et latence inter-sites"
								class="w-full px-2.5 py-1.5 rounded-md border bg-background"
							/>
						</div>
						<div class="space-y-1">
							<label for="rfx-domain" class="font-semibold">Domaine</label>
							<select id="rfx-domain" bind:value={formDomain} class="w-full px-2.5 py-1.5 rounded-md border bg-background">
								{#each REFLEX_DOMAINS as dom}
									<option value={dom.id}>{dom.label}</option>
								{/each}
							</select>
						</div>
					</div>

					<!-- Conditions guidées sur le vocabulaire canonique -->
					<div class="rounded-lg border bg-muted/30 p-3 space-y-2">
						<div class="flex items-center justify-between">
							<span class="font-bold text-foreground">1. Quand une décision acte les faits suivants (ET) :</span>
							<button type="button" onclick={addConditionRow} class="text-primary font-semibold hover:underline cursor-pointer">
								+ Ajouter une clause
							</button>
						</div>

						{#each formConditions as cond, idx}
							{@const entry = getVocabEntry(cond.key)}
							<div class="flex items-center gap-2 flex-wrap">
								<select
									value={cond.key}
									onchange={(e) => onConditionKeyChange(idx, (e.target as HTMLSelectElement).value)}
									class="px-2 py-1.5 rounded-md border bg-background font-medium"
								>
									{#each vocabulary as v}
										<option value={v.key}>{v.label} ({v.key})</option>
									{/each}
								</select>

								<select bind:value={cond.op} class="px-2 py-1.5 rounded-md border bg-background font-mono">
									<option value="eq">est (=)</option>
									<option value="neq">n’est pas (≠)</option>
									<option value="gte">≥</option>
									<option value="lte">≤</option>
									<option value="in">parmi (liste)</option>
								</select>

								{#if entry && entry.canonicalValues.length > 0 && cond.op !== 'in'}
									<select bind:value={cond.value} class="flex-1 min-w-[180px] px-2 py-1.5 rounded-md border bg-background">
										{#each entry.canonicalValues as cv}
											<option value={cv.canonical}>{cv.label} ({cv.canonical})</option>
										{/each}
									</select>
								{:else}
									<input
										type="text"
										bind:value={cond.value}
										placeholder="valeur attendue"
										class="flex-1 min-w-[180px] px-2 py-1.5 rounded-md border bg-background font-mono"
									/>
								{/if}

								{#if formConditions.length > 1}
									<button type="button" onclick={() => removeConditionRow(idx)} class="p-1 text-rose-500 hover:text-rose-700 cursor-pointer">
										<Trash2 class="h-3.5 w-3.5" />
									</button>
								{/if}
							</div>
						{/each}

						<div class="pt-1 space-y-1">
							<label for="rfx-hints" class="font-medium text-muted-foreground">
								Filet sémantique (mots-clés/concepts séparés par virgule si le fait exact n’a pas été extrait) :
							</label>
							<input
								id="rfx-hints"
								type="text"
								bind:value={formSemanticHintsText}
								placeholder="ex: latence, rtt, inter-datacenter, fibre noire"
								class="w-full px-2.5 py-1.5 rounded-md border bg-background"
							/>
						</div>
					</div>

					<!-- Action réflexe -->
					<div class="rounded-lg border bg-muted/30 p-3 space-y-3">
						<span class="font-bold text-foreground block">2. Penser à ouvrir le sous-sujet / la question :</span>
						<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
							<div class="space-y-1">
								<label for="rfx-subj" class="font-semibold">Titre du sous-sujet *</label>
								<input
									id="rfx-subj"
									type="text"
									bind:value={formSubjectName}
									placeholder="ex: Budget Latence & Liaisons"
									class="w-full px-2.5 py-1.5 rounded-md border bg-background"
								/>
							</div>
							<div class="space-y-1">
								<label for="rfx-role" class="font-semibold">Rôle destinataire</label>
								<select id="rfx-role" bind:value={formSuggestedRole} class="w-full px-2.5 py-1.5 rounded-md border bg-background">
									<option value="lead_architect">lead_architect</option>
									<option value="security_officer">security_officer</option>
									<option value="compliance_officer">compliance_officer</option>
									<option value="infra_expert_architect">infra_expert_architect</option>
								</select>
							</div>
							<div class="space-y-1">
								<label for="rfx-type" class="font-semibold">Nature & Statut</label>
								<div class="flex gap-2">
									<select bind:value={formAssetType} class="flex-1 px-2 py-1.5 rounded-md border bg-background">
										<option value="pattern">Pattern (Doctrine)</option>
										<option value="control">Contrôle</option>
										<option value="principle">Principe</option>
										<option value="standard">Standard</option>
									</select>
									<select bind:value={formStatus} class="flex-1 px-2 py-1.5 rounded-md border bg-background">
										<option value="draft">Brouillon</option>
										<option value="published">Publiée</option>
										<option value="deprecated">Dépréciée</option>
									</select>
								</div>
							</div>
						</div>

						<div class="space-y-1">
							<label for="rfx-q" class="font-semibold">Question d’architecture à poser *</label>
							<input
								id="rfx-q"
								type="text"
								bind:value={formQuestion}
								placeholder="ex: Quelle latence RTT maximale est acceptable pour la réplication synchrone ?"
								class="w-full px-2.5 py-1.5 rounded-md border bg-background"
							/>
						</div>

						<div class="flex items-center justify-between flex-wrap gap-3">
							<label class="inline-flex items-center gap-2 cursor-pointer">
								<input type="checkbox" bind:checked={formMandatory} class="rounded border" />
								<span>Réflexe obligatoire (exige une justification écrite si clôturé sur un projet)</span>
							</label>

							<div class="flex items-center gap-2">
								<Button variant="outline" size="sm" onclick={() => (showEditor = false)}>Annuler</Button>
								<Button size="sm" onclick={saveRule} disabled={isBusy || !formTitle || !formSubjectName || !formQuestion} class="gap-1.5">
									<Save class="h-3.5 w-3.5" />
									<span>{editingRuleId ? 'Enregistrer nouvelle révision' : 'Créer le réflexe'}</span>
								</Button>
							</div>
						</div>
					</div>
				</Card.Content>
			</Card.Root>
		{/if}

		<!-- Filtres catalogue -->
		<div class="flex items-center justify-between gap-3 flex-wrap">
			<div class="flex items-center gap-1.5 flex-wrap text-xs">
				{#each [['all', 'Tous'], ['published', 'Publiés'], ['draft', 'Brouillons'], ['deprecated', 'Dépréciés']] as [val, lbl]}
					<button
						type="button"
						onclick={() => (statusFilter = val as any)}
						class="px-2.5 py-1 rounded-md border font-medium cursor-pointer transition-colors {statusFilter === val
							? 'bg-primary text-primary-foreground border-primary'
							: 'bg-background text-muted-foreground hover:text-foreground'}"
					>
						{lbl}
					</button>
				{/each}
			</div>

			<select bind:value={domainFilter} class="px-2.5 py-1 rounded-md border bg-background text-xs">
				<option value="all">Tous les domaines</option>
				{#each REFLEX_DOMAINS as dom}
					<option value={dom.id}>{dom.label}</option>
				{/each}
			</select>
		</div>

		<!-- Liste des réflexes -->
		<div class="grid grid-cols-1 gap-3">
			{#each filteredRules as rule (rule.id)}
				{@const m = metrics[rule.id]}
				<div class="rounded-xl border bg-card p-4 space-y-2.5" data-testid="admin-reflex-card-{rule.id}">
					<div class="flex items-start justify-between gap-3 flex-wrap">
						<div class="space-y-1">
							<div class="flex items-center gap-2 flex-wrap">
								<span class="font-mono text-xs font-bold text-primary">{rule.id}</span>
								<span class="text-sm font-bold text-foreground">{rule.title}</span>
								<span class="px-1.5 py-0.5 rounded font-mono text-[10px] border bg-muted">v{rule.version}</span>
								<span class="px-2 py-0.5 rounded text-[10px] font-semibold border {statusBadgeStyle(rule.status)}">
									{rule.status === 'published' ? 'Publiée' : rule.status === 'draft' ? 'Brouillon' : 'Dépréciée'}
								</span>
								{#if rule.mandatory}
									<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30">
										Obligatoire
									</span>
								{/if}
								{#if m && m.disabledCount > 0}
									<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
										Désactivée sur {m.disabledCount} projet(s)
									</span>
								{/if}
							</div>

							<div class="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
								<span class="font-semibold text-foreground">Quand</span>
								{#each rule.conditions as cond, idx}
									{#if idx > 0}<span>ET</span>{/if}
									<span class="px-1.5 py-0.5 rounded bg-muted/70 border text-foreground">
										{formatConditionHuman(cond)}
									</span>
								{/each}
								<ArrowRight class="h-3.5 w-3.5 text-primary" />
								<span class="font-semibold text-foreground">Penser à : {rule.action.subjectName}</span>
							</div>

							<p class="text-xs text-muted-foreground italic">« {rule.action.question} »</p>

							{#if rule.semanticHints.length > 0}
								<div class="flex items-center gap-1 flex-wrap text-[10px] text-muted-foreground">
									<span>Filet sémantique :</span>
									{#each rule.semanticHints as h}
										<span class="px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
											{h}
										</span>
									{/each}
								</div>
							{/if}
						</div>

						<div class="flex items-center gap-1.5 shrink-0">
							<Button variant="outline" size="sm" onclick={() => openEditEditor(rule)} class="gap-1 text-xs">
								<Edit class="h-3.5 w-3.5" />
								<span>Éditer</span>
							</Button>
							{#if rule.status !== 'published'}
								<Button size="sm" onclick={() => setRuleStatus(rule, 'published')} class="text-xs">
									Publier
								</Button>
							{:else}
								<Button variant="outline" size="sm" onclick={() => setRuleStatus(rule, 'deprecated')} class="text-xs">
									Déprécier
								</Button>
							{/if}
							<Button
								variant="outline"
								size="sm"
								onclick={() => {
									sandboxRuleId = rule.id;
									activeTab = 'sandbox';
									void runSimulation(rule.id);
								}}
								class="gap-1 text-xs"
							>
								<Play class="h-3 w-3" />
								<span>Tester</span>
							</Button>
							{#if rule.source !== 'catalog'}
								<Button variant="outline" size="sm" onclick={() => removeRule(rule)} class="text-rose-600">
									<Trash2 class="h-3.5 w-3.5" />
								</Button>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- ═══════════════════════════════════════════════════════════════════════ -->
	<!-- ONGLET 2 : BAC À SABLE & REPLAY HISTORIQUE                              -->
	<!-- ═══════════════════════════════════════════════════════════════════════ -->
	{#if activeTab === 'sandbox'}
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-sm">Simulation sur décision en texte libre</Card.Title>
					<Card.Description class="text-xs">
						Testez la normalisation par synonymes et le filet sémantique sans affecter aucun projet.
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-3 text-xs">
					<textarea
						rows="4"
						bind:value={sandboxText}
						class="w-full p-2.5 rounded-lg border bg-background text-xs"
						placeholder="Collez un extrait de motivation d'arbitrage..."
					></textarea>

					<div class="flex items-center justify-between gap-2 flex-wrap">
						<select bind:value={sandboxRuleId} class="px-2.5 py-1.5 rounded-md border bg-background text-xs">
							<option value="">Replay sur le premier réflexe actif</option>
							{#each rules as r}
								<option value={r.id}>Replay historique : {r.id} ({r.title})</option>
							{/each}
						</select>

						<Button onclick={() => runSimulation()} disabled={isSimulating} class="gap-1.5">
							<Play class="h-3.5 w-3.5" />
							<span>{isSimulating ? 'Simulation...' : 'Simuler & Rejouer'}</span>
						</Button>
					</div>

					{#if simResult}
						<div class="pt-3 border-t space-y-2">
							<div class="font-bold text-foreground">Faits extraits & normalisés ({simResult.extractedFacts.length}) :</div>
							{#if simResult.extractedFacts.length > 0}
								<div class="flex flex-wrap gap-1.5">
									{#each simResult.extractedFacts as ef}
										<span class="px-2 py-0.5 rounded-md border bg-emerald-500/10 border-emerald-500/30 font-mono text-[11px]">
											{ef.key} = {ef.canonicalValue}
											{#if ef.matchedAlias && ef.matchedAlias !== ef.canonicalValue}
												<span class="opacity-70"> (alias « {ef.matchedAlias} »)</span>
											{/if}
										</span>
									{/each}
								</div>
							{:else}
								<p class="text-muted-foreground italic">Aucun fait canonique détecté — le filet sémantique prend le relais ci-contre.</p>
							{/if}
						</div>

						{#if simResult.replaySummary}
							<div class="pt-3 border-t space-y-1.5">
								<div class="font-bold text-foreground">
									Replay historique ({simResult.replaySummary.totalDecisions} décision(s) analysée(s)) :
								</div>
								<div class="text-muted-foreground">
									Déclenchements déterministes : <strong class="text-emerald-700 dark:text-emerald-300">{simResult.replaySummary.deterministicHits}</strong>
									· Suggestions sémantiques : <strong class="text-indigo-700 dark:text-indigo-300">{simResult.replaySummary.semanticSuggestions}</strong>
								</div>
							</div>
						{/if}
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-sm">Résultat d’évaluation sur le catalogue</Card.Title>
					<Card.Description class="text-xs">
						Distingue les déclenchements exacts des suggestions sémantiques de rattrapage.
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-2 text-xs">
					{#if !simResult}
						<p class="text-muted-foreground italic">Lancez une simulation pour inspecter le comportement de chaque réflexe.</p>
					{:else}
						{#each simResult.matches as m (m.ruleId)}
							<div class="p-2.5 rounded-lg border space-y-1 {m.matchKind === 'deterministic' ? 'border-emerald-500/40 bg-emerald-500/5' : m.matchKind === 'semantic_suggestion' ? 'border-indigo-500/40 bg-indigo-500/5' : 'opacity-70'}">
								<div class="flex items-center justify-between gap-2">
									<span class="font-bold text-foreground">
										<span class="font-mono">{m.ruleId}</span> · {m.title}
									</span>
									{#if m.matchKind === 'deterministic'}
										<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
											✓ Déclenché
										</span>
									{:else if m.matchKind === 'semantic_suggestion'}
										<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
											✨ Filet sémantique ({Math.round(m.semanticScore * 100)}%)
										</span>
									{:else}
										<span class="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">Non déclenché</span>
									{/if}
								</div>
								<div class="text-[11px] font-mono text-muted-foreground">
									{#each m.conditionDetails as cd}
										<div>{cd}</div>
									{/each}
								</div>
							</div>
						{/each}
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	{/if}

	<!-- ═══════════════════════════════════════════════════════════════════════ -->
	<!-- ONGLET 3 : VOCABULAIRE CANONIQUE & SYNONYMES                            -->
	<!-- ═══════════════════════════════════════════════════════════════════════ -->
	{#if activeTab === 'vocabulary'}
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
			<div class="space-y-1.5 rounded-xl border bg-card p-3">
				<div class="text-xs font-bold pb-1 border-b">Clés de faits ({vocabulary.length})</div>
				{#each vocabulary as v (v.key)}
					<button
						type="button"
						onclick={() => (selectedVocabKey = v.key)}
						class="w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer {selectedVocabKey === v.key
							? 'bg-primary text-primary-foreground font-semibold'
							: 'hover:bg-muted'}"
					>
						<div>{v.label}</div>
						<div class="font-mono text-[10px] opacity-75">{v.key} · {v.valueType}</div>
					</button>
				{/each}
			</div>

			<div class="lg:col-span-2 rounded-xl border bg-card p-4 space-y-4 text-xs">
				{#if selectedVocabEntry}
					<div>
						<h3 class="text-sm font-bold">{selectedVocabEntry.label} (<code class="font-mono">{selectedVocabEntry.key}</code>)</h3>
						<p class="text-muted-foreground">{selectedVocabEntry.description}</p>
					</div>

					<div class="space-y-2.5">
						{#each selectedVocabEntry.canonicalValues as cv (cv.canonical)}
							<div class="p-3 rounded-lg border bg-muted/20 space-y-1.5">
								<div class="flex items-center justify-between">
									<span class="font-semibold">{cv.label}</span>
									<code class="px-1.5 py-0.5 rounded bg-background border font-mono text-[11px]">{cv.canonical}</code>
								</div>
								<div class="flex items-center gap-2">
									<input
										type="text"
										value={cv.aliases.join(', ')}
										onchange={(e) => updateAliasesForValue(cv.canonical, (e.target as HTMLInputElement).value)}
										placeholder="Synonymes / alias séparés par virgule..."
										class="flex-1 px-2 py-1 rounded border bg-background text-xs"
									/>
								</div>
							</div>
						{/each}
					</div>

					<div class="pt-3 border-t space-y-2">
						<div class="font-bold">Ajouter une valeur canonique et ses alias</div>
						<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
							<input type="text" bind:value={newCanonicalCode} placeholder="code canonique (ex: active_active)" class="px-2 py-1.5 rounded border bg-background font-mono" />
							<input type="text" bind:value={newCanonicalLabel} placeholder="Libellé affiché" class="px-2 py-1.5 rounded border bg-background" />
							<input type="text" bind:value={newCanonicalAliases} placeholder="alias1, alias2..." class="px-2 py-1.5 rounded border bg-background" />
						</div>
						<Button size="sm" onclick={saveCanonicalValue} disabled={isBusy || !newCanonicalCode.trim()}>
							Ajouter au dictionnaire
						</Button>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- ═══════════════════════════════════════════════════════════════════════ -->
	<!-- ONGLET 4 : SIGNAUX TERRAIN & PROMOTION DES ANGLES MORTS                 -->
	<!-- ═══════════════════════════════════════════════════════════════════════ -->
	{#if activeTab === 'signals'}
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-sm flex items-center gap-2">
						<Sparkles class="h-4 w-4 text-purple-500" />
						<span>Angles morts récurrents proposés par l’IA ({blindspotCandidates.length})</span>
					</Card.Title>
					<Card.Description class="text-xs">
						Questions pertinentes détectées par l’agent Proposeur sur les projets et prêtes à être promues en réflexe déterministe.
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-2.5 text-xs">
					{#if blindspotCandidates.length === 0}
						<p class="text-muted-foreground italic">Aucun angle mort candidat en attente pour l’instant.</p>
					{/if}
					{#each blindspotCandidates as cand (cand.fingerprint)}
						<div class="p-3 rounded-lg border bg-muted/20 space-y-1.5">
							<div class="flex items-center justify-between gap-2">
								<span class="font-bold text-foreground">{cand.subjectName}</span>
								<span class="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 font-mono text-[10px]">
									{cand.occurrences} occurrence(s)
								</span>
							</div>
							<p class="text-muted-foreground">{cand.questionText}</p>
							<div class="flex items-center justify-between pt-1">
								<span class="text-[10px] text-muted-foreground italic">{cand.grounds}</span>
								<Button size="sm" variant="outline" onclick={() => promoteBlindspot(cand)} class="text-xs">
									Promouvoir en brouillon →
								</Button>
							</div>
						</div>
					{/each}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-sm flex items-center gap-2">
						<ShieldAlert class="h-4 w-4 text-amber-500" />
						<span>Réflexes les plus désactivés sur les projets</span>
					</Card.Title>
					<Card.Description class="text-xs">
						Identifiez les règles trop strictes ou mal ciblées grâce aux justifications de désactivation des architectes projet.
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-2.5 text-xs">
					{#if disabledRulesList.length === 0}
						<p class="text-muted-foreground italic">Aucune désactivation signalée sur les projets pour le moment.</p>
					{/if}
					{#each disabledRulesList as item (item.rule.id)}
						<div class="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-1.5">
							<div class="flex items-center justify-between">
								<span class="font-bold"><code class="font-mono">{item.rule.id}</code> · {item.rule.title}</span>
								<span class="font-mono text-[11px] font-bold text-amber-700 dark:text-amber-300">
									{item.m.disabledCount} projet(s)
								</span>
							</div>
							{#each item.m.disabledJustifications as justif}
								<p class="text-[11px] text-muted-foreground">• « {justif} »</p>
							{/each}
						</div>
					{/each}
				</Card.Content>
			</Card.Root>
		</div>
	{/if}
</div>

<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import { wrapC4xMarkdown } from '$lib/domain/c4xDsl';
	import {
		DEFAULT_EDITORIAL_DIALS,
		recommendEditorialViews,
		renderCompensatingLayers,
		renderDecisionHeatmap,
		renderPairedPolicyTraces,
		renderRequirementTraceability,
		renderTraceableBlockTree,
		type EditorialDiagramTypeId,
		type EditorialDials,
		type EditorialViewRecommendation,
		type PairedPolicyRuleRow,
		type TraceabilityRowInput
	} from '$lib/domain/editorialSvg';
	import MermaidViewer from './MermaidViewer.svelte';
	import EditorialDiagramViewer from './EditorialDiagramViewer.svelte';
	import { RefreshCw, Download, Copy, Check, Terminal, FileCode, Layers, Cpu, ShieldCheck, Scale, FileSpreadsheet, Boxes, ExternalLink, Sparkles } from 'lucide-svelte';

	type TabType = 'mermaid' | 'editorial' | 'structurizr' | 'sysml' | 'config' | 'compliance' | 'petites-briques';

	let activeTab = $state<TabType>('mermaid');
	let mermaidSubView = $state<'target' | 'sequence' | 'causal'>('target');
	let editorialSubView = $state<EditorialDiagramTypeId>('traceable-blocks');
	let editorialDials = $state<EditorialDials>({ ...DEFAULT_EDITORIAL_DIALS });
	let llmEditorialRecs = $state<EditorialViewRecommendation[] | null>(null);
	let llmCalloutText = $state<string | undefined>(undefined);
	let isAskingEditorialLlm = $state(false);
	let c4SubView = $state<'c4x' | 'structurizr'>('c4x');
	let petitesBriquesSubView = $state<'visual' | 'yaml' | 'json'>('visual');
	let selectedBlockAxisId = $state<string | null>(null);
	let copied = $state(false);
	let isRegenerating = $state(false);
	let lastSyncTime = $state<string>(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
	let complianceMarkdown = $state<string>('');
	let isLoadingCompliance = $state(false);

	const activeSubject = $derived(deliberationStore.activeSubject);
	const projections = $derived(
		activeSubject ? deliberationStore.getProjections(activeSubject.id) : null
	);

	const editorialTraceRows = $derived.by((): TraceabilityRowInput[] => {
		if (!activeSubject || !projections?.projectionBlocks) return [];
		const blockGraph = projections.projectionBlocks;
		const decisionCtx = deliberationStore.decisionContexts[activeSubject.id];
		const retainedOption = decisionCtx?.decision?.retainedOptionId
			? decisionCtx.options.find((o) => o.id === decisionCtx.decision?.retainedOptionId)
			: null;
		const isFrozen = Boolean(deliberationStore.frozenSnapshots[activeSubject.id]);

		return blockGraph.requirements.map((req) => {
			const block = req.targetAxisId
				? blockGraph.blocks.find((b) => b.axisId === req.targetAxisId)
				: null;
			const settledItem = block?.items.find((i) => i.badge.tag === 'Verified' || i.badge.tag === 'Designed');
			return {
				requirementId: req.clauseRef,
				sourceRef: activeSubject.section_ref || 'RFP',
				sourceLabel: activeSubject.name,
				requirementTitle: req.title,
				designElementId: block ? block.safeId.toUpperCase() : retainedOption ? 'DEC-OPT' : null,
				designElementLabel: block ? block.label : retainedOption ? retainedOption.title : null,
				verificationId: settledItem ? settledItem.statement.id : isFrozen ? 'SEAL-L5' : null,
				verificationLabel: settledItem
					? `${settledItem.badge.label} · ${settledItem.componentName}`
					: isFrozen
						? 'Section scellée (L5)'
						: null
			};
		});
	});

	const editorialSignals = $derived.by(() => {
		const blockGraph = projections?.projectionBlocks;
		const decisionCtx = activeSubject ? deliberationStore.decisionContexts[activeSubject.id] : undefined;
		const totalStatements = blockGraph ? blockGraph.blocks.reduce((acc, b) => acc + b.items.length, 0) : 0;
		const unsettledCount = blockGraph ? blockGraph.blocks.reduce((acc, b) => acc + b.unsettledCount, 0) : 0;
		const missingVerificationCount = editorialTraceRows.filter((r) => !r.verificationId).length;
		const acceptedViolations = decisionCtx?.decision?.acceptedViolations;
		return {
			blockCount: blockGraph?.blocks.length ?? 0,
			statementCount: totalStatements,
			unsettledCount,
			requirementCount: blockGraph?.requirements.length ?? 0,
			missingVerificationCount,
			optionCount: decisionCtx?.options?.length ?? activeSubject?.proposal?.options?.length ?? 0,
			criteriaCount: activeSubject?.proposal?.criteria?.length ?? 0,
			hasRetainedDecision: Boolean(decisionCtx?.decision?.retainedOptionId),
			hasAcceptedViolations: Boolean(acceptedViolations && acceptedViolations.length > 0)
		};
	});

	const editorialRecommendations = $derived.by(() => {
		if (llmEditorialRecs && llmEditorialRecs.length > 0) return llmEditorialRecs;
		return recommendEditorialViews(editorialSignals);
	});

	async function askEditorialDirector() {
		const pId = deliberationStore.activeEngagement?.id || deliberationStore.activeEngagementId;
		if (!pId || !activeSubject) return;
		isAskingEditorialLlm = true;
		try {
			const blockGraph = projections?.projectionBlocks;
			const validIds = [
				...(blockGraph?.blocks.map((b) => b.axisId) ?? []),
				...(blockGraph?.requirements.map((r) => r.clauseRef) ?? [])
			];
			const res = await fetch(
				`/api/projects/${encodeURIComponent(pId)}/subjects/${encodeURIComponent(activeSubject.id)}/editorial-recommendations`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						subjectName: activeSubject.name,
						sectionRef: activeSubject.section_ref,
						signals: editorialSignals,
						validEntityIds: validIds
					})
				}
			);
			if (res.ok) {
				const data = await res.json();
				if (Array.isArray(data.recommendations) && data.recommendations.length > 0) {
					llmEditorialRecs = data.recommendations;
					llmCalloutText = data.calloutText;
				}
			}
		} catch {
			// Repli silencieux sur les recommandations déterministes
		} finally {
			isAskingEditorialLlm = false;
		}
	}

	const activeEditorialDiagram = $derived.by(() => {
		const blockGraph = projections?.projectionBlocks;
		if (!activeSubject || !blockGraph) return null;
		const decisionCtx = deliberationStore.decisionContexts[activeSubject.id];
		const retainedOption = decisionCtx?.decision?.retainedOptionId
			? decisionCtx.options.find((o) => o.id === decisionCtx.decision?.retainedOptionId)
			: null;

		if (editorialSubView === 'requirement-traceability') {
			return renderRequirementTraceability({
				subjectId: activeSubject.id,
				sectionRef: activeSubject.section_ref,
				subjectName: activeSubject.name,
				rows: editorialTraceRows,
				dials: editorialDials
			});
		}

		if (editorialSubView === 'paired-policy-traces') {
			const opts = decisionCtx?.options ?? [];
			const optA = retainedOption ?? opts[0];
			const optB = opts.find((o) => o.id !== optA?.id) ?? opts[1];
			const rules: PairedPolicyRuleRow[] = blockGraph.requirements.slice(0, 6).map((req) => {
				const block = req.targetAxisId ? blockGraph.blocks.find((b) => b.axisId === req.targetAxisId) : null;
				const hasVerified = Boolean(block?.items.some((i) => i.badge.tag === 'Verified' || i.badge.tag === 'Designed'));
				return {
					ruleId: req.clauseRef,
					ruleTitle: req.title,
					optionAStatus: hasVerified ? 'PASS' : 'UNVERIFIED',
					optionBStatus: block ? (block.unsettledCount > 0 ? 'FAIL' : 'PASS') : 'SKIPPED'
				};
			});
			return renderPairedPolicyTraces({
				subjectId: activeSubject.id,
				sectionRef: activeSubject.section_ref,
				subjectName: activeSubject.name,
				optionALabel: optA?.title || 'Option retenue',
				optionBLabel: optB?.title || 'Option alternative',
				rules,
				dials: editorialDials
			});
		}

		if (editorialSubView === 'decision-heatmap') {
			const criteria = (activeSubject.proposal?.criteria ?? []).map((c, idx) => ({
				id: `crit-${idx}`,
				name: c.name,
				weight: c.weight
			}));
			const evals = activeSubject.proposal?.evaluations ?? [];
			const rawOptions =
				decisionCtx?.options && decisionCtx.options.length > 0
					? decisionCtx.options.map((o) => ({ id: o.id, title: o.title }))
					: (activeSubject.proposal?.options ?? []).map((o, idx) => ({ id: `opt-${idx}`, title: o.title }));
			const options = rawOptions.map((o) => {
				const scores: Record<string, number | null> = {};
				for (const c of criteria) {
					const found = evals.find((e) => e.option === o.title && e.criterion === c.name);
					scores[c.id] = found ? found.score : null;
				}
				return {
					id: o.id,
					title: o.title,
					retained: decisionCtx?.decision?.retainedOptionId === o.id,
					scores
				};
			});
			return renderDecisionHeatmap({
				subjectId: activeSubject.id,
				sectionRef: activeSubject.section_ref,
				subjectName: activeSubject.name,
				criteria,
				options,
				calloutText: llmCalloutText || decisionCtx?.decision?.reversibility,
				dials: editorialDials
			});
		}

		if (editorialSubView === 'compensating-layers') {
			const layers = blockGraph.blocks.slice(0, 4).map((b, idx) => ({
				id: `LAY-${idx + 1}`,
				surface: b.togafRef || b.label,
				controlName: b.components[0] || b.label,
				actor: (idx === 0 ? 'human' : idx === 1 ? 'code' : 'platform') as 'human' | 'code' | 'platform',
				timing: (idx === 0 ? 'write' : idx === 1 ? 'merge' : 'run') as 'write' | 'merge' | 'run',
				coverageNote: `${b.settledCount}/${b.items.length} consolidé(s) · ${b.requirementRefs.length} req`,
				isGap: b.unsettledCount > 0
			}));
			const unsettledTotal = blockGraph.blocks.reduce((acc, b) => acc + b.unsettledCount, 0);
			return renderCompensatingLayers({
				subjectId: activeSubject.id,
				sectionRef: activeSubject.section_ref,
				subjectName: activeSubject.name,
				layers,
				residualRiskSummary:
					unsettledTotal > 0
						? `${unsettledTotal} énoncé(s) non consolidé(s) restant(s) à arbitrer ou couvrir avant scellement.`
						: 'Tous les énoncés actifs de cette section sont consolidés ; surveillance continue via Nautobot.',
				dials: editorialDials
			});
		}

		return renderTraceableBlockTree({
			subjectId: activeSubject.id,
			sectionRef: activeSubject.section_ref,
			subjectName: activeSubject.name,
			retainedOptionTitle: retainedOption?.title,
			graph: blockGraph,
			dials: editorialDials
		});
	});

	$effect(() => {
		if (activeSubject?.id) {
			const pId = deliberationStore.activeEngagement?.id || deliberationStore.activeEngagementId;
			if (pId && !deliberationStore.frozenSnapshots[activeSubject.id]) {
				void deliberationStore.fetchFrozenSnapshot(activeSubject.id, pId);
			}
		}
	});

	// L'option retenue et les options écartées viennent de la décision enregistrée : les charger à chaque changement de sujet.
	$effect(() => {
		if (activeSubject?.id) {
			selectedBlockAxisId = null;
			void deliberationStore.fetchDecisionContext(activeSubject.id);
		}
	});

	async function loadComplianceMatrix() {
		const pId = deliberationStore.activeEngagement?.id || deliberationStore.activeEngagementId;
		if (!pId) return;
		isLoadingCompliance = true;
		try {
			const res = await fetch(`/api/projects/${encodeURIComponent(pId)}/compliance-matrix?format=markdown`);
			if (res.ok) {
				complianceMarkdown = await res.text();
			}
		} catch {
			// fallback
		} finally {
			isLoadingCompliance = false;
		}
	}

	async function handleRegenerate() {
		if (!activeSubject) return;
		isRegenerating = true;
		try {
			const pId = deliberationStore.activeEngagement?.id || deliberationStore.activeEngagementId;
			if (pId) {
				await Promise.all([
					deliberationStore.refreshSubjectFromServer(activeSubject.id, pId),
					deliberationStore.fetchFrozenSnapshot(activeSubject.id, pId),
					deliberationStore.fetchDecisionContext(activeSubject.id, pId),
					loadComplianceMatrix()
				]);
			}
			lastSyncTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
			deliberationStore.logNotification('Projections et modèles resynchronisés depuis la délibération.', 'success');
		} catch (err: any) {
			deliberationStore.logNotification(`Erreur lors de la régénération : ${err?.message || err}`, 'warning');
		} finally {
			isRegenerating = false;
		}
	}

	function getCurrentContent(): string {
		if (activeTab === 'compliance') return complianceMarkdown;
		if (!projections) return '';
		switch (activeTab) {
			case 'mermaid':
				if (mermaidSubView === 'sequence') return (projections as any).deploymentSequenceMermaid || projections.mermaid;
				if (mermaidSubView === 'causal') return projections.mermaid;
				return (projections as any).targetArchitectureMermaid || projections.mermaid;
			case 'editorial':
				return activeEditorialDiagram?.svg || '';
			case 'structurizr':
				return c4SubView === 'c4x' ? (projections.c4xDSL || '') : projections.structurizrDSL;
			case 'sysml':
				return projections.sysmlV2;
			case 'config':
				return projections.configJSON;
			case 'petites-briques':
				if (petitesBriquesSubView === 'json') {
					return (projections as any).petitesBriquesCanvas
						? JSON.stringify((projections as any).petitesBriquesCanvas, null, 2)
						: '';
				}
				return (projections as any).petitesBriquesYAML || '';
		}
	}

	function copyToClipboard() {
		navigator.clipboard.writeText(getCurrentContent());
		copied = true;
		setTimeout(() => {
			copied = false;
		}, 2000);
	}

	function downloadArtifact() {
		const content = getCurrentContent();
		let filename = 'artifact.txt';
		let mimeType = 'text/plain';

		switch (activeTab) {
			case 'mermaid':
				if (mermaidSubView === 'sequence') filename = `${activeSubject?.id || 'arch'}_deployment_sequence.mmd`;
				else if (mermaidSubView === 'causal') filename = `${activeSubject?.id || 'arch'}_causal_graph.mmd`;
				else filename = `${activeSubject?.id || 'arch'}_target_architecture.mmd`;
				break;
			case 'editorial':
				filename = `${activeEditorialDiagram?.slug || activeSubject?.id || 'arch'}.svg`;
				mimeType = 'image/svg+xml;charset=utf-8';
				break;
			case 'structurizr':
				filename = c4SubView === 'c4x'
					? `${activeSubject?.id || 'arch'}_architecture.c4x`
					: `${activeSubject?.id || 'arch'}_workspace.dsl`;
				break;
			case 'sysml':
				filename = `${activeSubject?.id || 'arch'}_model.sysml`;
				break;
			case 'config':
				filename = `${activeSubject?.id || 'arch'}_config.json`;
				mimeType = 'application/json';
				break;
			case 'compliance':
				filename = `${activeSubject?.id || 'arch'}_matrice_conformite.md`;
				break;
			case 'petites-briques':
				if (petitesBriquesSubView === 'json') {
					filename = `${activeSubject?.id || 'arch'}_canvas.json`;
					mimeType = 'application/json';
				} else {
					filename = `${activeSubject?.id || 'arch'}_canvas.yaml`;
					mimeType = 'text/yaml';
				}
				break;
		}

		const blob = new Blob([content], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	function downloadCsv() {
		const pId = deliberationStore.activeEngagement?.id || deliberationStore.activeEngagementId;
		if (!pId) return;
		window.open(`/api/projects/${encodeURIComponent(pId)}/compliance-matrix?format=csv`, '_blank');
	}
</script>

<div class="rounded-xl border bg-card p-4 shadow-xs space-y-4">
	<!-- En-tête de la Phase 3 -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
		<div class="flex items-center gap-2.5">
			<div class="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
				<Layers class="h-5 w-5" />
			</div>
			<div>
				<div class="flex items-center gap-2">
					<h3 class="text-base font-bold tracking-tight text-foreground">
						Projections & Modèles Système
					</h3>
					<span class="rounded bg-muted px-2 py-0.5 text-xs font-mono font-bold text-muted-foreground">
						{activeSubject?.section_ref} · {activeSubject?.name}
					</span>
				</div>
				<p class="text-xs text-muted-foreground">
					Interprétation visuelle des décisions d'architecture actées (garantie zéro dérive documentaire)
				</p>
			</div>
		</div>

		<!-- Actions -->
		<div class="flex items-center gap-2 self-end sm:self-auto">
			<button
				type="button"
				onclick={handleRegenerate}
				class="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background hover:bg-muted text-foreground px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors"
			>
				<RefreshCw class="h-3.5 w-3.5 {isRegenerating ? 'animate-spin' : ''}" />
				<span>Regénérer</span>
			</button>

			<button
				type="button"
				onclick={() => deliberationStore.openFreezeDialog()}
				class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors"
			>
				<ShieldCheck class="h-3.5 w-3.5" />
				<span>Sceller Section (L5)</span>
			</button>
		</div>
	</div>

	<!-- Navigation par Onglets de Modèles & Export -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-1">
		<div class="flex items-center gap-1 overflow-x-auto text-xs">
			<button
				type="button"
				onclick={() => (activeTab = 'mermaid')}
				class="px-3 py-1.5 font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap {activeTab === 'mermaid'
					? 'bg-primary text-primary-foreground shadow-2xs'
					: 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
			>
				<Layers class="h-3.5 w-3.5" />
				<span>Diagrammes d'Architecture (Mermaid)</span>
			</button>

			<button
				type="button"
				onclick={() => (activeTab = 'editorial')}
				class="px-3 py-1.5 font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap {activeTab === 'editorial'
					? 'bg-primary text-primary-foreground shadow-2xs'
					: 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
				data-testid="tab-editorial-svg"
			>
				<Sparkles class="h-3.5 w-3.5" />
				<span>Vues Éditoriales (SVG)</span>
			</button>

			<button
				type="button"
				onclick={() => (activeTab = 'structurizr')}
				class="px-3 py-1.5 font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap {activeTab === 'structurizr'
					? 'bg-primary text-primary-foreground shadow-2xs'
					: 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
				data-testid="tab-c4-model"
			>
				<FileCode class="h-3.5 w-3.5" />
				<span>Modèle C4 (C4X & Structurizr)</span>
			</button>

			<button
				type="button"
				onclick={() => (activeTab = 'sysml')}
				class="px-3 py-1.5 font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap {activeTab === 'sysml'
					? 'bg-primary text-primary-foreground shadow-2xs'
					: 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
			>
				<Terminal class="h-3.5 w-3.5" />
				<span>Modélisation SysML v2 (BDD)</span>
			</button>

			<button
				type="button"
				onclick={() => (activeTab = 'config')}
				class="px-3 py-1.5 font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap {activeTab === 'config'
					? 'bg-primary text-primary-foreground shadow-2xs'
					: 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
			>
				<Cpu class="h-3.5 w-3.5" />
				<span>Configuration JSON</span>
			</button>

			<button
				type="button"
				onclick={() => {
					activeTab = 'compliance';
					void loadComplianceMatrix();
				}}
				class="px-3 py-1.5 font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap {activeTab === 'compliance'
					? 'bg-primary text-primary-foreground shadow-2xs'
					: 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
				data-testid="tab-compliance-matrix"
			>
				<Scale class="h-3.5 w-3.5" />
				<span>Matrice de Conformité</span>
			</button>

			<button
				type="button"
				onclick={() => (activeTab = 'petites-briques')}
				class="px-3 py-1.5 font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap {activeTab === 'petites-briques'
					? 'bg-primary text-primary-foreground shadow-2xs'
					: 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}"
				data-testid="tab-petites-briques"
			>
				<Boxes class="h-3.5 w-3.5" />
				<span>Canvas Petites Briques (Poka-Yoke)</span>
			</button>
		</div>

		<!-- Actions Copier / Exporter -->
		<div class="flex items-center gap-1.5 self-end sm:self-auto text-xs">
			<span class="text-[10px] text-muted-foreground mr-2 font-mono">Synchro : {lastSyncTime}</span>
			{#if activeTab === 'compliance'}
				<button
					type="button"
					onclick={downloadCsv}
					class="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 px-2.5 py-1 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
					data-testid="export-compliance-csv-btn"
				>
					<FileSpreadsheet class="h-3 w-3" />
					<span>Export CSV</span>
				</button>
			{/if}

			<button
				type="button"
				onclick={copyToClipboard}
				class="inline-flex items-center gap-1 rounded border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
			>
				{#if copied}
					<Check class="h-3 w-3 text-emerald-600" />
					<span>Copié</span>
				{:else}
					<Copy class="h-3 w-3" />
					<span>Copier</span>
				{/if}
			</button>

			<button
				type="button"
				onclick={downloadArtifact}
				class="inline-flex items-center gap-1 rounded border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
			>
				<Download class="h-3 w-3" />
				<span>Exporter {activeTab === 'compliance' ? 'Markdown' : ''}</span>
			</button>
		</div>
	</div>

	<!-- Affichage Interprété Graphiquement -->
	{#if projections}
		<div class="space-y-4">
			{#if activeTab === 'mermaid'}
				<div class="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-muted/60 border border-border/40 w-fit text-xs" data-testid="mermaid-view-switcher">
					<button
						type="button"
						onclick={() => (mermaidSubView = 'target')}
						class="px-2.5 py-1 rounded-md font-medium transition-colors {mermaidSubView === 'target' ? 'bg-background shadow-xs text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}"
						data-testid="tab-target-arch"
					>
						🎯 Architecture Spécifiée (Cible)
					</button>
					<button
						type="button"
						onclick={() => (mermaidSubView = 'sequence')}
						class="px-2.5 py-1 rounded-md font-medium transition-colors {mermaidSubView === 'sequence' ? 'bg-background shadow-xs text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}"
						data-testid="tab-sequence-arch"
					>
						🔄 Chaîne de Déploiement & Homologation
					</button>
					<button
						type="button"
						onclick={() => (mermaidSubView = 'causal')}
						class="px-2.5 py-1 rounded-md font-medium transition-colors {mermaidSubView === 'causal' ? 'bg-background shadow-xs text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}"
						data-testid="tab-causal-arch"
					>
						⚖️ Graphe Décisionnel (Auditabilité)
					</button>
				</div>

				{#if mermaidSubView === 'target'}
					<MermaidViewer
						code={(projections as any).targetArchitectureMermaid || projections.mermaid}
						title="Architecture Cible Spécifiée · {activeSubject?.section_ref} {activeSubject?.name}"
						defaultView="visual"
					/>
				{:else if mermaidSubView === 'sequence'}
					<MermaidViewer
						code={(projections as any).deploymentSequenceMermaid || projections.mermaid}
						title="Chaîne de Déploiement Sécurisée & Homologation · {activeSubject?.section_ref}"
						defaultView="visual"
					/>
				{:else}
					<MermaidViewer
						code={projections.mermaid}
						title="Graphe Décisionnel & Justification Épistémique · {activeSubject?.section_ref} {activeSubject?.name}"
						defaultView="visual"
					/>
				{/if}
			{:else if activeTab === 'editorial' && activeEditorialDiagram}
				<div class="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-muted/60 border border-border/40 w-fit text-xs" data-testid="editorial-view-switcher">
					<button
						type="button"
						onclick={() => (editorialSubView = 'traceable-blocks')}
						class="px-2.5 py-1 rounded-md font-medium transition-colors {editorialSubView === 'traceable-blocks' ? 'bg-background shadow-xs text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}"
						data-testid="editorial-subtab-blocks"
					>
						Blocs TOGAF
					</button>
					<button
						type="button"
						onclick={() => (editorialSubView = 'requirement-traceability')}
						class="px-2.5 py-1 rounded-md font-medium transition-colors {editorialSubView === 'requirement-traceability' ? 'bg-background shadow-xs text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}"
						data-testid="editorial-subtab-traceability"
					>
						Traçabilité Exigences
					</button>
					<button
						type="button"
						onclick={() => (editorialSubView = 'paired-policy-traces')}
						class="px-2.5 py-1 rounded-md font-medium transition-colors {editorialSubView === 'paired-policy-traces' ? 'bg-background shadow-xs text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}"
						data-testid="editorial-subtab-policy"
					>
						Traces KB Appariées
					</button>
					<button
						type="button"
						onclick={() => (editorialSubView = 'decision-heatmap')}
						class="px-2.5 py-1 rounded-md font-medium transition-colors {editorialSubView === 'decision-heatmap' ? 'bg-background shadow-xs text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}"
						data-testid="editorial-subtab-heatmap"
					>
						Matrice Décision
					</button>
					<button
						type="button"
						onclick={() => (editorialSubView = 'compensating-layers')}
						class="px-2.5 py-1 rounded-md font-medium transition-colors {editorialSubView === 'compensating-layers' ? 'bg-background shadow-xs text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}"
						data-testid="editorial-subtab-layers"
					>
						Couches Compensatoires
					</button>
				</div>

				<EditorialDiagramViewer
					diagram={activeEditorialDiagram}
					recommendations={editorialRecommendations}
					bind:dials={editorialDials}
					onSelectView={(viewId) => (editorialSubView = viewId)}
					onAskLlmAdvice={askEditorialDirector}
					isAskingLlm={isAskingEditorialLlm}
				/>
			{:else if activeTab === 'structurizr' || activeTab === 'sysml'}
				{@const blockGraph = projections.projectionBlocks}
				{@const activeBlock = selectedBlockAxisId ? blockGraph?.blocks.find((b) => b.axisId === selectedBlockAxisId) : null}
				{@const focusedMermaid = activeSubject?.id && selectedBlockAxisId
					? deliberationStore.getFocusedProjectionMermaid(activeSubject.id, activeTab, selectedBlockAxisId)
					: null}
				<div class="space-y-3">
					{#if blockGraph && blockGraph.blocks.length > 0}
						<div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-2" data-testid="projection-block-nav">
							<div class="flex flex-wrap items-center gap-1.5 text-xs">
								<span class="font-semibold text-muted-foreground mr-1">Navigation par bloc :</span>
								<button
									type="button"
									onclick={() => (selectedBlockAxisId = null)}
									class="px-2.5 py-1 rounded-md font-medium transition-colors {selectedBlockAxisId === null
										? 'bg-primary text-primary-foreground shadow-2xs'
										: 'bg-background border text-muted-foreground hover:text-foreground'}"
									data-testid="block-filter-all"
								>
									Tous les blocs ({blockGraph.blocks.length})
								</button>
								{#each blockGraph.blocks as block}
									<button
										type="button"
										onclick={() => (selectedBlockAxisId = selectedBlockAxisId === block.axisId ? null : block.axisId)}
										class="px-2.5 py-1 rounded-md font-medium transition-colors inline-flex items-center gap-1.5 {selectedBlockAxisId === block.axisId
											? 'bg-primary text-primary-foreground shadow-2xs'
											: 'bg-background border text-muted-foreground hover:text-foreground'}"
										data-testid="block-filter-{block.safeId}"
									>
										<span>{block.label}</span>
										<span class="rounded px-1 py-0.2 text-[10px] font-mono bg-black/10 dark:bg-white/10">{block.items.length}</span>
										{#if block.requirementRefs.length > 0}
											<span class="rounded px-1 py-0.2 text-[10px] font-mono bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
												{block.requirementRefs.length} req
											</span>
										{/if}
									</button>
								{/each}
							</div>
							<div class="text-[11px] text-muted-foreground font-mono">
								{blockGraph.requirements.length} exigence(s) tracée(s)
							</div>
						</div>
					{/if}

					{#if activeBlock}
						<div class="rounded-lg border bg-muted/20 p-3 space-y-2 text-xs" data-testid="selected-block-inspector">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<div>
									<span class="font-bold text-foreground">{activeBlock.label}</span>
									{#if activeBlock.togafRef}
										<span class="ml-2 text-[11px] text-muted-foreground">({activeBlock.togafRef})</span>
									{/if}
								</div>
								<div class="flex items-center gap-2 text-[11px] font-mono">
									<span class="text-emerald-700 dark:text-emerald-300">{activeBlock.settledCount} vérifié(s)</span>
									<span class="text-amber-700 dark:text-amber-300">{activeBlock.unsettledCount} non vérifié(s)</span>
								</div>
							</div>
							{#if activeBlock.components.length > 0}
								<div class="flex flex-wrap items-center gap-1.5">
									<span class="text-[11px] text-muted-foreground">Composants :</span>
									{#each activeBlock.components as comp}
										<span class="px-2 py-0.5 rounded bg-background border text-[11px] font-medium">{comp}</span>
									{/each}
								</div>
							{/if}
							{#if activeBlock.requirementRefs.length > 0}
								<div class="flex flex-wrap items-center gap-1.5">
									<span class="text-[11px] text-muted-foreground">Exigences satisfaites :</span>
									{#each activeBlock.requirementRefs as ref}
										<span class="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-[11px] font-mono">{ref}</span>
									{/each}
								</div>
							{/if}
						</div>
					{/if}

					{#if activeTab === 'structurizr'}
						<div class="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-muted/60 border border-border/40 w-fit text-xs" data-testid="c4-view-switcher">
							<button
								type="button"
								onclick={() => (c4SubView = 'c4x')}
								class="px-2.5 py-1 rounded-md font-medium transition-colors {c4SubView === 'c4x' ? 'bg-background shadow-xs text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}"
								data-testid="tab-c4x-subview"
							>
								C4X (.c4x / Markdown)
							</button>
							<button
								type="button"
								onclick={() => (c4SubView = 'structurizr')}
								class="px-2.5 py-1 rounded-md font-medium transition-colors {c4SubView === 'structurizr' ? 'bg-background shadow-xs text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}"
								data-testid="tab-structurizr-subview"
							>
								Structurizr DSL (.dsl)
							</button>
						</div>

						<div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
							<div class="lg:col-span-4 flex flex-col">
								<MermaidViewer
									code={focusedMermaid || projections.structurizrVisual}
									title="Aperçu C4 ({c4SubView === 'c4x' ? 'C4X' : 'Structurizr'}){activeBlock ? ` · ${activeBlock.label}` : ''}"
									defaultView="visual"
									compact={true}
								/>
							</div>

							<div class="lg:col-span-8 flex flex-col">
								{#if c4SubView === 'c4x'}
									<div class="rounded-xl border bg-muted/20 p-3 space-y-2 flex-1 flex flex-col" data-testid="c4x-code-panel">
										<div class="flex flex-wrap items-center justify-between gap-2 text-xs">
											<span class="font-bold text-muted-foreground">Code Source C4X (.c4x / bloc Markdown) :</span>
											<div class="flex flex-wrap items-center gap-2">
												<button
													type="button"
													onclick={() => {
														navigator.clipboard.writeText(wrapC4xMarkdown(projections.c4xDSL || '', activeSubject?.name));
														copied = true;
														setTimeout(() => (copied = false), 2000);
													}}
													class="inline-flex items-center gap-1 rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 transition-colors"
													data-testid="copy-c4x-markdown-btn"
												>
													<Copy class="h-3 w-3" />
													<span>Copier bloc Markdown ```c4x</span>
												</button>
												<button
													type="button"
													onclick={downloadArtifact}
													class="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted transition-colors"
													data-testid="download-c4x-btn"
												>
													<Download class="h-3 w-3" />
													<span>Télécharger .c4x</span>
												</button>
												<button
													type="button"
													onclick={() => {
														navigator.clipboard.writeText(projections.c4xDSL || '');
														copied = true;
														setTimeout(() => (copied = false), 2000);
													}}
													class="text-[11px] font-semibold text-primary hover:underline"
													data-testid="copy-c4x-btn"
												>
													Copier C4X
												</button>
											</div>
										</div>
										<pre class="rounded bg-muted/80 p-3 font-mono text-[11px] text-foreground overflow-auto flex-1 max-h-[340px] border">{projections.c4xDSL}</pre>
									</div>
								{:else}
									<div class="rounded-xl border bg-muted/20 p-3 space-y-2 flex-1 flex flex-col">
										<div class="flex flex-wrap items-center justify-between gap-2 text-xs">
											<span class="font-bold text-muted-foreground">Code Source Structurizr DSL (.dsl) :</span>
											<div class="flex flex-wrap items-center gap-2">
												<a
													href="https://structurizr.com/dsl"
													target="_blank"
													rel="noopener noreferrer"
													class="inline-flex items-center gap-1 rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 transition-colors"
													data-testid="structurizr-playground-link"
												>
													<ExternalLink class="h-3 w-3" />
													<span>Structurizr DSL Playground</span>
												</a>
												<button
													type="button"
													onclick={() => {
														navigator.clipboard.writeText('docker run -it --rm -p 8080:8080 -v "$PWD:/usr/local/structurizr" structurizr/lite');
														copied = true;
														setTimeout(() => (copied = false), 2000);
													}}
													class="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted transition-colors"
												>
													<span>Commande Structurizr Lite</span>
												</button>
												<button
													type="button"
													onclick={downloadArtifact}
													class="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted transition-colors"
												>
													<Download class="h-3 w-3" />
													<span>Télécharger .dsl</span>
												</button>
												<button
													type="button"
													onclick={() => {
														navigator.clipboard.writeText(projections.structurizrDSL);
														copied = true;
														setTimeout(() => (copied = false), 2000);
													}}
													class="text-[11px] font-semibold text-primary hover:underline"
												>
													Copier DSL
												</button>
											</div>
										</div>
										<pre class="rounded bg-muted/80 p-3 font-mono text-[11px] text-foreground overflow-auto flex-1 max-h-[340px] border">{projections.structurizrDSL}</pre>
									</div>
								{/if}
							</div>
						</div>
					{:else}
						<div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
							<div class="lg:col-span-4 flex flex-col">
								<MermaidViewer
									code={focusedMermaid || projections.sysmlVisual}
									title="Aperçu SysML v2 (BDD){activeBlock ? ` · ${activeBlock.label}` : ''}"
									defaultView="visual"
									compact={true}
								/>
							</div>
							<div class="lg:col-span-8 flex flex-col">
								<div class="rounded-xl border bg-muted/20 p-3 space-y-2 flex-1 flex flex-col">
							<div class="flex flex-wrap items-center justify-between gap-2 text-xs">
								<span class="font-bold text-muted-foreground">Spécification SysML v2 (.sysml) :</span>
								<div class="flex flex-wrap items-center gap-2">
									<a
										href="https://mbse-syson.org/"
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex items-center gap-1 rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 transition-colors"
										data-testid="sysml-syson-link"
									>
										<ExternalLink class="h-3 w-3" />
										<span>Eclipse SysON (SysML v2)</span>
									</a>
									<button
										type="button"
										onclick={downloadArtifact}
										class="inline-flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted transition-colors"
									>
										<Download class="h-3 w-3" />
										<span>Télécharger .sysml</span>
									</button>
									<button
										type="button"
										onclick={() => {
											navigator.clipboard.writeText(projections.sysmlV2);
											copied = true;
											setTimeout(() => (copied = false), 2000);
										}}
										class="text-[11px] font-semibold text-primary hover:underline"
									>
										Copier SysML
									</button>
								</div>
							</div>
							<pre class="rounded bg-muted/80 p-3 font-mono text-[11px] text-foreground overflow-auto flex-1 max-h-[340px] border">{projections.sysmlV2}</pre>
								</div>
							</div>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'config'}
				<div class="space-y-2">
					<div class="flex items-center justify-between text-xs font-bold text-muted-foreground">
						<span>Configuration Technique Validée :</span>
						<span class="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">JSON Formaté</span>
					</div>
					<pre class="rounded-lg bg-muted/80 p-4 font-mono text-xs text-foreground overflow-x-auto max-h-96 leading-relaxed border shadow-inner">{projections.configJSON}</pre>
				</div>
			{:else if activeTab === 'compliance'}
				<div class="space-y-3" data-testid="compliance-matrix-view">
					<div class="flex items-center justify-between text-xs font-bold text-muted-foreground">
						<div class="flex items-center gap-2">
							<Scale class="h-4 w-4 text-primary" />
							<span>Matrice de Conformité de base de l'Engagement :</span>
						</div>
						<div class="flex items-center gap-2">
							<button
								type="button"
								onclick={loadComplianceMatrix}
								class="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
							>
								<RefreshCw class="h-3 w-3 {isLoadingCompliance ? 'animate-spin' : ''}" />
								<span>Actualiser</span>
							</button>
						</div>
					</div>

					{#if isLoadingCompliance}
						<div class="p-6 text-center text-xs text-muted-foreground">
							Génération et calcul de la matrice de conformité opposable...
						</div>
					{:else if complianceMarkdown}
						<pre class="rounded-lg bg-muted/80 p-4 font-mono text-xs text-foreground overflow-x-auto max-h-[500px] leading-relaxed border shadow-inner whitespace-pre-wrap">{complianceMarkdown}</pre>
					{:else}
						<div class="p-6 text-center text-xs text-muted-foreground border rounded-lg">
							Aucune donnée de conformité disponible pour cet engagement.
						</div>
					{/if}
				</div>
			{:else if activeTab === 'petites-briques'}
				<div class="space-y-3" data-testid="petites-briques-view">
					<div class="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
						<div class="flex items-center gap-1.5 p-1 rounded-lg bg-muted/60 border border-border/40 w-fit text-xs">
							<button
								type="button"
								onclick={() => (petitesBriquesSubView = 'visual')}
								class="px-2.5 py-1 rounded-md font-medium transition-colors {petitesBriquesSubView === 'visual' ? 'bg-background shadow-xs text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}"
								data-testid="subtab-pb-visual"
							>
								🧱 Canvas Graphique (Sites & Briques)
							</button>
							<button
								type="button"
								onclick={() => (petitesBriquesSubView = 'yaml')}
								class="px-2.5 py-1 rounded-md font-medium transition-colors {petitesBriquesSubView === 'yaml' ? 'bg-background shadow-xs text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}"
								data-testid="subtab-pb-yaml"
							>
								📄 Spécification YAML Canvas
							</button>
							<button
								type="button"
								onclick={() => (petitesBriquesSubView = 'json')}
								class="px-2.5 py-1 rounded-md font-medium transition-colors {petitesBriquesSubView === 'json' ? 'bg-background shadow-xs text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}"
								data-testid="subtab-pb-json"
							>
								⚡ JSON Normalisé
							</button>
						</div>

						<div class="text-[11px] text-muted-foreground font-medium">
							Modèle Poka-Yoke · {(projections as any)?.petitesBriquesCanvas?.sites?.length || 0} sites · {(projections as any)?.petitesBriquesCanvas?.zones?.length || 0} zones · {(projections as any)?.petitesBriquesCanvas?.connections?.length || 0} liaisons
						</div>
					</div>

					{#if petitesBriquesSubView === 'visual'}
						{@const canvas = (projections as any)?.petitesBriquesCanvas}
						{#if canvas}
							<div class="space-y-4">
								<!-- Périmètres et métadonnées -->
								<div class="flex flex-wrap items-center gap-2 text-xs">
									{#each canvas.perimeters as perim}
										<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-semibold" style="border-color: {perim.color}; color: {perim.color}; background-color: {perim.color}15">
											🛡️ {perim.name}
										</span>
									{/each}
									<span class="text-muted-foreground italic text-[11px]">{canvas.description}</span>
								</div>

								<!-- Rendu visuel en colonnes des sites et briques -->
								<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
									{#each canvas.sites as site}
										<div class="rounded-xl border bg-card p-4 shadow-xs space-y-3">
											<div class="flex items-center justify-between border-b pb-2">
												<div class="font-bold text-xs flex items-center gap-1.5 text-foreground">
													<span>🏢 {site.name}</span>
												</div>
												<span class="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
													{site.siteType}
												</span>
											</div>

											<div class="space-y-2">
												{#each site.bricks as brick}
													<div class="p-2.5 rounded-lg border bg-muted/40 hover:bg-muted/70 transition-colors space-y-1">
														<div class="flex items-center justify-between text-xs">
															<span class="font-semibold text-foreground">{brick.label || brick.templateId}</span>
															<span class="text-[10px] font-mono text-muted-foreground">Ordre {brick.order}</span>
														</div>
														<div class="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
															<span class="px-1.5 py-0.2 rounded bg-background border">tpl: {brick.templateId}</span>
															<span>id: {brick.instanceId}</span>
														</div>
													</div>
												{/each}
											</div>
										</div>
									{/each}
								</div>

								<!-- Synthèse des connexions inter-briques -->
								{#if canvas.connections.length > 0}
									<div class="rounded-xl border bg-muted/20 p-3 space-y-2 text-xs">
										<div class="font-bold text-muted-foreground flex items-center gap-1.5">
											<span>🔗 Flux & Interconnexions Physiques/Logiques ({canvas.connections.length}) :</span>
										</div>
										<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
											{#each canvas.connections as conn}
												<div class="p-2 rounded bg-background border flex items-center justify-between">
													<div class="flex items-center gap-1.5 truncate">
														<span class="font-bold text-foreground">{conn.sourceBrickId}</span>
														<span class="text-muted-foreground">➔</span>
														<span class="font-bold text-foreground">{conn.targetBrickId}</span>
													</div>
													<span class="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold text-[10px]">
														{conn.linkTypeId}
													</span>
												</div>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{/if}
					{:else if petitesBriquesSubView === 'yaml'}
						<div class="space-y-2">
							<div class="flex items-center justify-between text-xs font-bold text-muted-foreground">
								<span>Spécification Declarative YAML (Compatible PetitesBriques) :</span>
								<span class="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">YAML Opposable</span>
							</div>
							<pre class="rounded-lg bg-muted/80 p-4 font-mono text-xs text-foreground overflow-x-auto max-h-[500px] leading-relaxed border shadow-inner whitespace-pre">{ (projections as any)?.petitesBriquesYAML || '' }</pre>
						</div>
					{:else}
						<div class="space-y-2">
							<div class="flex items-center justify-between text-xs font-bold text-muted-foreground">
								<span>Modèle JSON Normalisé (Petites Briques Canvas) :</span>
								<span class="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">JSON Formaté</span>
							</div>
							<pre class="rounded-lg bg-muted/80 p-4 font-mono text-xs text-foreground overflow-x-auto max-h-[500px] leading-relaxed border shadow-inner whitespace-pre">{ JSON.stringify((projections as any)?.petitesBriquesCanvas, null, 2) }</pre>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{:else if activeTab === 'compliance'}
		<div class="space-y-3" data-testid="compliance-matrix-view">
			<div class="flex items-center justify-between text-xs font-bold text-muted-foreground">
				<div class="flex items-center gap-2">
					<Scale class="h-4 w-4 text-primary" />
					<span>Matrice de Conformité de base de l'Engagement :</span>
				</div>
				<button
					type="button"
					onclick={loadComplianceMatrix}
					class="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
				>
					<RefreshCw class="h-3 w-3 {isLoadingCompliance ? 'animate-spin' : ''}" />
					<span>Actualiser</span>
				</button>
			</div>

			{#if isLoadingCompliance}
				<div class="p-6 text-center text-xs text-muted-foreground">
					Génération et calcul de la matrice de conformité opposable...
				</div>
			{:else if complianceMarkdown}
				<pre class="rounded-lg bg-muted/80 p-4 font-mono text-xs text-foreground overflow-x-auto max-h-[500px] leading-relaxed border shadow-inner whitespace-pre-wrap">{complianceMarkdown}</pre>
			{:else}
				<div class="p-6 text-center text-xs text-muted-foreground border rounded-lg">
					Aucune donnée de conformité disponible pour cet engagement.
				</div>
			{/if}
		</div>
	{:else}
		<div class="p-8 text-center text-xs text-muted-foreground border rounded-lg">
			Aucun sujet d'architecture actif sélectionné pour la projection.
		</div>
	{/if}
</div>

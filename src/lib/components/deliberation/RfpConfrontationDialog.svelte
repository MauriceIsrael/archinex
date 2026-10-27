<script lang="ts">
	import { untrack } from 'svelte';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import {
		shredRfpTextToClauses,
		confrontClausesWithKnowledgeBase,
		SAMPLE_RFP_TEMPLATES,
		type RfpConfrontationResult,
		type ClauseConfrontation
	} from '$lib/domain/rfpConfrontation';
	import type { UpstreamDocInput, InitialSubjectInput } from '$lib/domain/engagements';
	import { buildRequirementAudit, type RequirementAuditInput } from '$lib/domain/requirementAudit';
	import { detectApplicableFrameworks, type DetectedFramework } from '$lib/domain/regulatoryFrameworks';
	import type { LocalLlmModel, RfpFactorizationResponse } from '$lib/domain/factorization';
	import {
		requestNotificationPermission,
		updateAuditProgressTitle,
		resetAuditTitle,
		notifyAuditCompleted,
		ACTIVE_FACTORIZATION_RUN_KEY
	} from '$lib/services/backgroundAuditNotifier';
	import RfpFactorizationReview from './RfpFactorizationReview.svelte';
	import RfpExtractionVerification from './RfpExtractionVerification.svelte';
	import type { HumanExtractionValidation } from '$lib/domain/rfpExtractionReport';
	import ReuseConfirmationModal from '$lib/components/kb/ReuseConfirmationModal.svelte';
	import type { SimilarKnowledgeItem, ReuseConfirmation } from '$lib/types/llmops';
	import {
		X,
		Sparkles,
		BrainCircuit,
		Globe,
		FileText,
		Upload,
		CheckCircle2,
		AlertTriangle,
		AlertCircle,
		ShieldCheck,
		ArrowRight,
		RefreshCw,
		Layers,
		Check,
		HelpCircle,
		Cpu,
		Sliders,
		ChevronDown,
		ChevronRight,
		Server
	} from 'lucide-svelte';

	interface Props {
		open?: boolean;
		onclose: () => void;
		onImported: (result: {
			document: UpstreamDocInput;
			initialSubjects: InitialSubjectInput[];
			/** Présent uniquement quand l'audit des exigences a réellement tourné (jamais fabriqué). */
			requirementAudit?: RequirementAuditInput;
			/** Référentiels réglementaires cités par le RFP (détection déterministe, à confirmer par l'architecte). */
			detectedFrameworks?: DetectedFramework[];
		}) => void;
		actorEmail?: string;
		/** Déplie d'emblée la liste des analyses enregistrées (arrivée depuis la liste des espaces). */
		showSavedRunsOnOpen?: boolean;
	}

	let { open = $bindable(false), onclose, onImported, actorEmail = '', showSavedRunsOnOpen = false }: Props = $props();

	// Recherche de similarité sémantique & Réutilisation validée (Contrats 1.9 & 1.10 - A12/A13/A15)
	let similarAssetsByClause = $state<Record<string, { item: SimilarKnowledgeItem; fingerprint: string }>>({});
	let clauseReuseConfirmations = $state<Record<string, ReuseConfirmation>>({});
	let isCheckingSimilarity = $state<boolean>(false);

	// Modale d'examen des hypothèses
	let isReuseModalOpen = $state<boolean>(false);
	let selectedClauseForReuse = $state<ClauseConfrontation | null>(null);
	let selectedSimilarAsset = $state<SimilarKnowledgeItem | null>(null);
	let selectedFingerprint = $state<string>('');

	type InputMode = 'templates' | 'paste' | 'url' | 'file';
	let inputMode = $state<InputMode>('templates');

	let rfpText = $state<string>(SAMPLE_RFP_TEMPLATES[0].text);
	let selectedTemplateId = $state<string>(SAMPLE_RFP_TEMPLATES[0].id);
	let documentTitle = $state<string>(SAMPLE_RFP_TEMPLATES[0].name);
	let documentSource = $state<string>('Maîtrise d\'Ouvrage (RFP)');
	let documentVersion = $state<string>('v1.0');

	let remoteUrl = $state<string>('');
	let isFetchingUrl = $state<boolean>(false);
	let fetchError = $state<string | null>(null);

	let isParsingFile = $state<boolean>(false);
	let fileParseSuccess = $state<string | null>(null);
	let fileParseWarning = $state<string | null>(null);
	let fileParseError = $state<string | null>(null);
	let extractedPages = $state<Array<{ pageNumber: number; text: string }> | undefined>(undefined);
	let extractionValidation = $state<HumanExtractionValidation | null>(null);

	// Confrontation classique clause-par-clause
	let isAnalyzing = $state<boolean>(false);
	let confrontationResult = $state<RfpConfrontationResult | null>(null);
	let autoGenerateSubjects = $state<boolean>(true);

	// Factorisation sémantique par LLM Local Souverain
	let isFactorizing = $state<boolean>(false);
	let factorizeSeconds = $state<number>(0);
	let factorizeTimer: any = null;
	let factorizationResponse = $state<RfpFactorizationResponse | null>(null);
	let auditReceivedAt = $state<string>('');

	/** Audit à persister : seulement si le pipeline d'audit a produit les dispositions clause par clause. */
	function buildAuditForImport(finalSubjects: InitialSubjectInput[]): RequirementAuditInput | undefined {
		const resp = factorizationResponse;
		if (!resp || resp.engine !== 'arckit-requirements-audit') return undefined;
		const audited = resp.allAuditedRequirements ?? [];
		if (audited.length === 0) return undefined;
		return buildRequirementAudit({
			sourceText: rfpText,
			sourceTitle: documentTitle || 'Cahier des Charges (RFP)',
			sourceVersion: documentVersion || 'v1.0',
			model: resp.modelUsed,
			auditedAt: auditReceivedAt || new Date().toISOString(),
			reviewed: audited,
			confirmedDeliberated: finalSubjects.flatMap((s) => s.coveredClauseRefs ?? [])
		});
	}
	let factorizationError = $state<string | null>(null);

	// Factorisations exécutées côté serveur, en tâche de fond : le suivi survit à un rechargement de page
	// (l'exécution suivie est mémorisée dans le navigateur) et à une fermeture de la boîte de dialogue.
	const ACTIVE_RUN_KEY = ACTIVE_FACTORIZATION_RUN_KEY;
	interface RunProgress {
		stage: string;
		label: string;
		done: number;
		total: number;
		updatedAt: string;
	}
	interface PersistedRun {
		id: string;
		documentTitle: string | null;
		model: string;
		status: string;
		clauseCount: number;
		subjectCount: number | null;
		progress: RunProgress | null;
		error: string | null;
		startedAt: string;
		finishedAt: string | null;
	}
	let showPersistedRuns = $state<boolean>(false);
	let persistedRuns = $state<PersistedRun[]>([]);
	let persistedRunsError = $state<string | null>(null);
	let loadingRunId = $state<string | null>(null);
	let activeRunId = $state<string | null>(null);
	let activeProgress = $state<RunProgress | null>(null);
	let activeRunHasPartial = $state<boolean>(false);
	let interruptedRunId = $state<string | null>(null);
	let pollToken = 0;

	const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
	const RESUMABLE = ['interrupted', 'error', 'unavailable', 'partial'];

	async function refreshPersistedRuns() {
		persistedRunsError = null;
		try {
			const res = await fetch('/api/rfp/factorize/runs');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			persistedRuns = (await res.json()).runs ?? [];
		} catch (err) {
			persistedRunsError = err instanceof Error ? err.message : 'Liste indisponible';
		}
	}

	async function togglePersistedRuns() {
		showPersistedRuns = !showPersistedRuns;
		if (showPersistedRuns) await refreshPersistedRuns();
	}

	/** Exécution persistée, ou null si elle n'existe plus. Lève une erreur si le serveur ne répond pas. */
	async function fetchRun(runId: string) {
		const res = await fetch(`/api/rfp/factorize/runs/${encodeURIComponent(runId)}`);
		if (res.status === 404) return null;
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return res.json();
	}

	/** Affiche le résultat d'une exécution : final, ou partiel tant qu'elle est en cours. */
	function applyRunResult(run: { id: string; result: RfpFactorizationResponse; sourceText?: string | null; documentTitle?: string | null; finishedAt?: string | null; startedAt: string }) {
		// Le texte source accompagne le résultat : la provenance de l'audit importé reste exacte.
		if (run.sourceText) rfpText = run.sourceText;
		if (run.documentTitle) documentTitle = run.documentTitle;
		confrontationResult = null;
		factorizationError = null;
		factorizationResponse = { ...run.result, runId: run.id };
		auditReceivedAt = run.finishedAt ?? run.startedAt;
	}

	async function loadPersistedRun(runId: string) {
		loadingRunId = runId;
		persistedRunsError = null;
		try {
			const run = await fetchRun(runId);
			if (!run) throw new Error('exécution introuvable');
			if (!run.result) throw new Error('cette exécution n\'a pas produit de résultat');
			applyRunResult(run);
			showPersistedRuns = false;
		} catch (err) {
			persistedRunsError = `Chargement impossible : ${err instanceof Error ? err.message : 'erreur'}`;
		} finally {
			loadingRunId = null;
		}
	}

	/**
	 * Suit une exécution jusqu'à son terme en interrogeant le serveur. S'arrête si une autre exécution est suivie
	 * ou si la boîte de dialogue se ferme (l'exécution, elle, continue côté serveur).
	 */
	async function followRun(runId: string) {
		const token = ++pollToken;
		activeRunId = runId;
		isFactorizing = true;
		factorizationError = null;
		interruptedRunId = null;
		activeProgress = null;
		activeRunHasPartial = false;
		localStorage.setItem(ACTIVE_RUN_KEY, runId);
		void requestNotificationPermission();

		let startedAt = Date.now();
		clearInterval(factorizeTimer);
		factorizeTimer = setInterval(() => {
			factorizeSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
		}, 1000);

		try {
			while (token === pollToken) {
				let run;
				try {
					run = await fetchRun(runId);
				} catch {
					// Serveur momentanément injoignable (redémarrage) : on réessaie, l'exécution sera vue « interrompue » si besoin.
					await sleep(5000);
					continue;
				}
				if (token !== pollToken) break;
				if (!run) {
					factorizationError = 'Exécution introuvable côté serveur.';
					localStorage.removeItem(ACTIVE_RUN_KEY);
					break;
				}
				startedAt = new Date(run.startedAt).getTime();
				activeProgress = run.progress;
				if (run.status === 'running') {
					activeRunHasPartial = !!run.result;
					if (run.progress) {
						updateAuditProgressTitle(run.progress.label, run.progress.done, run.progress.total);
					}
					await sleep(3000);
					continue;
				}
				localStorage.removeItem(ACTIVE_RUN_KEY);
				resetAuditTitle();
				notifyAuditCompleted({
					runId: run.id,
					status: run.status,
					subjectCount: run.result?.subjects?.length ?? run.subjectCount ?? 0,
					error: run.error,
					title: run.documentTitle
				});
				if (run.status === 'ok') {
					applyRunResult(run);
				} else if (run.status === 'interrupted' || run.status === 'partial') {
					if (run.result) applyRunResult(run);
					interruptedRunId = run.id;
					if (run.error) {
						factorizationError = run.error;
					} else if (!run.result?.subjects?.length) {
						factorizationError = 'Analyse suspendue avant génération des sujets (solde de crédits ou réseau). Reprise possible depuis le cache.';
					}
				} else {
					factorizationError = run.error || 'Échec de la factorisation';
					if (RESUMABLE.includes(run.status)) interruptedRunId = run.id;
				}
				break;
			}
		} finally {
			if (token === pollToken) {
				clearInterval(factorizeTimer);
				isFactorizing = false;
				activeRunId = null;
				activeRunHasPartial = false;
			}
		}
	}

	/** Affiche l'état partiel de l'exécution suivie, sans interrompre le suivi. */
	async function showActiveRunPartial() {
		if (!activeRunId) return;
		try {
			const run = await fetchRun(activeRunId);
			if (run?.result) applyRunResult(run);
		} catch {
			// le suivi continue ; l'état partiel sera disponible au prochain essai
		}
	}

	async function resumeRun(runId: string) {
		factorizationError = null;
		try {
			const res = await fetch(`/api/rfp/factorize/runs/${encodeURIComponent(runId)}/resume`, { method: 'POST' });
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.message || `Reprise impossible (${res.status})`);
			}
			showPersistedRuns = false;
			void followRun(runId);
		} catch (err) {
			factorizationError = err instanceof Error ? err.message : 'Reprise impossible';
		}
	}

	// À l'ouverture : on se rattache à l'exécution suivie avant un rechargement de page ou une fermeture.
	// À la fermeture : on arrête seulement de l'interroger.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			const pending = localStorage.getItem(ACTIVE_RUN_KEY);
			if (pending && !activeRunId) void followRun(pending);
			if (showSavedRunsOnOpen && !showPersistedRuns) void togglePersistedRuns();
		});
		return () => {
			pollToken++;
			clearInterval(factorizeTimer);
			isFactorizing = false;
			activeRunId = null;
		};
	});

	// Modèles et configuration locale (LLM Local)
	let availableModels = $state<LocalLlmModel[]>([]);
	let selectedModel = $state<string>('');
	let serverEndpoint = $state<string>('http://localhost:11434');
	let serverAvailable = $state<boolean>(true);
	let showPromptSettings = $state<boolean>(false);
	let customPromptDirectives = $state<string>('');
	let defaultSystemPrompt = $state<string>('');

	// Découverte dynamique du LLM local à l'ouverture
	$effect(() => {
		if (open) {
			fetch('/api/rfp/factorize')
				.then((r) => r.json())
				.then((data) => {
					if (data.models && data.models.length > 0) {
						availableModels = data.models;
						if (data.defaultModel && data.models.some((m: LocalLlmModel) => m.id === data.defaultModel)) {
							selectedModel = data.defaultModel;
						} else {
							selectedModel = data.models[0].id;
						}
					} else {
						availableModels = [];
						if (data.defaultModel) {
							selectedModel = data.defaultModel;
						}
					}
					if (data.serverEndpoint) serverEndpoint = data.serverEndpoint;
					if (data.defaultSystemPrompt) defaultSystemPrompt = data.defaultSystemPrompt;
					serverAvailable = data.available ?? (availableModels.length > 0);
				})
				.catch(() => {
					serverAvailable = false;
				});
		}
	});

	function selectTemplate(tmpl: typeof SAMPLE_RFP_TEMPLATES[0]) {
		selectedTemplateId = tmpl.id;
		rfpText = tmpl.text;
		documentTitle = tmpl.name;
		fileParseSuccess = null;
		fileParseWarning = null;
		fileParseError = null;
		confrontationResult = null;
		factorizationResponse = null;
		similarAssetsByClause = {};
		clauseReuseConfirmations = {};
		extractedPages = undefined;
		extractionValidation = null;
	}

	async function handleFetchUrl() {
		if (!remoteUrl.trim()) return;
		isFetchingUrl = true;
		fetchError = null;

		try {
			const res = await fetch('/api/rfp/fetch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: remoteUrl.trim() })
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.message || `Erreur ${res.status}`);
			}

			const data = await res.json();
			rfpText = data.text;
			if (data.title) documentTitle = data.title;
			documentSource = data.sourceUrl;
			confrontationResult = null;
			factorizationResponse = null;
			extractedPages = undefined;
			extractionValidation = null;
		} catch (err: unknown) {
			fetchError = err instanceof Error ? err.message : 'Erreur lors de la récupération';
		} finally {
			isFetchingUrl = false;
		}
	}

	async function handleFileUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		fileParseSuccess = null;
		fileParseWarning = null;
		fileParseError = null;
		confrontationResult = null;
		factorizationResponse = null;

		documentTitle = file.name.replace(/\.[^/.]+$/, '');
		documentSource = `Fichier local (${file.name})`;

		const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

		if (isPdf) {
			isParsingFile = true;
			try {
				const formData = new FormData();
				formData.append('file', file);

				const res = await fetch('/api/rfp/parse-file', {
					method: 'POST',
					body: formData
				});

				if (!res.ok) {
					const errData = await res.json().catch(() => ({}));
					throw new Error(errData.message || `Erreur serveur (${res.status}) lors de l'extraction`);
				}

				const data = await res.json();
				if (data.text) {
					rfpText = data.text;
				}
				if (data.title) {
					documentTitle = data.title;
				}
				if (data.pages) {
					extractedPages = data.pages;
				} else {
					extractedPages = undefined;
				}
				extractionValidation = null;

				if (data.warning) {
					fileParseWarning = data.warning;
				} else {
					fileParseSuccess = `Document PDF extrait avec succès : ${data.pagesCount} page${data.pagesCount > 1 ? 's' : ''} (${data.length.toLocaleString('fr-FR')} caractères textuels).`;
				}
			} catch (err: unknown) {
				fileParseError = err instanceof Error ? err.message : 'Erreur lors de la lecture du document PDF';
			} finally {
				isParsingFile = false;
			}
		} else {
			// Fichiers texte brut, markdown ou JSON
			const reader = new FileReader();
			reader.onload = (event) => {
				const content = event.target?.result as string;
				if (content) {
					rfpText = content;
					extractedPages = undefined;
					extractionValidation = null;
					fileParseSuccess = `Fichier textuel chargé avec succès (${content.length.toLocaleString('fr-FR')} caractères).`;
				}
			};
			reader.onerror = () => {
				fileParseError = 'Erreur lors de la lecture locale du fichier texte';
			};
			reader.readAsText(file);
		}
	}

	// 1. Déclenche la factorisation : le calcul tourne côté serveur, l'interface en suit l'avancement.
	async function runLlmFactorization() {
		if (!rfpText.trim()) return;
		factorizeSeconds = 0;
		factorizationError = null;
		interruptedRunId = null;
		confrontationResult = null;
		isFactorizing = true;

		try {
			const extractedClauses = shredRfpTextToClauses(rfpText);
			if (extractedClauses.length === 0) {
				throw new Error('Aucune exigence identifiable dans ce document.');
			}

			const res = await fetch('/api/rfp/factorize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					clauses: extractedClauses,
					model: selectedModel,
					customPromptDirectives: customPromptDirectives.trim() || undefined,
					documentTitle,
					sourceText: rfpText,
					extractionValidation
				})
			});

			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.message || errData.error || `Erreur lors de la factorisation (${res.status})`);
			}

			const data = await res.json();
			if (res.status === 202 && data.runId) {
				void followRun(data.runId);
				return;
			}
			// Résultat déjà calculé pour ces entrées, renvoyé sans recalcul.
			factorizationResponse = data as RfpFactorizationResponse;
			auditReceivedAt = new Date().toISOString();
			isFactorizing = false;
		} catch (err: unknown) {
			factorizationError = err instanceof Error ? err.message : 'Échec de la factorisation';
			isFactorizing = false;
		}
	}

	// 2. Déclenche le Dépouillement Brut Clause-par-Clause (Historique)
	async function runShredAndConfront() {
		if (!rfpText.trim()) return;
		isAnalyzing = true;
		factorizationResponse = null;
		similarAssetsByClause = {};
		clauseReuseConfirmations = {};

		try {
			const extractedClauses = shredRfpTextToClauses(rfpText);

			const result = confrontClausesWithKnowledgeBase(
				extractedClauses,
				deliberationStore.commonKnowledgeBase,
				deliberationStore.statements
			);

			result.document.title = documentTitle || result.document.title;
			result.document.sourceOrAuthor = documentSource || result.document.sourceOrAuthor;
			result.document.version = documentVersion || 'v1.0';

			confrontationResult = result;

			// Interrogation sémantique pour chaque clause auprès de LLMOps
			isCheckingSimilarity = true;
			try {
				const queryPromises = result.confrontations.map(async (conf) => {
					try {
						const res = await fetch('/api/knowledge/similar', {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json'
							},
							body: JSON.stringify({
								query_text: `${conf.title}. ${conf.text}`,
								top_k: 5
							})
						});
						if (!res.ok) return null;
						const jsonRes = await res.json();
						const results: SimilarKnowledgeItem[] = jsonRes.data?.results || [];
						// Priorité aux actifs avec hypothèses documentées (arbitrage D8), sinon meilleur actif qualifié
						const withAssumptions = results.find(
							(r) => r.assumptions_documented && r.zone !== 'superseded'
						);
						const best =
							withAssumptions ||
							results.find((r) => r.zone === 'strong' || r.zone === 'possible') ||
							results[0];
						if (best && (best.zone === 'strong' || best.zone === 'possible' || best.score >= 0.25)) {
							return {
								confId: conf.id,
								item: best,
								fingerprint: jsonRes.subject_fingerprint || ''
							};
						}
					} catch {
						return null;
					}
					return null;
				});

				const matches = await Promise.all(queryPromises);
				const updatedSimilar: Record<string, { item: SimilarKnowledgeItem; fingerprint: string }> = {};
				for (const m of matches) {
					if (m) {
						updatedSimilar[m.confId] = {
							item: m.item,
							fingerprint: m.fingerprint
						};
					}
				}
				similarAssetsByClause = updatedSimilar;
			} finally {
				isCheckingSimilarity = false;
			}
		} finally {
			isAnalyzing = false;
		}
	}

	function openReuseModal(conf: ClauseConfrontation, similar: { item: SimilarKnowledgeItem; fingerprint: string }) {
		selectedClauseForReuse = conf;
		selectedSimilarAsset = similar.item;
		selectedFingerprint = similar.fingerprint;
		isReuseModalOpen = true;
	}

	function handleReuseConfirmed(confirmation: ReuseConfirmation) {
		if (selectedClauseForReuse) {
			clauseReuseConfirmations[selectedClauseForReuse.id] = confirmation;
			if (confirmation.outcome === 'reused' || confirmation.outcome === 'reused_with_exception') {
				selectedClauseForReuse.status = 'compliant';
				selectedClauseForReuse.rationale = `Conforme par réutilisation validée de ${confirmation.matched_ref} (${confirmation.outcome}).`;
				if (confrontationResult) {
					const compliantCount = confrontationResult.confrontations.filter((c) => c.status === 'compliant').length;
					const conflictCount = confrontationResult.confrontations.filter((c) => c.status === 'conflict').length;
					const gapCount = confrontationResult.confrontations.filter((c) => c.status === 'gap').length;
					confrontationResult.stats.compliantCount = compliantCount;
					confrontationResult.stats.conflictCount = conflictCount;
					confrontationResult.stats.gapCount = gapCount;
					confrontationResult.stats.complianceRate = Math.round(
						(compliantCount / confrontationResult.stats.totalClauses) * 100
					);
				}
			}
		}
		isReuseModalOpen = false;
	}

	function handleConfirmImportClauseByClause() {
		if (!confrontationResult) return;

		onImported({
			document: confrontationResult.document,
			initialSubjects: autoGenerateSubjects ? confrontationResult.suggestedInitialSubjects : []
		});

		onclose();
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
	>
		<div
			class="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden max-h-[94vh] flex flex-col text-foreground"
		>
			<!-- ─── Header ──────────────────────────────────────────────────────── -->
			<div class="p-4 sm:p-5 border-b flex items-center justify-between bg-muted/30 shrink-0">
				<div class="flex items-center gap-3">
					<div class="p-2.5 rounded-xl bg-primary text-primary-foreground shadow-xs">
						<BrainCircuit class="h-5 w-5" />
					</div>
					<div>
						<div class="flex items-center gap-2">
							<h2 class="text-base sm:text-lg font-bold">
								Dépouillement RFP & Factorisation en Sujets d'Architecture
							</h2>
						</div>
						<p class="text-xs text-muted-foreground mt-0.5">
							Condensez les exigences en 8 à 12 Sujets d'Architecture majeurs ancrés dans votre Patrimoine Commun (LLMOps) via inférence locale.
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

			<!-- ─── Body ─────────────────────────────────────────────────────────── -->
			<div class="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 text-xs">
				<!-- Si la factorisation LLM a été calculée, on affiche l'écran de revue et d'appropriation -->
				{#if factorizationResponse}
					{#if factorizationResponse.inProgress}
						<div class="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs">
							<strong>État partiel :</strong> l'analyse est toujours en cours côté serveur{#if activeProgress} ({activeProgress.label}{#if activeProgress.stage !== 'partition'} {activeProgress.done}/{activeProgress.total}{/if}){/if}.
							Le résultat final remplacera cet aperçu automatiquement ; l'import n'est possible qu'une fois l'analyse terminée.
						</div>
					{/if}
					{#if factorizationResponse.status === 'fallback' || factorizationResponse.errorDetail}
						<div class="p-3 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-xs" role="alert">
							<strong>⚠️ Repli heuristique (moteur IA indisponible) :</strong> ces sujets n'ont pas été produits par le moteur IA mais par des règles déterministes de secours. Vérifiez-les attentivement ou relancez la factorisation.
						</div>
					{/if}
					<RfpFactorizationReview
						subjects={factorizationResponse.subjects}
						clauses={shredRfpTextToClauses(rfpText)}
						modelUsed={factorizationResponse.modelUsed}
						engine={factorizationResponse.engine}
						summary={factorizationResponse.summary}
						coverageRate={factorizationResponse.coverageRate}
						warning={factorizationResponse.warning}
						errorDetail={factorizationResponse.errorDetail}
						wasCondensed={factorizationResponse.wasCondensed}
						auditReport={factorizationResponse.auditReport}
						evacuatedCount={factorizationResponse.evacuatedCount}
						deliberatedCount={factorizationResponse.deliberatedCount}
						clarificationCount={factorizationResponse.clarificationCount}
						toQualifyCount={factorizationResponse.toQualifyCount}
						clarifications={factorizationResponse.clarifications}
						allAuditedRequirements={factorizationResponse.allAuditedRequirements}
						extractionValidation={factorizationResponse.extractionValidation}
						onConfirm={(finalSubjects: InitialSubjectInput[]) => {
							if (factorizationResponse?.inProgress) {
								factorizationError = "Analyse encore en cours : l'import sera possible une fois le résultat final disponible.";
								return;
							}
							onImported({
								document: {
									title: documentTitle || 'Cahier des Charges (RFP)',
									category: 'cctp',
									categoryLabel: 'Cahier des Charges / CCTP',
									sourceOrAuthor: documentSource || 'Maîtrise d\'Ouvrage',
									version: documentVersion || 'v1.0',
									summary: factorizationResponse?.summary || 'Synthèse RFP',
									clauses: shredRfpTextToClauses(rfpText)
								},
								initialSubjects: finalSubjects,
								requirementAudit: buildAuditForImport(finalSubjects),
								detectedFrameworks: detectApplicableFrameworks(rfpText)
							});
							onclose();
						}}
						onCancel={() => {
							factorizationResponse = null;
						}}
					/>
				{:else}
					<!-- ─── Écran de Saisie & Configuration Pré-Inférence ───────────── -->
					<div class="space-y-4">
						<!-- Sélecteur de Mode d'Entrée -->
						<div class="space-y-3">
							<div class="flex items-center justify-between">
								<span class="font-bold text-foreground">Source du Document RFP / CCTP :</span>
								<div class="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
									<button
										type="button"
										onclick={() => (inputMode = 'templates')}
										class="px-2.5 py-1 rounded-md transition-colors {inputMode === 'templates'
											? 'bg-background shadow-xs font-bold text-foreground'
											: 'text-muted-foreground hover:text-foreground'}"
									>
										Modèles Pré-intégrés
									</button>
									<button
										type="button"
										onclick={() => (inputMode = 'paste')}
										class="px-2.5 py-1 rounded-md transition-colors {inputMode === 'paste'
											? 'bg-background shadow-xs font-bold text-foreground'
											: 'text-muted-foreground hover:text-foreground'}"
									>
										Coller le texte
									</button>
									<button
										type="button"
										onclick={() => (inputMode = 'url')}
										class="px-2.5 py-1 rounded-md transition-colors {inputMode === 'url'
											? 'bg-background shadow-xs font-bold text-foreground'
											: 'text-muted-foreground hover:text-foreground'}"
									>
										URL Web
									</button>
									<button
										type="button"
										onclick={() => (inputMode = 'file')}
										class="px-2.5 py-1 rounded-md transition-colors {inputMode === 'file'
											? 'bg-background shadow-xs font-bold text-foreground'
											: 'text-muted-foreground hover:text-foreground'}"
									>
										Fichier Local
									</button>
								</div>
							</div>

							<!-- Option 1 : Modèles Pré-intégrés -->
							{#if inputMode === 'templates'}
								<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
									{#each SAMPLE_RFP_TEMPLATES as tmpl}
										{@const isSelected = selectedTemplateId === tmpl.id}
										<button
											type="button"
											data-testid={`template-btn-${tmpl.id}`}
											onclick={() => selectTemplate(tmpl)}
											class="p-3 rounded-xl border text-left transition-all space-y-1 {isSelected
												? 'bg-primary/10 border-primary text-foreground ring-1 ring-primary/30'
												: 'bg-card border-border hover:border-border/80 text-muted-foreground'}"
										>
											<div class="font-bold text-xs text-foreground flex items-center justify-between">
												<span>{tmpl.name}</span>
												{#if isSelected}
													<CheckCircle2 class="h-3.5 w-3.5 text-primary" />
												{/if}
											</div>
											<p class="text-[11px] leading-tight text-muted-foreground line-clamp-2">
												{tmpl.description}
											</p>
										</button>
									{/each}
								</div>
							{/if}

							<!-- Option 2 : Coller le texte -->
							{#if inputMode === 'paste'}
								<div class="p-3 bg-muted/20 border rounded-xl text-muted-foreground">
									Collez le texte intégral du CCTP ou du cahier des charges dans la zone ci-dessous.
								</div>
							{/if}

							<!-- Option 3 : URL Web -->
							{#if inputMode === 'url'}
								<div class="p-3.5 rounded-xl border bg-muted/20 space-y-2">
									<label for="rfp-url-input" class="font-semibold text-foreground block">
										URL du document distant (PDF, HTML, CCTP) :
									</label>
									<div class="flex items-center gap-2">
										<div class="relative flex-1">
											<Globe class="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
											<input
												id="rfp-url-input"
												type="url"
												bind:value={remoteUrl}
												placeholder="https://marchespublics.gouv.fr/cctp-telecom.pdf"
												class="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-xs"
											/>
										</div>
										<button
											type="button"
											onclick={handleFetchUrl}
											disabled={isFetchingUrl || !remoteUrl.trim()}
											class="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
										>
											{#if isFetchingUrl}
												<RefreshCw class="h-3.5 w-3.5 animate-spin" />
												<span>Récupération...</span>
											{:else}
												<span>Télécharger</span>
											{/if}
										</button>
									</div>
									{#if fetchError}
										<div class="text-destructive text-[11px] flex items-center gap-1.5">
											<AlertCircle class="h-3.5 w-3.5" />
											<span>{fetchError}</span>
										</div>
									{/if}
								</div>
							{/if}

							<!-- Option 4 : Fichier Local -->
							{#if inputMode === 'file'}
								<div class="p-4 rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors text-center space-y-2 bg-muted/10">
									<input
										type="file"
										id="rfp-file-input"
										accept=".pdf,.txt,.md,.json"
										onchange={handleFileUpload}
										class="hidden"
									/>
									<label
										for="rfp-file-input"
										class="cursor-pointer flex flex-col items-center justify-center gap-2"
									>
										<div class="p-3 rounded-full bg-primary/10 text-primary">
											<Upload class="h-6 w-6" />
										</div>
										<div class="font-semibold text-foreground">
											Cliquez pour sélectionner un fichier (PDF, Markdown, Texte)
										</div>
										<p class="text-[11px] text-muted-foreground">
											Extraction automatique du calque textuel vectoriel PDF via pdf-parse
										</p>
									</label>

									{#if isParsingFile}
										<div class="text-xs text-primary font-semibold flex items-center justify-center gap-2">
											<RefreshCw class="h-3.5 w-3.5 animate-spin" />
											<span>Extraction du calque textuel en cours...</span>
										</div>
									{/if}

									{#if fileParseSuccess}
										<div class="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-center gap-1.5">
											<CheckCircle2 class="h-3.5 w-3.5" />
											<span>{fileParseSuccess}</span>
										</div>
									{/if}

									{#if fileParseWarning}
										<div class="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/25 flex items-start gap-1.5 text-left">
											<AlertTriangle class="h-4 w-4 shrink-0 mt-0.5" />
											<span>{fileParseWarning}</span>
										</div>
									{/if}

									{#if fileParseError}
										<div class="text-xs text-destructive font-semibold flex items-center justify-center gap-1.5">
											<AlertCircle class="h-3.5 w-3.5" />
											<span>{fileParseError}</span>
										</div>
									{/if}
								</div>
							{/if}
						</div>

						<!-- Métadonnées du Document -->
						<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl border bg-muted/20">
							<div>
								<label for="rfp-doc-title" class="text-[10px] text-muted-foreground font-semibold">Titre du Cahier des Charges</label>
								<input
									id="rfp-doc-title"
									type="text"
									bind:value={documentTitle}
									class="w-full rounded border bg-background px-2.5 py-1.5 text-xs font-semibold"
								/>
							</div>
							<div>
								<label for="rfp-doc-source" class="text-[10px] text-muted-foreground font-semibold">Donneur d'Ordre / Source</label>
								<input
									id="rfp-doc-source"
									type="text"
									bind:value={documentSource}
									class="w-full rounded border bg-background px-2.5 py-1.5 text-xs"
								/>
							</div>
							<div>
								<label for="rfp-doc-ver" class="text-[10px] text-muted-foreground font-semibold">Version</label>
								<input
									id="rfp-doc-ver"
									type="text"
									bind:value={documentVersion}
									class="w-full rounded border bg-background px-2.5 py-1.5 text-xs font-mono"
								/>
							</div>
						</div>

						<!-- Texte brut des exigences -->
						<div>
							<div class="flex items-center justify-between mb-1">
								<label for="rfp-raw-content" class="text-[10px] text-muted-foreground font-semibold">
									Texte complet des exigences et clauses contractuelles :
								</label>
								<span class="text-[10px] text-muted-foreground font-mono">{rfpText.length} caractères</span>
							</div>
							<textarea
								id="rfp-raw-content"
								bind:value={rfpText}
								rows="5"
								class="w-full rounded-xl border bg-background p-3 text-xs font-mono leading-relaxed"
								placeholder="Collez ici les articles, exigences et clauses du CCTP..."
							></textarea>
						</div>

						<!-- ─── Volet de Configuration du Moteur LLM Souverain ─── -->
						<div class="p-3.5 rounded-xl border bg-card space-y-3">
							<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
								<div class="flex items-center gap-2">
									<Cpu class="h-4 w-4 text-primary" />
									<span class="font-bold text-foreground">Serveur d'Inférence Souverain :</span>
									<span class="font-mono text-[11px] text-primary bg-primary/10 px-2 py-0.5 rounded">
										{serverEndpoint}
									</span>
								</div>

								<!-- Sélecteur de Modèle -->
								<div class="flex items-center gap-2">
									<span class="text-[11px] text-muted-foreground">Modèle d'Architecture :</span>
									{#if availableModels.length > 0}
										<select
											bind:value={selectedModel}
											class="rounded-lg border bg-background px-2.5 py-1 text-xs font-mono font-bold text-foreground"
										>
											{#each availableModels as m}
												<option value={m.id}>{m.name || m.id}</option>
											{/each}
										</select>
									{:else}
										<input
											type="text"
											bind:value={selectedModel}
											placeholder="ex: llama3.1, mistral..."
											class="rounded-lg border bg-background px-2.5 py-1 text-xs font-mono font-bold text-foreground w-44"
										/>
									{/if}
								</div>
							</div>

							{#if availableModels.length === 0}
								<div class="text-[11px] text-amber-500 bg-amber-500/10 px-2.5 py-1.5 rounded-lg border border-amber-500/20">
									Aucun modèle détecté automatiquement sur {serverEndpoint}. Vous pouvez saisir le nom du modèle ou démarrer Ollama (`ollama serve`).
								</div>
							{/if}

							<!-- Dépliant : Directives et Prompt Modifiable -->
							<div class="border-t pt-2">
								<button
									type="button"
									onclick={() => (showPromptSettings = !showPromptSettings)}
									class="flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline cursor-pointer"
								>
									{#if showPromptSettings}
										<ChevronDown class="h-3.5 w-3.5" />
									{:else}
										<ChevronRight class="h-3.5 w-3.5" />
									{/if}
									<span>Personnaliser les directives d'orientation du prompt d'architecture (Optionnel)</span>
								</button>

								{#if showPromptSettings}
									<div class="mt-2.5 space-y-2 p-3 rounded-lg bg-muted/20 border animate-in fade-in duration-150">
										<label for="prompt-directives" class="text-[11px] font-semibold text-foreground block">
											Directives particulières de cadrage (ex: insister sur la souveraineté, la résilience, etc.) :
										</label>
										<textarea
											id="prompt-directives"
											bind:value={customPromptDirectives}
											rows="2"
											class="w-full rounded-lg border bg-background p-2 text-xs font-sans leading-relaxed"
											placeholder="Exemple : Accorder une priorité absolue à la conformité SecNumCloud 3.2, au chiffrement ANSSI et au mode autonome déconnecté..."
										></textarea>

										<div class="text-[10px] text-muted-foreground italic">
											Ces directives seront injectées directement dans le prompt système du modèle avant la factorisation.
										</div>
									</div>
								{/if}
							</div>
						</div>

						{#if factorizationError || interruptedRunId}
							<div class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-3 shadow-sm">
								<div class="flex items-start gap-2">
									<AlertTriangle class="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
									<div>
										<strong>{factorizationError ? "État de l'analyse :" : "Reprise disponible :"}</strong> {factorizationError || "Cette analyse a été interrompue et peut être reprise."}
										<div class="text-[11px] text-muted-foreground mt-0.5">Les étapes déjà calculées sont conservées en mémoire cache sans surcoût.</div>
									</div>
								</div>
								{#if interruptedRunId}
									<button
										type="button"
										onclick={() => resumeRun(interruptedRunId!)}
										disabled={isFactorizing}
										class="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
									>
										<RefreshCw class="h-3.5 w-3.5" />
										Reprendre l'analyse
									</button>
								{/if}
							</div>
						{/if}

						<!-- ─── Rapport d'Extraction & Échantillon de Vérification Humaine ── -->
						{#if rfpText.trim() && !isParsingFile}
							<RfpExtractionVerification
								rawText={rfpText}
								clauses={shredRfpTextToClauses(rfpText)}
								pages={extractedPages}
								actorEmail={actorEmail}
								bind:validation={extractionValidation}
								onValidated={(val) => { extractionValidation = val; }}
							/>
						{/if}

						<!-- ─── Boutons d'Action Principale ────────────────────────────── -->
						<div class="space-y-2 pt-1">
							<!-- 1. Bouton Majeur : Factorisation Sémantique par LLM Souverain -->
							<button
								type="button"
								onclick={runLlmFactorization}
								disabled={isFactorizing || isParsingFile || !rfpText.trim()}
								class="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary/85 text-primary-foreground font-bold shadow-md hover:opacity-95 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{#if isFactorizing}
									<RefreshCw class="h-4 w-4 animate-spin" />
									<span>Factorisation en cours{selectedModel ? ` (${selectedModel})` : ''}...</span>
								{:else}
									<Sparkles class="h-4 w-4 text-amber-300" />
									<span>Factoriser en 8-12 Sujets d'Architecture{selectedModel ? ` (${selectedModel.toLowerCase().startsWith('claude') ? 'Claude Anthropic' : 'LLM Souverain'} - ${selectedModel})` : ''}</span>
								{/if}
							</button>

							{#if isFactorizing}
								<div class="p-3.5 rounded-xl border bg-primary/5 border-primary/20 space-y-2 animate-in fade-in duration-200">
									<div class="flex items-center justify-between text-xs">
										<span class="font-bold text-foreground flex items-center gap-1.5">
											<RefreshCw class="h-3.5 w-3.5 animate-spin text-primary" />
											Inférence LLM en cours{selectedModel ? ` (${selectedModel})` : ''}
										</span>
										<span class="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary">
											{factorizeSeconds}s écoulées
										</span>
									</div>
									<div class="text-[11px] text-muted-foreground flex items-center gap-2">
										<span class="inline-block w-2 h-2 rounded-full bg-primary animate-pulse"></span>
										{#if activeProgress}
											<span>
												{activeProgress.label}{#if activeProgress.stage !== 'partition'} — {activeProgress.done}/{activeProgress.total}{/if}
											</span>
										{:else}
											<span>Préparation de l'analyse…</span>
										{/if}
									</div>
									{#if activeProgress && activeProgress.total > 0 && activeProgress.stage !== 'partition'}
										<div class="h-1.5 rounded-full bg-primary/10 overflow-hidden">
											<div class="h-full bg-primary transition-all" style="width: {Math.round((activeProgress.done / activeProgress.total) * 100)}%"></div>
										</div>
									{/if}
									{#if activeRunHasPartial}
										<button
											type="button"
											onclick={showActiveRunPartial}
											class="px-2 py-1 rounded-md border text-[11px] font-semibold hover:bg-muted/40 cursor-pointer"
										>
											Afficher l'état actuel de l'analyse
										</button>
									{/if}
									<p class="text-[10px] text-muted-foreground/80 italic border-t pt-1.5">
										Le calcul se poursuit côté serveur : vous pouvez fermer cette fenêtre ou recharger la page, le suivi reprendra à la réouverture.
										Traces détaillées dans les logs du serveur.
									</p>
								</div>
							{/if}

							<!-- Factorisations persistées côté serveur -->
							<div class="rounded-xl border bg-muted/10">
								<button
									type="button"
									data-testid="btn-toggle-persisted-runs"
									onclick={togglePersistedRuns}
									class="w-full px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-2 cursor-pointer"
								>
									{#if showPersistedRuns}
										<ChevronDown class="h-3.5 w-3.5" />
									{:else}
										<ChevronRight class="h-3.5 w-3.5" />
									{/if}
									<Server class="h-3.5 w-3.5" />
									<span>Factorisations enregistrées</span>
								</button>
								{#if showPersistedRuns}
									<div class="px-3 pb-3 space-y-1.5">
										{#if persistedRunsError}
											<div class="text-[11px] text-destructive">{persistedRunsError}</div>
										{/if}
										{#if persistedRuns.length === 0 && !persistedRunsError}
											<div class="text-[11px] text-muted-foreground italic">Aucune factorisation enregistrée.</div>
										{/if}
										{#each persistedRuns as run (run.id)}
											<div class="flex items-center justify-between gap-2 text-[11px] border-t pt-1.5">
												<div class="min-w-0">
													<div class="font-semibold text-foreground truncate">{run.documentTitle || 'Sans titre'}</div>
													<div class="text-muted-foreground">
														{new Date(run.startedAt).toLocaleString('fr-FR')} · {run.model} · {run.clauseCount} clauses ·
														{#if run.status === 'running'}
															en cours{#if run.progress} ({run.progress.label}{#if run.progress.stage !== 'partition'} {run.progress.done}/{run.progress.total}{/if}){/if}
														{:else if run.status === 'ok'}
															{run.subjectCount ?? 0} sujets
														{:else if run.status === 'partial'}
															partiel, {run.subjectCount ?? 0} sujets
														{:else if run.status === 'interrupted'}
															interrompue{#if run.progress} à l'étape « {run.progress.label} »{/if}
														{:else}
															échec
														{/if}
														</div>
														</div>
														<div class="shrink-0 flex gap-1">
															{#if run.status === 'running' && activeRunId !== run.id}
																<button
																	type="button"
																	onclick={() => { showPersistedRuns = false; void followRun(run.id); }}
																	class="px-2 py-1 rounded-md border text-[11px] font-semibold hover:bg-muted/40 cursor-pointer"
																>
																	Suivre
																</button>
															{/if}
															{#if RESUMABLE.includes(run.status)}
																<button
																	type="button"
																	onclick={() => resumeRun(run.id)}
																	disabled={isFactorizing}
																	class="px-2 py-1 rounded-md border text-[11px] font-semibold hover:bg-muted/40 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
																>
																	Reprendre
																</button>
															{/if}
															<button
																type="button"
																onclick={() => loadPersistedRun(run.id)}
																disabled={run.subjectCount === null || loadingRunId !== null}
																class="px-2 py-1 rounded-md border text-[11px] font-semibold hover:bg-muted/40 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
															>
																{loadingRunId === run.id ? 'Chargement…' : run.status === 'running' ? 'État actuel' : 'Charger'}
															</button>
														</div>
											</div>
										{/each}
									</div>
								{/if}
							</div>

							<!-- 2. Bouton Secondaire : Dépouillement Brut Clause-par-Clause -->
							<button
								type="button"
								data-testid="btn-run-shred-and-confront"
								onclick={runShredAndConfront}
								disabled={isAnalyzing || isParsingFile || !rfpText.trim()}
								class="w-full py-2 rounded-xl border bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted/40 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
							>
								{#if isAnalyzing}
									<RefreshCw class="h-3.5 w-3.5 animate-spin" />
									<span>Dépouillement analytique en cours...</span>
								{:else}
									<Layers class="h-3.5 w-3.5" />
									<span>Dépouillement Brut Clause-par-Clause (Mode Analytique Historique)</span>
								{/if}
							</button>
						</div>
					</div>

					<!-- ─── Résultat de la Confrontation Historique Clause-par-Clause ─── -->
					{#if confrontationResult}
						<div class="space-y-4 pt-4 border-t animate-in fade-in duration-150">
							<div class="p-4 rounded-xl border bg-card shadow-xs space-y-3">
								<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
									<h3 class="font-bold text-sm text-foreground flex items-center gap-2">
										<Sparkles class="h-4 w-4 text-primary" />
										<span>Résultat de Confrontation au Patrimoine</span>
									</h3>
									<div class="flex items-center gap-2">
										<span class="text-xs font-semibold text-muted-foreground">Taux de conformité immédiate :</span>
										<span class="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold font-mono">
											{confrontationResult.stats.complianceRate}%
										</span>
									</div>
								</div>

								<div class="grid grid-cols-1 sm:grid-cols-4 gap-2 text-center">
									<div class="p-2 rounded-lg border bg-muted/30">
										<div class="text-base font-bold font-mono text-foreground">
											{confrontationResult.stats.totalClauses}
										</div>
										<div class="text-[10px] text-muted-foreground">Exigences Dépouillées</div>
									</div>
									<div class="p-2 rounded-lg border bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
										<div class="text-base font-bold font-mono">
											{confrontationResult.stats.compliantCount}
										</div>
										<div class="text-[10px]">Conformes au Patrimoine</div>
									</div>
									<div class="p-2 rounded-lg border bg-destructive/10 border-destructive/20 text-destructive">
										<div class="text-base font-bold font-mono">
											{confrontationResult.stats.conflictCount}
										</div>
										<div class="text-[10px]">Conflits / Déviations</div>
									</div>
									<div class="p-2 rounded-lg border bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300">
										<div class="text-base font-bold font-mono">
											{confrontationResult.stats.gapCount}
										</div>
										<div class="text-[10px]">Écarts à Délibérer</div>
									</div>
								</div>
							</div>

							<div class="space-y-2">
								<h4 class="font-bold text-foreground">Matrice des Exigences & Alignement Doctrinal</h4>
								<div class="space-y-2 max-h-64 overflow-y-auto pr-1">
									{#each confrontationResult.confrontations as conf}
										{@const similar = similarAssetsByClause[conf.id]}
										{@const confirmation = clauseReuseConfirmations[conf.id]}
										{@const reused = confirmation?.outcome === 'reused' || confirmation?.outcome === 'reused_with_exception'}
										<div
											class="p-3 rounded-xl border space-y-1.5 transition-colors {conf.status === 'compliant'
												? 'bg-emerald-500/5 border-emerald-500/30'
												: conf.status === 'conflict'
													? 'bg-destructive/5 border-destructive/30'
													: 'bg-amber-500/5 border-amber-500/30'}"
										>
											<div class="flex items-center justify-between gap-2">
												<div class="flex items-center gap-2 font-bold">
													<span class="font-mono text-primary text-[11px]">{conf.clauseRef}</span>
													<span class="text-foreground">{conf.title}</span>
												</div>
												<div class="flex items-center gap-1.5">
													{#if conf.status === 'compliant'}
														<span class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold">
															<CheckCircle2 class="h-3 w-3" />
															{reused ? 'Conforme (Réutilisé)' : 'Conforme'}
														</span>
													{:else if conf.status === 'conflict'}
														<span class="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20 px-2 py-0.5 text-[10px] font-bold">
															<AlertTriangle class="h-3 w-3" />
															Conflit Détecté
														</span>
													{:else}
														<span class="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 px-2 py-0.5 text-[10px] font-bold">
															<HelpCircle class="h-3 w-3" />
															Écart à Délibérer
														</span>
													{/if}
												</div>
											</div>

											<p class="text-[11px] text-muted-foreground leading-relaxed">
												"{conf.text}"
											</p>

											<div class="p-2 rounded-lg bg-background/80 border text-[11px] space-y-0.5">
												<div class="font-semibold text-foreground">
													{conf.rationale}
												</div>
												<div class="text-[10px] text-muted-foreground flex items-center justify-between">
													<span>Action : {conf.proposedEpistemicAction}</span>
													{#if conf.matchedDocumentTitle}
														<span class="font-mono text-primary">Réf: {conf.matchedDocumentTitle}</span>
													{/if}
												</div>
											</div>

											{#if similar}
												<div
													data-testid={`similarity-badge-${conf.id}`}
													class="p-2.5 rounded-lg border bg-blue-500/5 border-blue-500/25 text-xs space-y-2 mt-2"
												>
													<div class="flex items-center justify-between gap-2 flex-wrap">
														<div class="flex items-center gap-1.5 font-semibold text-foreground">
															<BrainCircuit class="h-4 w-4 text-blue-500 shrink-0" />
															<span>Actif proche détecté :</span>
															<span class="font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
																{similar.item.ref}
															</span>
															<span class="text-muted-foreground font-normal">({similar.item.title})</span>
														</div>
														<span
															class="px-2 py-0.5 rounded text-[10px] font-bold uppercase {similar.item.zone === 'strong'
																? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
																: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30'}"
														>
															Zone : {similar.item.zone === 'strong' ? 'Forte' : 'Possible'} ({(similar.item.score * 100).toFixed(0)}%)
														</span>
													</div>

													{#if confirmation && !reused}
														<div
															data-testid={`reuse-refused-notice-${conf.id}`}
															class="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-[11px]"
														>
															<strong>
																{confirmation.outcome === 'deferred'
																	? 'Réutilisation reportée'
																	: 'Réutilisation refusée'} : la question reste ouverte
															</strong>
															({confirmation.outcome}){confirmation.comment ? ` — « ${confirmation.comment} »` : ''}
														</div>
													{/if}
													{#if reused}
														<div
															data-testid={`reuse-confirmed-badge-${conf.id}`}
															class="p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 flex items-center justify-between text-[11px]"
														>
															<div class="flex items-center gap-1.5 font-semibold">
																<CheckCircle2 class="h-3.5 w-3.5 text-emerald-600 shrink-0" />
																<span>✓ Validé par {confirmation.actor} ({confirmation.outcome})</span>
															</div>
															<span class="text-[10px] text-muted-foreground font-mono">
																{confirmation.assumptions.length} hypothèse{confirmation.assumptions.length > 1 ? 's' : ''} vérifiée{confirmation.assumptions.length > 1 ? 's' : ''}
															</span>
														</div>
													{:else}
														<div class="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
															<div class="text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
																<ShieldCheck class="h-3.5 w-3.5 shrink-0" />
																<span><strong>Confirmation obligatoire (D8) :</strong> jamais de réutilisation silencieuse</span>
															</div>
															<button
																type="button"
																data-testid={`btn-review-hypotheses-${conf.id}`}
																onclick={() => openReuseModal(conf, similar)}
																class="px-3 py-1 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
															>
																<span>Examiner les hypothèses</span>
																<ArrowRight class="h-3 w-3" />
															</button>
														</div>
													{/if}
												</div>
											{/if}
										</div>
									{/each}
								</div>
							</div>

							{#if confrontationResult.suggestedInitialSubjects.length > 0}
								<div class="p-3.5 rounded-xl border bg-primary/5 border-primary/20 space-y-2">
									<label class="flex items-start gap-2.5 cursor-pointer">
										<input
											type="checkbox"
											bind:checked={autoGenerateSubjects}
											class="mt-1 rounded text-primary"
										/>
										<div>
											<strong class="text-xs text-foreground block">
												Injecter les {confrontationResult.suggestedInitialSubjects.length} sujets dérivés des écarts/conflits
											</strong>
											<span class="text-[11px] text-muted-foreground block">
												Ouvre les controverses au tableau de maturité pour chaque exigence non standard.
											</span>
										</div>
									</label>
								</div>
							{/if}
						</div>
					{/if}
				{/if}
			</div>

			<!-- ─── Footer (affiché uniquement si pas d'écran de factorisation actif) ── -->
			{#if !factorizationResponse}
				<div class="p-4 border-t bg-muted/20 flex items-center justify-between text-xs">
					<button
						type="button"
						onclick={onclose}
						class="px-4 py-1.5 rounded-lg border bg-background hover:bg-muted font-semibold transition-colors cursor-pointer"
					>
						Annuler
					</button>

					<button
						type="button"
						onclick={handleConfirmImportClauseByClause}
						disabled={!confrontationResult}
						class="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
					>
						<Check class="h-4 w-4" />
						<span>Valider & Intégrer au Projet (Mode Analytique)</span>
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

{#if isReuseModalOpen && selectedSimilarAsset}
	<ReuseConfirmationModal
		isOpen={isReuseModalOpen}
		subjectLabel={selectedClauseForReuse?.title || ''}
		subjectFingerprint={selectedFingerprint}
		asset={selectedSimilarAsset}
		actorEmail={actorEmail}
		onConfirm={handleReuseConfirmed}
		onClose={() => (isReuseModalOpen = false)}
	/>
{/if}

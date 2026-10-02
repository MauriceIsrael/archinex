<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import {
		shredRfpTextToClauses,
		confrontClausesWithKnowledgeBase,
		SAMPLE_RFP_TEMPLATES,
		type RfpConfrontationResult,
		type ClauseConfrontation
	} from '$lib/domain/rfpConfrontation';
	import type { UpstreamDocInput, InitialSubjectInput } from '$lib/domain/engagements';
	import type { LocalLlmModel, RfpFactorizationResponse } from '$lib/domain/factorization';
	import RfpFactorizationReview from './RfpFactorizationReview.svelte';
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
		}) => void;
		actorEmail?: string;
	}

	let { open = $bindable(false), onclose, onImported, actorEmail = 'lead@archinex.local' }: Props = $props();

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

	// Confrontation classique clause-par-clause
	let isAnalyzing = $state<boolean>(false);
	let confrontationResult = $state<RfpConfrontationResult | null>(null);
	let autoGenerateSubjects = $state<boolean>(true);

	// Factorisation sémantique par LLM Local Souverain
	let isFactorizing = $state<boolean>(false);
	let factorizationResponse = $state<RfpFactorizationResponse | null>(null);
	let factorizationError = $state<string | null>(null);

	// Modèles et configuration locale (LLM Local)
	let availableModels = $state<LocalLlmModel[]>([
		{ id: 'ministral:latest', name: 'ministral:latest (Ministral 14B Reasoning - 256k)' },
		{ id: 'qwen2.5-coder:14b', name: 'qwen2.5-coder:14b (Qwen 14.8B Coder)' }
	]);
	let selectedModel = $state<string>('ministral:latest');
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
						if (data.defaultModel) selectedModel = data.defaultModel;
					}
					if (data.serverEndpoint) serverEndpoint = data.serverEndpoint;
					if (data.defaultSystemPrompt) defaultSystemPrompt = data.defaultSystemPrompt;
					serverAvailable = data.available ?? true;
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
					fileParseSuccess = `Fichier textuel chargé avec succès (${content.length.toLocaleString('fr-FR')} caractères).`;
				}
			};
			reader.onerror = () => {
				fileParseError = 'Erreur lors de la lecture locale du fichier texte';
			};
			reader.readAsText(file);
		}
	}

	// 1. Déclenche la Factorisation Sémantique par LLM Local Souverain
	async function runLlmFactorization() {
		if (!rfpText.trim()) return;
		isFactorizing = true;
		factorizationError = null;
		confrontationResult = null;

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
					documentTitle
				})
			});

			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.message || `Erreur lors de la factorisation (${res.status})`);
			}

			const data: RfpFactorizationResponse = await res.json();
			factorizationResponse = data;
		} catch (err: unknown) {
			factorizationError = err instanceof Error ? err.message : 'Échec de la factorisation';
		} finally {
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
								'Content-Type': 'application/json',
								'x-actor-email': actorEmail
							},
							body: JSON.stringify({
								query_text: `${conf.title}. ${conf.text}`,
								top_k: 3
							})
						});
						if (!res.ok) return null;
						const jsonRes = await res.json();
						const top = jsonRes.data?.results?.[0];
						if (top && (top.zone === 'strong' || top.zone === 'possible')) {
							return {
								confId: conf.id,
								item: top,
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
							<span
								class="inline-flex items-center gap-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 px-2 py-0.5 text-[10px] font-semibold"
							>
								<ShieldCheck class="h-3 w-3" />
								Air-Gap Souverain ({serverEndpoint})
							</span>
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
					<RfpFactorizationReview
						subjects={factorizationResponse.subjects}
						clauses={shredRfpTextToClauses(rfpText)}
						modelUsed={factorizationResponse.modelUsed}
						engine={factorizationResponse.engine}
						summary={factorizationResponse.summary}
						coverageRate={factorizationResponse.coverageRate}
						onConfirm={(finalSubjects) => {
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
								initialSubjects: finalSubjects
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
									<select
										bind:value={selectedModel}
										class="rounded-lg border bg-background px-2.5 py-1 text-xs font-mono font-bold text-foreground"
									>
										{#each availableModels as m}
											<option value={m.id}>{m.name || m.id}</option>
										{/each}
									</select>
								</div>
							</div>

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

						{#if factorizationError}
							<div class="p-3 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive text-xs flex items-start gap-2">
								<AlertTriangle class="h-4 w-4 shrink-0 mt-0.5" />
								<div>
									<strong>Erreur de factorisation :</strong> {factorizationError}
								</div>
							</div>
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
									<span>Factorisation en cours sur le LLM local ({selectedModel})...</span>
								{:else}
									<Sparkles class="h-4 w-4 text-amber-300" />
									<span>Factoriser en 8-12 Sujets d'Architecture via LLM Souverain ({selectedModel})</span>
								{/if}
							</button>

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
															{confirmation ? 'Conforme (Réutilisé)' : 'Conforme'}
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

													{#if confirmation}
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

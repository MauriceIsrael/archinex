<script lang="ts">
	import type { ExtractedClause } from '$lib/domain/corpus';
	import {
		computeExtractionReport,
		generateVerificationSample,
		createHumanValidationRecord,
		type ExtractionReport,
		type VerificationSampleItem,
		type HumanExtractionValidation
	} from '$lib/domain/rfpExtractionReport';
	import {
		AlertTriangle,
		AlertCircle,
		CheckCircle2,
		FileText,
		ShieldCheck,
		Check,
		ChevronDown,
		ChevronRight,
		Info,
		Layers,
		Sparkles,
		Eye,
		Flag
	} from 'lucide-svelte';

	interface Props {
		rawText: string;
		clauses: ExtractedClause[];
		pages?: Array<{ pageNumber: number; text: string }>;
		actorEmail?: string;
		validation: HumanExtractionValidation | null;
		onValidated: (val: HumanExtractionValidation) => void;
	}

	let {
		rawText,
		clauses,
		pages,
		actorEmail = '',
		validation = $bindable(null),
		onValidated
	}: Props = $props();

	// Calcul réactif du rapport d'extraction
	let report = $derived<ExtractionReport>(computeExtractionReport(rawText, clauses, pages));

	// Génération de l'échantillon à vérifier
	let sampleItems = $state<VerificationSampleItem[]>([]);
	let selectedIndex = $state<number>(0);
	let showAllAnomalies = $state<boolean>(false);
	let validationNotes = $state<string>('');

	// Régénération de l'échantillon quand les clauses ou le rapport changent
	$effect(() => {
		if (clauses.length > 0) {
			const items = generateVerificationSample(report, clauses, undefined, 10);
			sampleItems = items;
			selectedIndex = 0;
		}
	});

	let currentItem = $derived<VerificationSampleItem | undefined>(sampleItems[selectedIndex]);

	function acceptItem(index: number) {
		if (sampleItems[index]) {
			sampleItems[index].status = 'accepted';
		}
	}

	function flagItem(index: number) {
		if (sampleItems[index]) {
			sampleItems[index].status = 'flagged';
		}
	}

	function acceptAllSample() {
		for (const item of sampleItems) {
			item.status = 'accepted';
		}
		confirmValidation();
	}

	function confirmValidation() {
		const rec = createHumanValidationRecord({
			validated: true,
			validatedBy: actorEmail || 'architecte@archinex.local',
			sample: sampleItems,
			report,
			notes: validationNotes.trim() || undefined
		});
		validation = rec;
		onValidated(rec);
	}

	function resetValidation() {
		validation = null;
		for (const item of sampleItems) {
			item.status = 'pending';
		}
	}
</script>

<div class="space-y-4 rounded-xl border bg-card p-4 shadow-xs">
	<!-- ─── En-tête du Rapport d'Extraction ──────────────────────────────────────── -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
		<div class="flex items-center gap-2.5">
			<div class="p-2 rounded-lg bg-primary/10 text-primary">
				<FileText class="h-5 w-5" />
			</div>
			<div>
				<h3 class="font-bold text-sm text-foreground flex items-center gap-2">
					<span>Rapport d'Extraction & Découpage du RFP</span>
					<span
						class="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold {
							report.qualityScore >= 80
								? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
								: report.qualityScore >= 50
									? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
									: 'bg-destructive/15 text-destructive border border-destructive/30'
						}"
					>
						Qualité découpage : {report.qualityScore}/100
					</span>
				</h3>
				<p class="text-[11px] text-muted-foreground">
					{report.clauseCount.toLocaleString('fr-FR')} exigences identifiées sur {report.pageCount} page{report.pageCount > 1 ? 's' : ''} · Couverture textuelle : <strong class="text-foreground">{report.coverageRate}%</strong>
				</p>
			</div>
		</div>

		{#if validation?.validated}
			<div class="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 px-3 py-1.5 rounded-xl text-xs font-semibold">
				<ShieldCheck class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
				<span>Découpage validé par un humain</span>
				<button
					type="button"
					onclick={resetValidation}
					class="text-[10px] underline ml-2 opacity-80 hover:opacity-100 cursor-pointer"
				>
					Modifier
				</button>
			</div>
		{:else}
			<div class="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-xl">
				<AlertTriangle class="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
				<span>Vérification requise avant audit</span>
			</div>
		{/if}
	</div>

	<!-- ─── Métriques Clés d'Extraction ─────────────────────────────────────────── -->
	<div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
		<div class="p-2.5 rounded-lg border bg-muted/30 space-y-0.5">
			<div class="text-[10px] text-muted-foreground uppercase font-semibold">Exigences</div>
			<div class="text-lg font-bold font-mono text-foreground">{report.clauseCount}</div>
			<div class="text-[10px] text-muted-foreground">
				{report.detectedPatterns[0]?.prefix || 'Art.'} (dominant)
			</div>
		</div>

		<div class="p-2.5 rounded-lg border bg-muted/30 space-y-0.5">
			<div class="text-[10px] text-muted-foreground uppercase font-semibold">Pages Source</div>
			<div class="text-lg font-bold font-mono text-foreground">{report.pageCount}</div>
			<div class="text-[10px] text-muted-foreground">
				{report.pagesWithoutClauses.length > 0 ? `${report.pagesWithoutClauses.length} sans exigence` : 'Toutes couvertes'}
			</div>
		</div>

		<div class="p-2.5 rounded-lg border bg-muted/30 space-y-0.5">
			<div class="text-[10px] text-muted-foreground uppercase font-semibold">Couverture Texte</div>
			<div class="text-lg font-bold font-mono {report.coverageRate < 60 ? 'text-amber-600' : 'text-emerald-600'}">
				{report.coverageRate}%
			</div>
			<div class="h-1 rounded-full bg-muted overflow-hidden mt-1">
				<div
					class="h-full {report.coverageRate < 60 ? 'bg-amber-500' : 'bg-emerald-500'}"
					style="width: {report.coverageRate}%"
				></div>
			</div>
		</div>

		<div class="p-2.5 rounded-lg border bg-muted/30 space-y-0.5">
			<div class="text-[10px] text-muted-foreground uppercase font-semibold">Anomalies Détectées</div>
			<div class="text-lg font-bold font-mono {report.anomalies.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'}">
				{report.anomalies.length}
			</div>
			<div class="text-[10px] text-muted-foreground">
				{report.gaps.length} trou(s), {report.duplicates.length} doublon(s)
			</div>
		</div>
	</div>

	<!-- ─── Alertes et Anomalies Explicites ─────────────────────────────────────── -->
	{#if report.anomalies.length > 0}
		<div class="space-y-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
					<AlertTriangle class="h-4 w-4 text-amber-600 dark:text-amber-400" />
					<span>Points d'attention & anomalies de découpage ({report.anomalies.length})</span>
				</div>
				<button
					type="button"
					onclick={() => (showAllAnomalies = !showAllAnomalies)}
					class="text-[11px] text-amber-800 dark:text-amber-300 hover:underline flex items-center gap-1 cursor-pointer font-medium"
				>
					<span>{showAllAnomalies ? 'Masquer' : 'Voir le détail'}</span>
					{#if showAllAnomalies}
						<ChevronDown class="h-3.5 w-3.5" />
					{:else}
						<ChevronRight class="h-3.5 w-3.5" />
					{/if}
				</button>
			</div>

			<ul class="space-y-1.5 text-xs">
				{#each showAllAnomalies ? report.anomalies : report.anomalies.slice(0, 3) as anomaly (anomaly.id)}
					<li class="flex items-start gap-2 bg-background/80 p-2 rounded-lg border border-amber-500/20">
						<span
							class="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded font-bold shrink-0 mt-0.5 {
								anomaly.severity === 'warning'
									? 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
									: 'bg-blue-500/20 text-blue-800 dark:text-blue-300'
							}"
						>
							{anomaly.type.replace('_', ' ')}
						</span>
						<div class="space-y-0.5">
							<div class="font-semibold text-foreground text-[11px]">{anomaly.label}</div>
							<div class="text-[11px] text-muted-foreground">{anomaly.details}</div>
						</div>
					</li>
				{/each}
				{#if !showAllAnomalies && report.anomalies.length > 3}
					<li class="text-[11px] text-muted-foreground italic pl-2">
						+ {report.anomalies.length - 3} autre{report.anomalies.length - 3 > 1 ? 's' : ''} anomalie{report.anomalies.length - 3 > 1 ? 's' : ''}...
					</li>
				{/if}
			</ul>
		</div>
	{/if}

	<!-- ─── Échantillon de Vérification Humaine (Côte-à-Côte) ────────────────────── -->
	<div class="space-y-3 pt-2">
		<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
			<div>
				<h4 class="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
					<span>Échantillon de vérification humaine</span>
					<span class="text-[10px] font-mono px-2 py-0.2 bg-muted rounded-full">
						{sampleItems.length} clauses sélectionnées
					</span>
				</h4>
				<p class="text-[11px] text-muted-foreground">
					Examinez les anomalies prioritaires et des clauses de contrôle côte à côte avec la page source du PDF.
				</p>
			</div>

			{#if !validation?.validated}
				<button
					type="button"
					onclick={acceptAllSample}
					class="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 flex items-center gap-1.5 cursor-pointer shadow-xs"
				>
					<Check class="h-3.5 w-3.5" />
					<span>Valider tout l'échantillon</span>
				</button>
			{/if}
		</div>

		<!-- Sélecteur d'item dans l'échantillon -->
		<div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
			{#each sampleItems as item, idx (item.id)}
				<button
					type="button"
					onclick={() => (selectedIndex = idx)}
					class="px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-1 border {
						selectedIndex === idx
							? 'bg-primary text-primary-foreground border-primary'
							: item.status === 'accepted'
								? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border-emerald-500/30'
								: item.status === 'flagged'
									? 'bg-destructive/10 text-destructive border-destructive/30'
									: 'bg-muted/40 hover:bg-muted text-muted-foreground border-transparent'
					}"
				>
					{#if item.status === 'accepted'}
						<Check class="h-3 w-3" />
					{:else if item.status === 'flagged'}
						<Flag class="h-3 w-3" />
					{:else if item.isAnomaly}
						<AlertCircle class="h-3 w-3 text-amber-500" />
					{/if}
					<span>{item.clauseRef}</span>
				</button>
			{/each}
		</div>

		<!-- Vue Côte-à-Côte : Clause Découpée vs Page Source -->
		{#if currentItem}
			<div class="grid grid-cols-1 md:grid-cols-2 gap-3 border rounded-xl p-3 bg-muted/15">
				<!-- Colonne Gauche : Clause Découpée -->
				<div class="space-y-2 flex flex-col justify-between">
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<span class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
								<Layers class="h-3 w-3" />
								Clause Extraite ({selectedIndex + 1}/{sampleItems.length})
							</span>
							{#if currentItem.pageNumber}
								<span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
									Page {currentItem.pageNumber}
								</span>
							{/if}
						</div>

						<div class="p-2.5 rounded-lg bg-background border space-y-1.5">
							<div class="flex items-center gap-2">
								<span class="font-mono text-xs font-bold text-primary">{currentItem.clauseRef}</span>
								<span class="text-xs font-semibold text-foreground line-clamp-1">{currentItem.title}</span>
							</div>

							{#if currentItem.isAnomaly}
								<div class="space-y-1 pt-1">
									{#each currentItem.anomalyReasons as reason}
										<div class="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
											⚠ {reason}
										</div>
									{/each}
								</div>
							{/if}

							<div class="text-xs text-muted-foreground leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap font-sans pt-1">
								{currentItem.text || '(Aucun corps de texte rattaché)'}
							</div>
						</div>
					</div>

					<!-- Actions sur cette clause -->
					<div class="flex items-center justify-between pt-2 border-t text-xs">
						<div class="flex items-center gap-2">
							<span class="text-[11px] text-muted-foreground">Statut :</span>
							<span
								class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold {
									currentItem.status === 'accepted'
										? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
										: currentItem.status === 'flagged'
											? 'bg-destructive/15 text-destructive'
											: 'bg-muted text-muted-foreground'
								}"
							>
								{currentItem.status === 'accepted' ? 'Acceptée' : currentItem.status === 'flagged' ? 'Signalée' : 'À examiner'}
							</span>
						</div>

						<div class="flex items-center gap-1.5">
							<button
								type="button"
								onclick={() => flagItem(selectedIndex)}
								class="px-2 py-1 rounded border border-destructive/30 text-destructive text-[11px] font-semibold hover:bg-destructive/10 cursor-pointer flex items-center gap-1"
							>
								<Flag class="h-3 w-3" />
								<span>Signaler</span>
							</button>
							<button
								type="button"
								onclick={() => acceptItem(selectedIndex)}
								class="px-2.5 py-1 rounded bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 cursor-pointer flex items-center gap-1"
							>
								<Check class="h-3 w-3" />
								<span>Confirmer</span>
							</button>
						</div>
					</div>
				</div>

				<!-- Colonne Droite : Page Source du PDF -->
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
							<Eye class="h-3 w-3" />
							Page Source du Document {#if currentItem.pageNumber}(Page {currentItem.pageNumber}){/if}
						</span>
						<span class="text-[10px] text-muted-foreground italic">Calque textuel extrait</span>
					</div>

					<div class="p-2.5 rounded-lg bg-background border font-mono text-[11px] leading-relaxed text-muted-foreground max-h-64 overflow-y-auto whitespace-pre-wrap select-all">
						{currentItem.sourceExcerpt}
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- ─── Confirmation Globale de l'Audit ────────────────────────────────────── -->
	{#if !validation?.validated}
		<div class="pt-2 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3">
			<div class="text-[11px] text-muted-foreground">
				En confirmant, vous attestez avoir vérifié la régularité du découpage sur cet échantillon.
			</div>
			<button
				type="button"
				onclick={confirmValidation}
				class="py-2 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs shadow-xs hover:opacity-95 flex items-center justify-center gap-1.5 cursor-pointer"
			>
				<ShieldCheck class="h-4 w-4" />
				<span>Valider le découpage & Activer l'audit</span>
			</button>
		</div>
	{/if}
</div>


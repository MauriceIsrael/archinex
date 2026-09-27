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
		Check
	} from 'lucide-svelte';

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
						Provisoire (L0-L2)
					</span>
				{:else}
					<span class="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
						Acté & Tranché (L3+)
					</span>
				{/if}
				<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
					{activeSubject?.level || draft?.maturity}
				</span>
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
		<div class="flex items-center gap-1.5 shrink-0">
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
						<div class="bg-background rounded-lg p-3 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
							<CheckCircle2 class="h-4 w-4 shrink-0 text-emerald-600" />
							<span>Ce sujet a été tranché au niveau <strong>L3_decided</strong>. Les bloquants aval sont levés.</span>
						</div>
					{/if}
				</div>

				<!-- 2. LES ALTERNATIVES EN COMPÉTITION (COMPARATIF CÔTE À CÔTE) -->
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
							<Split class="h-4 w-4 text-primary" />
							<span>Les Alternatives en Compétition</span>
						</span>
						<span class="text-[11px] text-muted-foreground">Arbitrage d'architecture</span>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
						<!-- ALTERNATIVE A : OPTION RETENUE / CCTP -->
						<div class="rounded-xl border border-primary/30 bg-primary/[0.03] p-3.5 space-y-3 flex flex-col justify-between shadow-2xs">
							<div class="space-y-2">
								<div class="flex items-center justify-between">
									<span class="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary uppercase">
										Option A (Retenue CCTP)
									</span>
									{#if draft.suppose[0]?.cost_hint}
										<span class="font-mono text-[11px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
											{draft.suppose[0].cost_hint}
										</span>
									{/if}
								</div>

								<h4 class="text-xs font-bold text-foreground">
									{#if draft.retenu.length > 0}
										{draft.retenu[0]}
									{:else if draft.suppose.length > 0}
										{draft.suppose[0].text}
									{:else}
										Spécification de référence
									{/if}
								</h4>

								<p class="text-[11px] text-muted-foreground leading-relaxed">
									{#if draft.suppose.length > 0}
										{draft.suppose[0].consequence}
									{:else}
										Conformité directe avec les exigences contractuelles du client.
									{/if}
								</p>
							</div>

							<div class="pt-2 border-t">
								<button
									type="button"
									onclick={() => deliberationStore.arbitrateSubject(deliberationStore.activeSubjectId)}
									class="w-full inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-3 py-1.5 rounded-lg shadow-2xs transition-colors"
								>
									<Check class="h-3.5 w-3.5" />
									<span>Confirmer & Trancher (L3)</span>
								</button>
							</div>
						</div>

						<!-- ALTERNATIVE B : VARIANTE B / ALTERNATIVE EXPERT -->
						{#if draft.variante_b}
							<div class="rounded-xl border border-purple-500/30 bg-purple-500/[0.03] p-3.5 space-y-3 flex flex-col justify-between shadow-2xs">
								<div class="space-y-2">
									<div class="flex items-center justify-between">
										<span class="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-400 uppercase">
											Option B (Variante B)
										</span>
										<span class="font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
											{draft.variante_b.cost_delta}
										</span>
									</div>

									<h4 class="text-xs font-bold text-foreground">
										{draft.variante_b.title}
									</h4>

									<p class="text-[11px] text-muted-foreground leading-relaxed italic">
										« {draft.variante_b.trade_off} »
									</p>
								</div>

								<div class="pt-2 border-t flex items-center gap-2">
									<button
										type="button"
										onclick={() => deliberationStore.arbitrateSubject(deliberationStore.activeSubjectId)}
										class="flex-1 inline-flex items-center justify-center gap-1 border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-800 dark:text-purple-300 font-semibold px-2.5 py-1.5 rounded-lg text-xs transition-colors"
									>
										<span>Basculer sur Option B</span>
									</button>
									<button
										type="button"
										onclick={() => { rejectingVariant = !rejectingVariant; }}
										class="px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg border border-destructive/20"
										title="Exclure formellement cette variante"
									>
										Exclure
									</button>
								</div>
							</div>
						{:else}
							<div class="rounded-xl border border-dashed p-3.5 flex flex-col items-center justify-center text-center text-muted-foreground space-y-1">
								<span class="font-semibold">Aucune variante concurrente</span>
								<p class="text-[11px]">Seule l'Option A fait l'objet de la délibération sur cette section.</p>
							</div>
						{/if}
					</div>

					<!-- Formulaire d'exclusion de variante si cliqué -->
					{#if rejectingVariant}
						<div class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
							<label for="variant-reject-input" class="text-xs font-bold text-destructive block">
								Motif d'exclusion formelle de la variante :
							</label>
							<input
								id="variant-reject-input"
								type="text"
								bind:value={variantRejectReason}
								class="w-full text-xs font-mono px-2.5 py-1.5 rounded border border-border bg-background"
								placeholder="ex: Incompatible avec l'exigence CCTP §4.2 d'autonomie sans GNSS"
							/>
							<div class="flex justify-end gap-2">
								<button
									type="button"
									onclick={() => (rejectingVariant = false)}
									class="px-2.5 py-1 rounded text-xs border"
								>
									Annuler
								</button>
								<button
									type="button"
									onclick={() => {
										deliberationStore.rejectVariant(deliberationStore.activeSubjectId, variantRejectReason || 'Rejetée en comité d\'architecture');
										rejectingVariant = false;
									}}
									class="px-3 py-1 rounded text-xs bg-destructive text-destructive-foreground font-semibold"
								>
									Confirmer l'exclusion
								</button>
							</div>
						</div>
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

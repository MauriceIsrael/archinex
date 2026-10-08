<script lang="ts">
	import type { Argument, ArgumentResolution } from '$lib/domain/debate';
	import {
		getArgumentVisualAttributes,
		formatAgentRole,
		formatStanceLabel,
		getStanceBadgeClass,
		canCloseObjection
	} from '$lib/domain/debate';
	import {
		Bot,
		UserCheck,
		HelpCircle,
		Sparkles,
		ShieldAlert,
		ExternalLink,
		CornerDownRight,
		CornerDownLeft,
		Check,
		AlertTriangle,
		Gavel,
		Shield
	} from 'lucide-svelte';

	let {
		argument,
		targetArgument = null,
		userRole = 'lead_architect',
		isHumanUser = true,
		onResolve = (arg: Argument, resolution: ArgumentResolution) => {},
		onReply = (arg: Argument) => {},
		onChallenge = (_arg: Argument) => {},
		onArbitrateOption = (_optId: string) => {}
	}: {
		argument: Argument;
		targetArgument?: Argument | null;
		userRole?: string;
		isHumanUser?: boolean;
		onResolve?: (arg: Argument, resolution: ArgumentResolution) => void;
		onReply?: (arg: Argument) => void;
		onChallenge?: (arg: Argument) => void;
		onArbitrateOption?: (optId: string) => void;
	} = $props();

	const isAgent = $derived(argument.authorKind.startsWith('agent:'));
	const isSynthesis = $derived(argument.stance === 'synthesis');
	const isProposal = $derived(
		argument.authorKind === 'agent:proposer' ||
		(isAgent && argument.stance === 'support' && (
			Boolean(argument.optionId) ||
			argument.claim.toLowerCase().includes('proposition') ||
			argument.claim.toLowerCase().includes('option')
		))
	);
	const attrs = $derived(getArgumentVisualAttributes(argument));
	const isObjectionOpen = $derived(argument.stance === 'objection' && argument.resolution === 'open');
	const userCanClose = $derived(canCloseObjection(userRole, isHumanUser));
</script>

{#if isSynthesis}
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- CARTE DE SYNTHÈSE PLEINE LARGEUR (stance: synthesis)                      -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div
		class="w-full my-4 rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/10 p-4 shadow-sm space-y-3"
		data-author-kind={argument.authorKind}
		data-is-agent={isAgent}
		data-stance="synthesis"
	>
		<div class="flex items-center justify-between gap-2 flex-wrap">
			<div class="flex items-center gap-2">
				<div class="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-600 dark:text-indigo-400">
					<Sparkles class="h-4 w-4" />
				</div>
				<div>
					<div class="flex items-center gap-1.5">
						<span class="text-xs font-bold text-foreground">Synthèse de délibération</span>
						{#if isAgent}
							<span
								class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30"
								title="Généré par agent IA (llm-derived)"
							>
								<Bot class="h-3 w-3" />
								<span>IA</span>
							</span>
						{:else}
							<span
								class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
							>
								<UserCheck class="h-3 w-3" />
								<span>Humain</span>
							</span>
						{/if}
					</div>
					<div class="text-[11px] text-muted-foreground">
						Proposée par <strong class="text-foreground">{argument.author}</strong> ({isAgent ? formatAgentRole(argument.authorKind) : argument.authorKind})
					</div>
				</div>
			</div>

			<span class="text-[11px] font-mono px-2 py-0.5 rounded-md font-bold border {attrs.stanceBadgeClass}">
				Synthèse
			</span>
		</div>

		<!-- Citation éventuelle du message ciblé -->
		{#if targetArgument}
			<blockquote class="text-xs italic border-l-2 border-indigo-400 pl-3 py-1 bg-background/50 rounded-r text-muted-foreground">
				<div class="font-semibold text-[10px] not-italic text-foreground">
					En réponse à {targetArgument.author} :
				</div>
				<div class="line-clamp-2">« {targetArgument.claim} »</div>
			</blockquote>
		{/if}

		<!-- Claim (compromis / synthèse) -->
		<div class="text-xs font-bold text-foreground leading-relaxed">
			{argument.claim}
		</div>

		<!-- Fondement repliable « Pourquoi ? » -->
		<details class="group text-xs">
			<summary class="cursor-pointer font-semibold text-primary hover:underline inline-flex items-center gap-1 select-none text-[11px]">
				<HelpCircle class="h-3.5 w-3.5" />
				<span>Pourquoi ? (Fondement technique ou factuel)</span>
			</summary>
			<div class="mt-2 p-2.5 rounded-lg bg-background/70 border-l-3 border-indigo-500 text-muted-foreground text-xs leading-relaxed">
				{argument.grounds}
			</div>
		</details>

		<!-- Puces kbRefs cliquables & Action Répondre -->
		<div class="flex items-center justify-between gap-2 pt-1 border-t border-indigo-500/20 text-[11px] flex-wrap">
			{#if argument.kbRefs && argument.kbRefs.length > 0}
				<div class="flex items-center gap-1.5 flex-wrap">
					<span class="text-muted-foreground font-semibold">Doctrines :</span>
					{#each argument.kbRefs as ref}
						<a
							href={`/knowledge?rule=${encodeURIComponent(ref)}`}
							class="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 font-bold hover:bg-indigo-500/25 transition-colors"
							title="Consulter la fiche doctrinale dans /knowledge"
						>
							<span>§ {ref}</span>
							<ExternalLink class="h-2.5 w-2.5 opacity-70" />
						</a>
					{/each}
				</div>
			{:else}
				<div></div>
			{/if}

			<button
				type="button"
				onclick={() => onReply(argument)}
				class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/15 transition-colors cursor-pointer ml-auto"
				title="Répondre ou objecter à cette synthèse"
			>
				<CornerDownLeft class="h-3 w-3" />
				<span>↩ Répondre</span>
			</button>
		</div>
	</div>
{:else if isProposal}
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- CARTE DE PROPOSITION D'ARCHITECTURE (stance: support / agent:proposer)   -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div
		class="w-full my-3.5 rounded-xl border-2 border-amber-500/35 bg-gradient-to-r from-amber-500/10 via-card to-amber-500/5 p-4 shadow-2xs space-y-3"
		data-author-kind={argument.authorKind}
		data-is-agent={isAgent}
		data-stance={argument.stance}
		data-is-proposal="true"
	>
		<div class="flex items-center justify-between gap-2 flex-wrap">
			<div class="flex items-center gap-2">
				<div class="p-1.5 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300">
					<Sparkles class="h-4 w-4" />
				</div>
				<div>
					<div class="flex items-center gap-1.5">
						<span class="text-xs font-bold text-foreground">💡 Proposition d'Orientation Technique</span>
						{#if isAgent}
							<span
								class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30"
								title="Généré par agent IA @proposer (llm-derived)"
							>
								<Bot class="h-3 w-3" />
								<span>IA @proposer</span>
							</span>
						{:else}
							<span
								class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
							>
								<UserCheck class="h-3 w-3" />
								<span>Humain</span>
							</span>
						{/if}
					</div>
					<div class="text-[11px] text-muted-foreground">
						Formulée par <strong class="text-foreground">{argument.author}</strong>
						{#if argument.confidence}
							· Confiance : <span class="font-mono">{argument.confidence}</span>
						{/if}
					</div>
				</div>
			</div>

			<span class="text-[10px] font-mono px-2 py-0.5 rounded-md font-bold border bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30">
				Option / Orientation
			</span>
		</div>

		<!-- Citation du message ciblé s'il y a un targetArgumentId -->
		{#if targetArgument}
			<blockquote class="text-xs italic border-l-2 border-amber-400 pl-3 py-1 bg-background/50 rounded-r text-muted-foreground">
				<div class="font-semibold text-[10px] not-italic text-foreground">
					En réponse à {targetArgument.author} :
				</div>
				<div class="line-clamp-2">« {targetArgument.claim} »</div>
			</blockquote>
		{/if}

		<!-- Titre / Claim de la proposition -->
		<div class="text-xs font-bold text-foreground leading-snug">
			{argument.claim}
		</div>

		<!-- Justification technique & options (pleinement visible pour l'architecte) -->
		<div class="p-3 rounded-lg bg-background/80 border border-amber-500/20 text-xs text-foreground/90 leading-relaxed whitespace-pre-line space-y-1">
			<span class="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 block mb-0.5">
				Justification & Spécifications de la proposition :
			</span>
			{argument.grounds}
		</div>

		<!-- Doctrines & Actions rapides intégrées au chat -->
		<div class="flex items-center justify-between gap-2 pt-1 border-t border-amber-500/20 text-[11px] flex-wrap">
			{#if argument.kbRefs && argument.kbRefs.length > 0}
				<div class="flex items-center gap-1.5 flex-wrap">
					<span class="text-muted-foreground font-semibold">Doctrines :</span>
					{#each argument.kbRefs as ref}
						<a
							href={`/knowledge?rule=${encodeURIComponent(ref)}`}
							class="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 font-bold hover:bg-indigo-500/25 transition-colors"
						>
							<span>§ {ref}</span>
							<ExternalLink class="h-2.5 w-2.5 opacity-70" />
						</a>
					{/each}
				</div>
			{:else}
				<div></div>
			{/if}

			<div class="flex items-center gap-1.5 ml-auto">
				<button
					type="button"
					onclick={() => onReply(argument)}
					class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
					title="Répondre ou enrichir cette proposition"
				>
					<CornerDownLeft class="h-3 w-3" />
					<span>↩ Répondre</span>
				</button>

				<button
					type="button"
					onclick={() => onChallenge(argument)}
					class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 transition-colors cursor-pointer"
					title="Soumettre cette proposition à l'agent @challenger pour tester les failles"
				>
					<Shield class="h-3 w-3" />
					<span>Objecter (@challenger)</span>
				</button>

				{#if argument.optionId}
					<button
						type="button"
						onclick={() => onArbitrateOption(argument.optionId!)}
						class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/25 transition-colors cursor-pointer"
						title="Arbitrer ou retenir cette option"
					>
						<Gavel class="h-3 w-3" />
						<span>Arbitrer</span>
					</button>
				{/if}
			</div>
		</div>
	</div>
{:else}
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<!-- MESSAGE STANDARD : HUMAIN (À DROITE) OU AGENT (À GAUCHE)                  -->
	<!-- ═════════════════════════════════════════════════════════════════════════ -->
	<div
		class="w-full flex {isAgent ? 'justify-start' : 'justify-end'} my-2.5"
		data-author-kind={argument.authorKind}
		data-is-agent={isAgent}
		data-stance={argument.stance}
	>
		<div
			class="max-w-[85%] md:max-w-[75%] rounded-2xl p-3.5 shadow-2xs space-y-2.5 {isAgent
				? 'bg-card border-2 border-dashed border-primary/30 rounded-tl-xs'
				: 'bg-primary/10 border border-primary/25 rounded-tr-xs text-foreground'}"
		>
			<!-- En-tête : Avatar, auteur, badge rôle & posture -->
			<div class="flex items-center justify-between gap-2 flex-wrap text-xs pb-1 border-b border-border/40">
				<div class="flex items-center gap-1.5">
					{#if isAgent}
						<span
							class="p-1 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400"
							title="Agent autonome IA"
						>
							<Bot class="h-3.5 w-3.5" />
						</span>
						<strong class="text-foreground">{argument.author}</strong>
						<span
							class="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30"
							title="Origine : llm-derived"
						>
							IA
						</span>
						<span class="text-[10px] font-mono text-muted-foreground">
							{formatAgentRole(argument.authorKind)}
						</span>
					{:else}
						<span
							class="p-1 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
							title="Contributeur humain certifié"
						>
							<UserCheck class="h-3.5 w-3.5" />
						</span>
						<strong class="text-foreground">{argument.author}</strong>
						<span class="text-[10px] font-mono text-muted-foreground px-1 py-0.2 rounded bg-muted/60">
							{argument.authorKind === 'human' ? 'Humain' : argument.authorKind}
						</span>
					{/if}
				</div>

				<div class="flex items-center gap-1.5">
					<span class="font-mono text-[10px] px-1.5 py-0.5 rounded font-bold border {attrs.stanceBadgeClass}">
						{attrs.stanceLabel}
					</span>
					<span class="text-[10px] font-mono text-muted-foreground">
						T{argument.round}
					</span>
				</div>
			</div>

			<!-- Citation du message ciblé s'il y a un targetArgumentId -->
			{#if targetArgument}
				<blockquote class="text-xs italic border-l-2 border-primary/40 pl-2.5 py-1 text-muted-foreground bg-muted/30 rounded-r">
					<div class="font-semibold text-[10px] not-italic text-foreground flex items-center gap-1">
						<CornerDownRight class="h-3 w-3 text-primary" />
						<span>En réponse à {targetArgument.author} :</span>
					</div>
					<div class="line-clamp-2">« {targetArgument.claim} »</div>
				</blockquote>
			{/if}

			<!-- Affirmation principale (claim) -->
			<div class="text-xs font-bold text-foreground leading-snug">
				{argument.claim}
			</div>

			<!-- Fondement repliable « Pourquoi ? » -->
			<details class="group text-xs">
				<summary class="cursor-pointer font-semibold text-primary hover:underline inline-flex items-center gap-1 select-none text-[11px]">
					<HelpCircle class="h-3.5 w-3.5" />
					<span>Pourquoi ?</span>
				</summary>
				<div class="mt-1.5 p-2.5 rounded bg-muted/60 border-l-2 border-primary text-muted-foreground text-xs leading-relaxed">
					<strong class="text-foreground block mb-0.5">Fondement :</strong>
					{argument.grounds}
				</div>
			</details>

			<!-- Puces kbRefs cliquables & Bouton Répondre -->
			<div class="flex items-center justify-between gap-2 pt-1 border-t border-border/30 text-[11px] flex-wrap">
				{#if argument.kbRefs && argument.kbRefs.length > 0}
					<div class="flex items-center gap-1.5 flex-wrap">
						<span class="text-muted-foreground font-semibold text-[10px]">Doctrine :</span>
						{#each argument.kbRefs as ref}
							<a
								href={`/knowledge?rule=${encodeURIComponent(ref)}`}
								class="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 font-bold hover:bg-indigo-500/20 transition-colors"
								title="Consulter la règle doctrinale"
							>
								<span>§ {ref}</span>
								<ExternalLink class="h-2.5 w-2.5 opacity-60" />
							</a>
						{/each}
					</div>
				{:else}
					<div></div>
				{/if}

				<button
					type="button"
					onclick={() => onReply(argument)}
					class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer ml-auto"
					title="Citer ce message dans le composeur"
				>
					<CornerDownLeft class="h-3 w-3" />
					<span>↩ Répondre</span>
				</button>
			</div>

			<!-- Résolution de l'objection si présente dans le message -->
			{#if argument.stance === 'objection'}
				<div class="pt-2 border-t border-border/40 flex items-center justify-between gap-2 flex-wrap text-xs">
					{#if isObjectionOpen}
						<div class="text-[10px] font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1">
							<ShieldAlert class="h-3 w-3" />
							<span>Objection ouverte</span>
						</div>

						{#if userCanClose}
							<div class="flex items-center gap-1">
								<button
									type="button"
									onclick={() => onResolve(argument, 'answered')}
									class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
								>
									Répondre
								</button>
								<button
									type="button"
									onclick={() => onResolve(argument, 'accepted_risk')}
									class="px-2 py-0.5 rounded text-[10px] font-semibold border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 cursor-pointer"
								>
									Accepter risque
								</button>
								<button
									type="button"
									onclick={() => onResolve(argument, 'withdrawn')}
									class="px-2 py-0.5 rounded text-[10px] font-semibold border border-muted bg-muted/60 text-muted-foreground hover:text-foreground cursor-pointer"
								>
									Retirer
								</button>
							</div>
						{/if}
					{:else}
						<div class="text-[10px] font-mono font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
							<Check class="h-3 w-3" />
							<span>
								{argument.resolution === 'accepted_risk'
									? 'Risque accepté'
									: argument.resolution === 'withdrawn'
									? 'Objection retirée'
									: 'Traitée / Levée'}
							</span>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

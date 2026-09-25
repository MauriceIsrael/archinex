<script lang="ts">
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import {
		MessageSquare,
		Send,
		Sparkles,
		ShieldCheck,
		ExternalLink,
		BookOpen,
		Check,
		X,
		Bot,
		User,
		FileCode
	} from 'lucide-svelte';

	let inputMessage = $state<string>('');
	let selectedChannel = $state<'internal' | 'discord'>('internal');

	function handleSendMessage() {
		if (!inputMessage.trim()) return;
		deliberationStore.postDialogueMessage(inputMessage, selectedChannel);
		inputMessage = '';
	}

	function simulateDiscordExchange() {
		deliberationStore.postDialogueMessage(
			'Sur le site Sud, peut-on réduire l autonomie du groupe électrogène pour économiser du fioul sous NIS2 ?',
			'discord',
			'A. Mercier (Infra Lead)'
		);
	}
</script>

<div class="rounded-xl border bg-card p-5 shadow-sm space-y-4">
	<!-- En-tête -->
	<div class="flex items-center justify-between pb-3 border-b">
		<div class="flex items-center gap-2">
			<MessageSquare class="h-4 w-4 text-primary" />
			<h3 class="text-sm font-bold tracking-tight text-foreground">
				Délibération Multi-Canaux & Écoute Active
			</h3>
		</div>
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="text-[11px] font-mono px-2 py-0.5 rounded border border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 transition-colors"
				title="Simuler un échange entrant depuis le salon Discord du projet"
				onclick={simulateDiscordExchange}
			>
				Simuler Discord
			</button>
		</div>
	</div>

	<!-- Cartes de Rappel Proactif de Doctrine (SmartMemory) -->
	{#if deliberationStore.activeRecalls.length > 0}
		<div class="space-y-2.5">
			{#each deliberationStore.activeRecalls as recall}
				<div class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2 text-xs">
					<div class="flex items-start justify-between gap-2">
						<div class="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-200">
							<Sparkles class="h-4 w-4 text-amber-500 shrink-0" />
							<span>Rappel Proactif de Doctrine :</span>
							<span class="font-mono bg-amber-500/20 px-1.5 py-0.5 rounded">{recall.id}</span>
						</div>
						<button
							type="button"
							class="text-muted-foreground hover:text-foreground"
							title="Ignorer ce rappel"
							onclick={() => deliberationStore.dismissRecall(recall.id)}
						>
							<X class="h-3.5 w-3.5" />
						</button>
					</div>

					<p class="font-semibold text-foreground">
						{recall.title}
					</p>

					<p class="text-muted-foreground leading-relaxed">
						{recall.summary}
					</p>

					<div class="bg-background/80 rounded p-2 border border-amber-500/20 font-mono text-[11px] text-foreground">
						💡 {recall.guidance}
					</div>

					<div class="flex items-center justify-between pt-1">
						<span class="text-[11px] font-mono text-muted-foreground">
							Réf : {recall.referenceDocument}
						</span>
						<div class="flex items-center gap-2">
							<button
								type="button"
								class="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-[11px] font-bold shadow-xs transition-colors"
								onclick={() => deliberationStore.alignWithDoctrine(recall.id)}
							>
								<Check class="h-3 w-3" />
								S'aligner sur la doctrine
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Fil de messages -->
	<div class="h-56 overflow-y-auto space-y-2.5 pr-1 text-xs">
		{#if deliberationStore.dialogueMessages.length === 0}
			<p class="text-center italic text-muted-foreground py-6">Aucun message pour le moment.</p>
		{:else}
			{#each deliberationStore.dialogueMessages as msg}
				<div class="p-2.5 rounded-lg border bg-background/60 space-y-1">
					<div class="flex items-center justify-between text-[11px] text-muted-foreground">
						<div class="flex items-center gap-1.5 font-semibold text-foreground">
							{#if msg.isAi}
								<Bot class="h-3 w-3 text-primary" />
							{:else}
								<User class="h-3 w-3 text-muted-foreground" />
							{/if}
							<span>{msg.author}</span>
							<span class="font-mono text-[10px] text-muted-foreground">({msg.role})</span>
							{#if msg.channel === 'discord'}
								<span class="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-mono text-[9px] px-1 py-0.2 rounded border border-indigo-500/20">
									Discord
								</span>
							{/if}
						</div>
						<span class="font-mono text-[10px]">{msg.timestamp}</span>
					</div>
					<p class="text-foreground leading-relaxed font-sans">{msg.content}</p>
				</div>
			{/each}
		{/if}
	</div>

	<!-- Formulaire de saisie -->
	<form
		onsubmit={(e) => {
			e.preventDefault();
			handleSendMessage();
		}}
		class="space-y-2 pt-2 border-t"
	>
		<div class="flex items-center gap-2">
			<select
				bind:value={selectedChannel}
				class="text-[11px] font-mono px-2 py-1 rounded border border-border bg-background text-foreground"
			>
				<option value="internal">Interne</option>
				<option value="discord">Salon Discord</option>
			</select>
			<input
				type="text"
				bind:value={inputMessage}
				placeholder="Posez une question, mentionnez un standard (ex: NIS2, holdover, Tier IV)..."
				class="flex-1 text-xs px-3 py-1.5 rounded-md border border-border bg-background text-foreground"
			/>
			<button
				type="submit"
				class="inline-flex items-center gap-1 rounded bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 transition-colors shadow-xs"
			>
				<Send class="h-3 w-3" />
				Envoyer
			</button>
		</div>
	</form>

	<!-- Énoncés Auditables Générés (Lot 4 - Diff Sensor) -->
	{#if deliberationStore.statements.length > 0}
		<div class="pt-3 border-t space-y-2">
			<div class="flex items-center justify-between text-xs">
				<span class="font-bold text-foreground flex items-center gap-1">
					<ShieldCheck class="h-3.5 w-3.5 text-emerald-600" />
					Énoncés Auditables Produits ({deliberationStore.statements.length})
				</span>
				<span class="text-[10px] text-muted-foreground font-mono">human-authored</span>
			</div>
			<div class="space-y-1.5 max-h-36 overflow-y-auto pr-1">
				{#each deliberationStore.statements as stmt}
					<div class="bg-muted/40 p-2 rounded border text-[11px] font-mono flex items-start justify-between gap-2">
						<div>
							<span class="font-bold text-primary">[{stmt.id}]</span>
							<span class="text-foreground ml-1">{stmt.triplet.predicate} :</span>
							<span class="text-emerald-700 dark:text-emerald-300 font-semibold">{String(stmt.triplet.value)}</span>
						</div>
						<span class="text-muted-foreground text-[10px] shrink-0">{stmt.authority.author}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

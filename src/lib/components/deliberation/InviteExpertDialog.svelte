<script lang="ts">
	import { apiFetch } from '$lib/api/fetch';
	import { toast } from '$lib/toast/index.svelte';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { ArchitectRole } from '$lib/types/epistemic';
	import {
		X,
		Mail,
		Send,
		UserPlus,
		CheckCircle2,
		Copy,
		Check,
		ExternalLink,
		Sparkles,
		ShieldCheck,
		FileText
	} from 'lucide-svelte';

	interface Props {
		open?: boolean;
		onclose: () => void;
		defaultProjectId?: string;
		defaultRole?: ArchitectRole;
		onInvited?: (data: { email: string; name?: string; role: ArchitectRole }) => void;
	}

	let {
		open = $bindable(false),
		onclose,
		defaultProjectId,
		defaultRole,
		onInvited
	}: Props = $props();

	let email = $state('');
	let name = $state('');
	let expertRole = $state<ArchitectRole>(defaultRole || 'infra_expert_architect');
	let projectId = $state(defaultProjectId || deliberationStore.activeEngagementId);
	let message = $state('');
	let loading = $state(false);

	// Success State with Link Preview
	let sentInvitation = $state<{
		email: string;
		inviteUrl: string;
		token: string;
		previewText: string;
	} | null>(null);

	let copied = $state(false);

	const roles: Array<{ id: ArchitectRole; label: string }> = [
		{ id: 'lead_architect', label: 'Lead Architect (Arbitre)' },
		{ id: 'infra_expert_architect', label: 'Architecte Infra / Réseau & CNI' },
		{ id: 'security_architect', label: 'Architecte Sécurité NIS2 / ANSSI' },
		{ id: 'domain_architect', label: 'Architecte Métier & Domaine' }
	];

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!email.trim() || loading) return;

		loading = true;

		const selectedEngagement = deliberationStore.engagements.find((e) => e.id === projectId);
		const projectName = selectedEngagement ? selectedEngagement.title : 'Projet d\'Architecture';

		const { data: res, error } = await apiFetch<{
			success: boolean;
			invitation: { id: string; token: string; email: string };
			inviteUrl: string;
			preview: { text: string; html: string };
		}>('/api/invite', {
			method: 'POST',
			body: {
				email: email.trim(),
				name: name.trim() || undefined,
				expertRole,
				projectId,
				projectName,
				message: message.trim() || undefined
			}
		});

		loading = false;

		if (error) {
			toast(error.message, { variant: 'error' });
			return;
		}

		toast(`Invitation par mail envoyée à ${email.trim()} !`, { variant: 'success' });

		sentInvitation = {
			email: email.trim(),
			inviteUrl: res?.inviteUrl || `${window.location.origin}/invite?token=${res?.invitation.token}`,
			token: res?.invitation.token || '',
			previewText: res?.preview?.text || ''
		};

		if (onInvited) {
			onInvited({
				email: email.trim(),
				name: name.trim() || undefined,
				role: expertRole
			});
		}
	}

	async function copyInviteLink() {
		if (!sentInvitation) return;
		try {
			await navigator.clipboard.writeText(sentInvitation.inviteUrl);
			copied = true;
			toast('Lien d\'invitation copié dans le presse-papier !', { variant: 'success' });
			setTimeout(() => {
				copied = false;
			}, 2500);
		} catch {
			toast('Impossible de copier automatiquement le lien', { variant: 'warning' });
		}
	}

	function resetAndClose() {
		sentInvitation = null;
		email = '';
		name = '';
		message = '';
		copied = false;
		onclose();
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
		<div class="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col text-foreground">
			<!-- Header -->
			<div class="p-4 sm:p-5 border-b flex items-center justify-between bg-muted/30">
				<div class="flex items-center gap-2.5">
					<div class="p-2 rounded-xl bg-primary text-primary-foreground shadow-xs">
						<Mail class="h-5 w-5" />
					</div>
					<div>
						<h3 class="text-sm sm:text-base font-bold text-foreground">
							Inviter un Expert par Email
						</h3>
						<p class="text-[11px] text-muted-foreground mt-0.5">
							Création de compte automatique pour les nouveaux experts
						</p>
					</div>
				</div>
				<button
					type="button"
					onclick={resetAndClose}
					class="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			{#if sentInvitation}
				<!-- État après envoi : Confirmation & Lien copiable -->
				<div class="p-5 space-y-4 text-xs">
					<div class="rounded-xl border bg-emerald-500/10 border-emerald-500/30 p-4 space-y-2 text-center">
						<div class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600">
							<CheckCircle2 class="h-6 w-6" />
						</div>
						<h4 class="font-bold text-sm text-foreground">
							Invitation Transmise avec Succès !
						</h4>
						<p class="text-muted-foreground text-[11px] leading-relaxed">
							Un email d'invitation sécurisé a été généré pour <strong>{sentInvitation.email}</strong>. S'il n'a pas encore de compte sur Archinex, il pourra le créer en 1 clic grâce à ce lien.
						</p>
					</div>

					<!-- Bloc Lien Direct Copiable -->
					<div class="space-y-1.5">
						<label for="inv-link" class="font-bold text-foreground block text-[11px]">
							Lien d'Activation Direct (Copiable en 1 clic) :
						</label>
						<div class="flex gap-2">
							<input
								id="inv-link"
								type="text"
								readonly
								value={sentInvitation.inviteUrl}
								class="flex-1 rounded-lg border bg-muted/40 px-3 py-1.5 text-xs font-mono text-muted-foreground select-all"
							/>
							<button
								type="button"
								onclick={copyInviteLink}
								class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow-xs hover:bg-primary/90 transition-colors shrink-0 cursor-pointer"
							>
								{#if copied}
									<Check class="h-3.5 w-3.5" />
									<span>Copié !</span>
								{:else}
									<Copy class="h-3.5 w-3.5" />
									<span>Copier</span>
								{/if}
							</button>
						</div>
					</div>

					<div class="pt-2">
						<button
							type="button"
							onclick={resetAndClose}
							class="w-full py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs transition-colors cursor-pointer"
						>
							Fermer
						</button>
					</div>
				</div>
			{:else}
				<!-- Formulaire d'invitation -->
				<form onsubmit={handleSubmit} class="p-5 space-y-4 text-xs">
					<!-- Email -->
					<div class="space-y-1">
						<label for="invite-email" class="font-bold text-foreground">Adresse Email de l'Expert *</label>
						<input
							id="invite-email"
							type="email"
							bind:value={email}
							required
							placeholder="expert.nom@organisation.fr"
							class="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-1 focus:ring-primary font-medium"
						/>
					</div>

					<!-- Nom Complet (Optionnel) -->
					<div class="space-y-1">
						<label for="invite-name" class="font-bold text-foreground">Nom & Prénom de l'Expert (Optionnel)</label>
						<input
							id="invite-name"
							type="text"
							bind:value={name}
							placeholder="ex: Jean-Marc Dupont"
							class="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-1 focus:ring-primary"
						/>
					</div>

					<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
						<!-- Rôle d'Expert -->
						<div class="space-y-1">
							<label for="invite-role" class="font-bold text-foreground">Rôle d'Architecture</label>
							<select
								id="invite-role"
								bind:value={expertRole}
								class="w-full rounded-lg border bg-background px-2.5 py-2 text-xs focus:ring-1 focus:ring-primary"
							>
								{#each roles as r}
									<option value={r.id}>{r.label}</option>
								{/each}
							</select>
						</div>

						<!-- Projet Rattaché -->
						<div class="space-y-1">
							<label for="invite-prj" class="font-bold text-foreground">Espace Projet</label>
							<select
								id="invite-prj"
								bind:value={projectId}
								class="w-full rounded-lg border bg-background px-2.5 py-2 text-xs focus:ring-1 focus:ring-primary"
							>
								{#each deliberationStore.engagements as eng}
									<option value={eng.id}>{eng.shortName}</option>
								{/each}
							</select>
						</div>
					</div>

					<!-- Message Personnalisé -->
					<div class="space-y-1">
						<label for="invite-msg" class="font-bold text-foreground">Message d'Accompagnement (Optionnel)</label>
						<textarea
							id="invite-msg"
							bind:value={message}
							rows="2"
							placeholder="ex: Nous sollicitons votre expertise sur l'accélération CNI et la conformité NIS2..."
							class="w-full rounded-lg border bg-background p-2.5 text-xs focus:ring-1 focus:ring-primary"
						></textarea>
					</div>

					<!-- Règle de création de compte automatique -->
					<div class="rounded-xl border bg-muted/20 p-3 flex items-start gap-2.5 text-[11px] text-muted-foreground">
						<ShieldCheck class="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
						<p class="leading-relaxed">
							Si cet expert ne possède pas encore de compte sur Archinex, un lien d'activation sécurisé lui permettra de <strong>définir son mot de passe et finaliser son inscription</strong> instantanément.
						</p>
					</div>

					<!-- Actions -->
					<div class="flex items-center justify-end gap-2 pt-2 border-t">
						<button
							type="button"
							onclick={resetAndClose}
							class="px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground text-xs font-medium transition-colors cursor-pointer"
						>
							Annuler
						</button>

						<button
							type="submit"
							disabled={loading}
							class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-xs hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
						>
							{#if loading}
								<span>Expédition en cours...</span>
							{:else}
								<Send class="h-3.5 w-3.5" />
								<span>Envoyer l'Invitation par Email</span>
							{/if}
						</button>
					</div>
				</form>
			{/if}
		</div>
	</div>
{/if}

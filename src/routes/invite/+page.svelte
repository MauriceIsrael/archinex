<script lang="ts">
	import { apiFetch } from '$lib/api/fetch';
	import { toast } from '$lib/toast/index.svelte';
	import { goto } from '$app/navigation';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';
	import type { PageData } from './$types';
	import {
		ShieldCheck,
		Building2,
		UserCheck,
		Lock,
		Eye,
		EyeOff,
		ArrowRight,
		AlertCircle,
		CheckCircle2,
		Sparkles
	} from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let name = $state(data.invitation?.name || '');
	let password = $state('');
	let confirmPassword = $state('');
	let showPassword = $state(false);
	let loading = $state(false);

	const roleLabels: Record<string, string> = {
		lead_architect: 'Lead Architect (Arbitre)',
		infra_expert_architect: 'Architecte Infra / Réseau & CNI',
		security_architect: 'Architecte Sécurité & NIS2',
		domain_architect: 'Architecte Métier & Domaine'
	};

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (loading) return;

		if (!data.userExists && password !== confirmPassword) {
			toast('Les deux mots de passe ne correspondent pas', { variant: 'error' });
			return;
		}

		if (password.length < 6) {
			toast('Le mot de passe doit comporter au moins 6 caractères', { variant: 'error' });
			return;
		}

		loading = true;

		const { data: res, error } = await apiFetch<{
			success: boolean;
			message: string;
			projectId?: string;
			redirectUrl?: string;
		}>('/api/invite/accept', {
			method: 'POST',
			body: {
				token: data.invitation?.token,
				name: name.trim() || undefined,
				password
			}
		});

		if (error) {
			toast(error.message, { variant: 'error' });
			loading = false;
			return;
		}

		toast(data.userExists ? 'Invitation acceptée !' : 'Compte créé avec succès ! Bienvenue sur Archinex.', {
			variant: 'success'
		});

		// Bascule automatique sur le projet associé si présent
		if (res?.projectId) {
			deliberationStore.switchEngagement(res.projectId);
		}

		await goto(res?.redirectUrl || '/deliberation');
		window.location.reload();
	}
</script>

<svelte:head>
	<title>Archinex · Invitation Expert</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-muted/30 p-4">
	<div class="w-full max-w-lg space-y-6">
		<!-- En-tête Logo -->
		<div class="text-center space-y-1">
			<div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
				<ShieldCheck class="h-6 w-6" />
			</div>
			<h1 class="text-2xl font-bold tracking-tight text-foreground">Archinex</h1>
			<p class="text-xs text-muted-foreground">Plateforme de Délibération & Gouvernance d'Architecture</p>
		</div>

		{#if data.error}
			<!-- Carte d'Erreur -->
			<div class="rounded-2xl border bg-card p-6 shadow-sm space-y-4 text-center">
				<div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
					<AlertCircle class="h-6 w-6" />
				</div>
				<div class="space-y-1">
					<h2 class="text-base font-bold text-foreground">Lien d'invitation invalide</h2>
					<p class="text-xs text-muted-foreground">{data.message}</p>
				</div>
				<div class="pt-2">
					<a
						href="/login"
						class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
					>
						<span>Se connecter à Archinex</span>
						<ArrowRight class="h-3.5 w-3.5" />
					</a>
				</div>
			</div>
		{:else if data.invitation}
			<!-- Carte Principale d'Invitation -->
			<div class="rounded-2xl border bg-card p-6 shadow-sm space-y-5">
				<!-- Synthèse du projet et de l'invitant -->
				<div class="rounded-xl border bg-primary/5 border-primary/20 p-4 space-y-2.5">
					<div class="flex items-center justify-between">
						<span class="text-[10px] font-bold uppercase tracking-wider font-mono text-primary flex items-center gap-1">
							<Sparkles class="h-3.5 w-3.5" />
							Invitation Officielle
						</span>
						<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-500/25">
							Valide
						</span>
					</div>

					<div>
						<div class="text-sm font-bold text-foreground">
							{data.invitation.projectName || 'Projet d\'Architecture'}
						</div>
						<div class="text-xs text-muted-foreground mt-0.5">
							Invité par <strong>{data.invitation.invitedBy || 'Lead Architect'}</strong> en tant que :
							<span class="font-bold text-foreground inline-block ml-1">
								{roleLabels[data.invitation.expertRole] || data.invitation.expertRole}
							</span>
						</div>
					</div>

					{#if data.invitation.message}
						<div class="text-[11px] text-muted-foreground italic bg-background/60 p-2.5 rounded-lg border border-border/40">
							"{data.invitation.message}"
						</div>
					{/if}
				</div>

				<!-- Formulaire d'acceptation -->
				<form onsubmit={handleSubmit} class="space-y-4 text-xs">
					<div class="space-y-1">
						<h2 class="text-sm font-bold text-foreground">
							{data.userExists ? 'Confirmez votre identité' : 'Créer votre compte d\'expert'}
						</h2>
						<p class="text-[11px] text-muted-foreground">
							{data.userExists
								? 'Un compte existe déjà pour cette adresse. Saisissez votre mot de passe pour rejoindre ce projet.'
								: 'Renseignez vos accès pour finaliser votre inscription et intégrer la délibération.'}
						</p>
					</div>

					<!-- Email (Lecture Seule) -->
					<div class="space-y-1">
						<label for="inv-email" class="font-bold text-foreground">Adresse Email d'Invitation</label>
						<input
							id="inv-email"
							type="email"
							value={data.invitation.email}
							disabled
							class="w-full rounded-lg border bg-muted/50 px-3 py-2 text-xs font-mono text-muted-foreground cursor-not-allowed"
						/>
					</div>

					<!-- Nom Complet (Si Nouveau Compte) -->
					{#if !data.userExists}
						<div class="space-y-1">
							<label for="inv-name" class="font-bold text-foreground">Votre Nom Complet *</label>
							<input
								id="inv-name"
								type="text"
								bind:value={name}
								required
								placeholder="ex: Jean Dupont"
								class="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-1 focus:ring-primary font-medium"
							/>
						</div>
					{/if}

					<!-- Mot de passe -->
					<div class="space-y-1">
						<label for="inv-pass" class="font-bold text-foreground">
							{data.userExists ? 'Mot de Passe du Compte *' : 'Définir un Mot de Passe *'}
						</label>
						<div class="relative">
							<input
								id="inv-pass"
								type={showPassword ? 'text' : 'password'}
								bind:value={password}
								required
								minlength="6"
								placeholder="Minimum 6 caractères"
								class="w-full rounded-lg border bg-background px-3 py-2 pr-9 text-xs focus:ring-1 focus:ring-primary"
							/>
							<button
								type="button"
								onclick={() => (showPassword = !showPassword)}
								class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
								tabindex="-1"
							>
								{#if showPassword}
									<EyeOff class="h-4 w-4" />
								{:else}
									<Eye class="h-4 w-4" />
								{/if}
							</button>
						</div>
					</div>

					<!-- Confirmation Mot de passe (Si Nouveau Compte) -->
					{#if !data.userExists}
						<div class="space-y-1">
							<label for="inv-pass2" class="font-bold text-foreground">Confirmer le Mot de Passe *</label>
							<input
								id="inv-pass2"
								type={showPassword ? 'text' : 'password'}
								bind:value={confirmPassword}
								required
								minlength="6"
								placeholder="Répétez le mot de passe"
								class="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-1 focus:ring-primary"
							/>
						</div>
					{/if}

					<div class="pt-2">
						<button
							type="submit"
							disabled={loading}
							class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-xs hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
						>
							{#if loading}
								<span>Validation en cours...</span>
							{:else}
								<CheckCircle2 class="h-4 w-4" />
								<span>{data.userExists ? 'Se connecter & Rejoindre le Projet' : 'Créer mon compte & Rejoindre la Délibération'}</span>
							{/if}
						</button>
					</div>
				</form>
			</div>
		{/if}
	</div>
</div>

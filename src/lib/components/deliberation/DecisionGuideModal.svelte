<script lang="ts">
	import {
		X,
		Scale,
		Edit3,
		BookmarkCheck,
		Lock,
		ShieldCheck,
		ArrowRight,
		Layers,
		FileText,
		CheckCircle2,
		AlertTriangle
	} from 'lucide-svelte';
	import { deliberationStore } from '$lib/stores/deliberationStore.svelte';

	let { isOpen = $bindable(false) } = $props<{ isOpen: boolean }>();
</script>

{#if isOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
		<div
			class="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border bg-card p-6 shadow-xl text-card-foreground space-y-6"
			role="dialog"
			aria-modal="true"
		>
			<!-- Header -->
			<div class="flex items-start justify-between border-b pb-4">
				<div class="space-y-1">
					<div class="flex items-center gap-2">
						<span class="inline-flex items-center gap-1 rounded bg-primary/10 text-primary px-2 py-0.5 text-xs font-semibold font-mono">
							Guide Méthodologique
						</span>
						<span class="inline-flex items-center gap-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-xs font-semibold">
							<ShieldCheck class="h-3.5 w-3.5" />
							100% Local & Souverain
						</span>
					</div>
					<h2 class="text-xl font-bold tracking-tight text-foreground">
						Où et comment prendre les décisions dans Archinex ?
					</h2>
					<p class="text-xs text-muted-foreground">
						Dans Archinex, une décision n'est pas un simple texte libre : c'est un acte d'architecture formel qui transforme le niveau de maturité (L0 → L5) et débloque le projet.
					</p>
				</div>
				<button
					type="button"
					onclick={() => (isOpen = false)}
					class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
					aria-label="Fermer"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- Les 4 Leviers de Décision -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<!-- Levier 1 : Trancher un Conflit L2 -> L3 -->
				<div class="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-3">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-semibold text-sm">
							<div class="p-1.5 rounded-lg bg-rose-500/10">
								<Scale class="h-4 w-4" />
							</div>
							<span>1. Trancher un Conflit (L2 → L3)</span>
						</div>
						<span class="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-800 dark:text-rose-300">
							L3_decided
						</span>
					</div>
					<p class="text-xs text-muted-foreground leading-relaxed">
						Quand deux exigences s'opposent (ex: obligation de diffusion multicast vs unicast, ou holdover 30j vs 15j).
					</p>
					<div class="rounded-lg bg-background/80 p-2.5 text-xs space-y-1.5 border">
						<div class="flex items-center gap-1.5 font-medium text-foreground">
							<span class="text-muted-foreground">Où :</span>
							<span>Panneau Central (Brouillon) → Encadré rouge <strong>« Conflits Ouverts »</strong></span>
						</div>
						<div class="flex items-center gap-1.5 font-medium text-foreground">
							<span class="text-muted-foreground">Bouton :</span>
							<span class="rounded bg-rose-600 text-white px-1.5 py-0.5 font-mono text-[11px]">Trancher (L3)</span>
						</div>
						<div class="text-[11px] text-muted-foreground pt-1 border-t">
							⚡ <strong>Effet :</strong> Promut la section à L3, exclut la variante concurrente via un énoncé d'exclusion irréversible, et débloque les sections aval.
						</div>
					</div>
				</div>

				<!-- Levier 2 : Modifier une Hypothèse via le Diff -->
				<div class="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
							<div class="p-1.5 rounded-lg bg-amber-500/10">
								<Edit3 class="h-4 w-4" />
							</div>
							<span>2. Amender une Hypothèse (Diff Sensor)</span>
						</div>
						<span class="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300">
							Captation Diff
						</span>
					</div>
					<p class="text-xs text-muted-foreground leading-relaxed">
						Pour changer une valeur technique (ex: abaisser le holdover de 30j à 15j, ou modifier la bande passante).
					</p>
					<div class="rounded-lg bg-background/80 p-2.5 text-xs space-y-1.5 border">
						<div class="flex items-center gap-1.5 font-medium text-foreground">
							<span class="text-muted-foreground">Où :</span>
							<span>Panneau Central (Brouillon) → Encadré orange <strong>« Hypothèses & Impacts »</strong></span>
						</div>
						<div class="flex items-center gap-1.5 font-medium text-foreground">
							<span class="text-muted-foreground">Bouton :</span>
							<span class="rounded bg-amber-600 text-white px-1.5 py-0.5 font-mono text-[11px]">Modifier</span>
						</div>
						<div class="text-[11px] text-muted-foreground pt-1 border-t">
							⚡ <strong>Effet :</strong> Le capteur de diff extrait automatiquement le triplet epistemique, crée un Statement horodaté et recalcule le chiffrage financier.
						</div>
					</div>
				</div>

				<!-- Levier 3 : Valider une Règle Doctrinale SmartMemory -->
				<div class="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2 text-violet-700 dark:text-violet-400 font-semibold text-sm">
							<div class="p-1.5 rounded-lg bg-violet-500/10">
								<BookmarkCheck class="h-4 w-4" />
							</div>
							<span>3. Valider une Règle (SmartMemory)</span>
						</div>
						<span class="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-violet-500/20 text-violet-800 dark:text-violet-300">
							Doctrine
						</span>
					</div>
					<p class="text-xs text-muted-foreground leading-relaxed">
						L'agent dialectique détecte les récurrences et propose des règles doctrinales candidates pour l'organisation.
					</p>
					<div class="rounded-lg bg-background/80 p-2.5 text-xs space-y-1.5 border">
						<div class="flex items-center gap-1.5 font-medium text-foreground">
							<span class="text-muted-foreground">Où :</span>
							<span>Bandeau doré <strong>« Règle Doctrinale Candidate »</strong> (haut de page)</span>
						</div>
						<div class="flex items-center gap-1.5 font-medium text-foreground">
							<span class="text-muted-foreground">Boutons :</span>
							<span class="rounded bg-emerald-600 text-white px-1.5 py-0.5 font-mono text-[11px]">Valider la règle</span>
							<span class="rounded bg-muted text-foreground px-1.5 py-0.5 font-mono text-[11px]">Rejeter</span>
						</div>
						<div class="text-[11px] text-muted-foreground pt-1 border-t">
							⚡ <strong>Effet :</strong> Capitalise la règle dans la mémoire institutionnelle locale pour enrichir les prochains projets.
						</div>
					</div>
				</div>

				<!-- Levier 4 : Sceller une Section Homologuée (L4 -> L5) -->
				<div class="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
							<div class="p-1.5 rounded-lg bg-emerald-500/10">
								<Lock class="h-4 w-4" />
							</div>
							<span>4. Sceller une Section (L4 → L5)</span>
						</div>
						<span class="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">
							L5_frozen
						</span>
					</div>
					<p class="text-xs text-muted-foreground leading-relaxed">
						Quand tous les conflits et questions bloquantes sont éteints pour une section d'architecture.
					</p>
					<div class="rounded-lg bg-background/80 p-2.5 text-xs space-y-1.5 border">
						<div class="flex items-center gap-1.5 font-medium text-foreground">
							<span class="text-muted-foreground">Où :</span>
							<span>En-tête supérieur droit de la page</span>
						</div>
						<div class="flex items-center gap-1.5 font-medium text-foreground">
							<span class="text-muted-foreground">Bouton :</span>
							<span class="rounded bg-emerald-600 text-white px-1.5 py-0.5 font-mono text-[11px]">Sceller Section</span>
						</div>
						<div class="text-[11px] text-muted-foreground pt-1 border-t">
							⚡ <strong>Effet :</strong> Vérifie le gating (0 question bloquante), fige le texte avec une empreinte SHA-256 et exporte les livrables d'architecture (Mermaid, SysML, Structurizr).
						</div>
					</div>
				</div>
			</div>

			<!-- Focus sur les 2 Instances d'Engagement -->
			<div class="rounded-xl border bg-muted/30 p-4 space-y-3">
				<h3 class="text-sm font-bold text-foreground flex items-center gap-2">
					<Layers class="h-4 w-4 text-primary" />
					Les 2 Instances de Travail Configurées (100% en local)
				</h3>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
					<div class="rounded-lg border bg-background p-3 space-y-1.5">
						<div class="flex items-center gap-2">
							<span class="text-base">🏢</span>
							<strong class="text-foreground">SUSE Telco Cloud (Blueprint Vierge)</strong>
						</div>
						<p class="text-muted-foreground">
							Projet générique pour concevoir votre socle souverain : Kubernetes durci RKE2, SLERT temps réel, NeuVector Zero-Trust, Harvester virtualisation, CNI Multus/SR-IOV.
						</p>
						<span class="inline-block rounded bg-primary/10 text-primary px-2 py-0.5 font-mono text-[10px] font-semibold">
							Idéal pour définir votre architecture de référence
						</span>
					</div>

					<div class="rounded-lg border bg-background p-3 space-y-1.5">
						<div class="flex items-center gap-2">
							<span class="text-base">📋</span>
							<strong class="text-foreground">CCTP 5G & MCX (Projet Réel RFP)</strong>
						</div>
						<p class="text-muted-foreground">
							Appel d'offres contractuel client : tranches critiques MCX, exigences de résilience, clauses CCTP et arbitrage formel d'antagonismes 3GPP.
						</p>
						<span class="inline-block rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 font-mono text-[10px] font-semibold">
							Idéal pour délibérer sur une réponse à appel d'offres
						</span>
					</div>
				</div>
				<p class="text-[11px] text-muted-foreground">
					💡 <em>Vous pouvez basculer d'une instance à l'autre à tout moment via le menu déroulant situé en haut à gauche de la page. Les deux environnements conservent leur état en mémoire locale indépendamment.</em>
				</p>
			</div>

			<!-- Pied de page -->
			<div class="flex justify-end pt-2">
				<button
					type="button"
					onclick={() => (isOpen = false)}
					class="rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 text-xs font-semibold shadow-xs transition-colors"
				>
					J'ai compris, revenir au Workbench
				</button>
			</div>
		</div>
	</div>
{/if}

import { toast } from '$lib/toast/index.svelte';

export const ACTIVE_FACTORIZATION_RUN_KEY = 'archinex.factorization.activeRun';

export interface AuditNotificationPayload {
	runId: string;
	status: 'ok' | 'partial' | 'interrupted' | 'error' | 'unavailable';
	subjectCount?: number;
	error?: string | null;
	title?: string | null;
}

const ORIGINAL_TITLE_KEY = '__archinex_orig_title__';
const notifiedRuns = new Set<string>();

function getOriginalTitle(): string {
	if (typeof window === 'undefined') return 'Archinex';
	const saved = window.sessionStorage?.getItem(ORIGINAL_TITLE_KEY);
	if (saved) return saved;
	const current = document.title || 'Archinex';
	try {
		window.sessionStorage?.setItem(ORIGINAL_TITLE_KEY, current);
	} catch {
		// sessionStorage inaccessible
	}
	return current;
}

/** Demande l'autorisation pour les notifications Web de bureau. */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
	if (typeof window === 'undefined' || !('Notification' in window)) {
		return 'unsupported';
	}
	if (Notification.permission === 'default') {
		try {
			return await Notification.requestPermission();
		} catch {
			return Notification.permission;
		}
	}
	return Notification.permission;
}

/** Met à jour le titre de l'onglet pendant l'analyse en arrière-plan. */
export function updateAuditProgressTitle(label: string, done?: number, total?: number): void {
	if (typeof document === 'undefined') return;
	getOriginalTitle();
	const progressText = typeof done === 'number' && typeof total === 'number' && total > 0 ? ` (${done}/${total})` : '';
	document.title = `⏳ ${label}${progressText} · Archinex`;
}

/** Restaure le titre d'origine de l'onglet. */
export function resetAuditTitle(): void {
	if (typeof document === 'undefined') return;
	const orig = getOriginalTitle();
	if (orig) document.title = orig;
}

/**
 * Notifie l'utilisateur de l'achèvement ou de la suspension d'un dépouillement RFP :
 * 1. Notification native du navigateur (si autorisé).
 * 2. Toast global dans l'application.
 * 3. Titre de l'onglet mis à jour (clignotant / alerte jusqu'au focus).
 */
export function notifyAuditCompleted(payload: AuditNotificationPayload): void {
	if (typeof window === 'undefined') return;

	const dedupKey = `${payload.runId}:${payload.status}`;
	if (notifiedRuns.has(dedupKey)) return;
	notifiedRuns.add(dedupKey);
	setTimeout(() => notifiedRuns.delete(dedupKey), 15000);

	const isSuccess = payload.status === 'ok';
	const count = payload.subjectCount ?? 0;
	const docLabel = payload.title ? `« ${payload.title} »` : 'RFP';

	let notifTitle = '';
	let notifBody = '';
	let toastVariant: 'success' | 'warning' | 'error' = 'success';
	let titlePrefix = '';

	if (isSuccess) {
		notifTitle = 'Archinex · Dépouillement RFP terminé';
		notifBody = `L'analyse de ${docLabel} est prête (${count} sujet(s) d'architecture identifiés).`;
		toastVariant = 'success';
		titlePrefix = '✅ (Prêt !)';
	} else if (payload.status === 'partial') {
		notifTitle = 'Archinex · Dépouillement RFP incomplet';
		notifBody = count > 0
			? `L'analyse de ${docLabel} a produit ${count} sujet(s), mais certaines étapes ont été suspendues (reprise possible).`
			: `L'analyse de ${docLabel} a été suspendue : reprise possible depuis le cache.`;
		toastVariant = 'warning';
		titlePrefix = '⚠️ (Reprise possible)';
	} else {
		notifTitle = 'Archinex · Dépouillement interrompu';
		notifBody = payload.error || `L'analyse de ${docLabel} a été interrompue. Les étapes déjà calculées sont conservées.`;
		toastVariant = 'error';
		titlePrefix = '⚠️ (Interrompu)';
	}

	// 1. Mise à jour du titre d'onglet
	document.title = `${titlePrefix} ${getOriginalTitle()}`;
	const onFocus = () => {
		resetAuditTitle();
		window.removeEventListener('focus', onFocus);
	};
	window.addEventListener('focus', onFocus);

	// 2. Notification Toast intégrée
	toast(notifBody, {
		variant: toastVariant,
		duration: 12000
	});

	// 3. Notification native OS/Browser (visible même si l'onglet est masqué ou minimisé)
	if ('Notification' in window && Notification.permission === 'granted') {
		try {
			const n = new Notification(notifTitle, {
				body: notifBody,
				icon: '/favicon.png',
				tag: `archinex-rfp-${payload.runId}`
			});
			n.onclick = () => {
				window.focus();
				n.close();
			};
		} catch (err) {
			console.warn('[Notification] Impossible d\'émettre la notification native :', err);
		}
	}
}


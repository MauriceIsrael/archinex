/**
 * Global Toast Notification Queue
 *
 * Imperative API callable from anywhere (components, server actions, API handlers).
 * Renders via <Toaster> mounted in +layout.svelte.
 *
 * @usage
 *   import { toast } from '$lib/toast';
 *   toast('Saved!', { variant: 'success' });
 *   toast('Something went wrong', { variant: 'error', duration: 6000 });
 *
 * Variants: 'default' | 'success' | 'error' | 'warning' | 'info'
 */

/**
 * Identifiant local d'une notification. `crypto.randomUUID` n'existe qu'en contexte sécurisé (HTTPS ou localhost) :
 * en HTTP sur une adresse réseau (ex. http://100.x.y.z:5173), il est absent et l'appel lèverait une erreur.
 */
function newToastId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
	return `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info';

export type Toast = {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
};

class ToastState {
  /** Reactive toast queue — read by <Toaster> component. */
  queue = $state<Toast[]>([]);

  /**
   * Show a toast notification.
   * @param message  Text to display.
   * @param opts     Optional variant and duration (ms, default 4000).
   */
  show(
    message: string,
    opts?: { variant?: ToastVariant; duration?: number }
  ): string {
    const id = newToastId();
    const entry: Toast = {
      id,
      message,
      variant: opts?.variant ?? 'default',
      duration: opts?.duration ?? 4000,
    };
    this.queue = [...this.queue, entry];
    return id;
  }

  /**
   * Dismiss a specific toast by id.
   * Called automatically by <Toaster> after duration elapses.
   */
  dismiss(id: string): void {
    this.queue = this.queue.filter((t) => t.id !== id);
  }
}

const toastState = new ToastState();

/**
 * Access to the reactive toast queue.
 */
export const toastQueue = {
  get items() { return toastState.queue; }
};

/** Show a toast notification. */
export const toast = (msg: string, opts?: { variant?: ToastVariant; duration?: number }) => toastState.show(msg, opts);

/** Dismiss a toast by id. */
export const dismiss = (id: string) => toastState.dismiss(id);

// Convenience shorthands
export const toastSuccess = (msg: string, opts?: { duration?: number }) =>
  toast(msg, { variant: 'success', ...opts });
export const toastError = (msg: string, opts?: { duration?: number }) =>
  toast(msg, { variant: 'error', ...opts });

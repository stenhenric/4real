export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastQueueItem {
  id: string;
  message: string;
  type: ToastType;
  rotation: number;
}

export const TOAST_MESSAGE_TARGET_LENGTH = 50;
export const TOAST_AUTO_DISMISS_MS = 5000;

export function normalizeToastMessage(message: string) {
  return message.trim().replace(/\s+/g, ' ');
}

export function compactToastQueue(currentToasts: ToastQueueItem[], nextToast: ToastQueueItem) {
  const replacedIds: string[] = [];
  const toasts = currentToasts.filter((toast) => {
    const isDuplicate = toast.type === nextToast.type && toast.message === nextToast.message;
    if (isDuplicate) {
      replacedIds.push(toast.id);
    }

    return !isDuplicate;
  });

  return {
    replacedIds,
    toasts: [...toasts, nextToast],
  };
}

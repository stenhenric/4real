import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../utils/cn';
import { SketchyButton } from '../components/SketchyButton';
import {
  TOAST_AUTO_DISMISS_MS,
  compactToastQueue,
  normalizeToastMessage,
  type ToastQueueItem,
  type ToastType,
} from './toast-rules';

type Toast = ToastQueueItem;

interface ToastContextType {
  addToast: (message: string, type: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

function createToastId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : typeof crypto !== 'undefined' && crypto.getRandomValues ? `${Date.now()}-${Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('')}` : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutsRef = useRef(new Map<string, number>());

  const clearToastTimeout = useCallback((id: string) => {
    const timeoutId = timeoutsRef.current.get(id);
    if (!timeoutId) {
      return;
    }

    window.clearTimeout(timeoutId);
    timeoutsRef.current.delete(id);
  }, []);

  const removeToast = useCallback((id: string) => {
    clearToastTimeout(id);
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
  }, [clearToastTimeout]);

  const addToast = useCallback(
    (rawMessage: string, type: ToastType) => {
      const message = normalizeToastMessage(rawMessage);
      if (!message) {
        return;
      }

      const id = createToastId();
      const rotation = Math.random() * 2 - 1;
      const nextToast = { id, message, type, rotation };

      setToasts((currentToasts) => {
        const nextQueue = compactToastQueue(currentToasts, nextToast);
        nextQueue.replacedIds.forEach(clearToastTimeout);
        return nextQueue.toasts;
      });

      const timeoutId = window.setTimeout(() => {
        removeToast(id);
      }, TOAST_AUTO_DISMISS_MS);

      timeoutsRef.current.set(id, timeoutId);
    },
    [clearToastTimeout, removeToast],
  );

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutsRef.current.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      addToast,
      success: (message: string) => addToast(message, 'success'),
      error: (message: string) => addToast(message, 'error'),
      warning: (message: string) => addToast(message, 'warning'),
      info: (message: string) => addToast(message, 'info'),
    }),
    [addToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-atomic="true"
        aria-label="Notifications"
        aria-live="polite"
        className="fixed bottom-4 left-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none sm:left-auto sm:w-full sm:max-w-sm"
        role="region"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-start justify-between gap-3 p-4 shadow-xl rough-border animate-in slide-in-from-right-8 fade-in duration-300',
              toast.type === 'success' && 'bg-[#dcfce7] border-green-800 text-green-900',
              toast.type === 'error' && 'bg-[#fee2e2] border-red-800 text-red-900',
              toast.type === 'warning' && 'bg-[#fef3c7] border-yellow-800 text-yellow-900',
              toast.type === 'info' && 'bg-[#e0f2fe] border-blue-800 text-blue-900',
            )}
            role={toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'}
            style={{ transform: `rotate(${toast.rotation}deg)` }}
          >
            <div className="min-w-0 flex-1">
              <p className="font-bold font-sans text-sm leading-snug break-words">{toast.message}</p>
            </div>
            <SketchyButton
              aria-label="Close"
              className="flex-shrink-0 p-1 opacity-50 transition-opacity hover:opacity-100"
              onClick={() => removeToast(toast.id)}
              type="button"
            >
              <X size={16} />
            </SketchyButton>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
}

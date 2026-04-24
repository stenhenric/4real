import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../utils/cn';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  rotation: number;
}

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
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutsRef = useRef(new Map<string, number>());

  const removeToast = useCallback((id: string) => {
    const timeoutId = timeoutsRef.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutsRef.current.delete(id);
    }

    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType) => {
      const id = createToastId();
      const rotation = Math.random() * 2 - 1;

      setToasts((currentToasts) => [...currentToasts, { id, message, type, rotation }]);

      const timeoutId = window.setTimeout(() => {
        removeToast(id);
      }, 5000);

      timeoutsRef.current.set(id, timeoutId);
    },
    [removeToast],
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
        className="fixed bottom-4 right-4 z-[100] flex max-w-sm w-full flex-col gap-2 pointer-events-none"
        role="region"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-start justify-between p-4 shadow-xl rough-border animate-in slide-in-from-right-8 fade-in duration-300',
              toast.type === 'success' && 'bg-[#dcfce7] border-green-800 text-green-900',
              toast.type === 'error' && 'bg-[#fee2e2] border-red-800 text-red-900',
              toast.type === 'warning' && 'bg-[#fef3c7] border-yellow-800 text-yellow-900',
              toast.type === 'info' && 'bg-[#e0f2fe] border-blue-800 text-blue-900',
            )}
            role={toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'}
            style={{ transform: `rotate(${toast.rotation}deg)` }}
          >
            <div className="mr-2 flex-1">
              <p className="font-bold font-sans text-sm">{toast.message}</p>
            </div>
            <button
              aria-label="Close"
              className="opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
              onClick={() => removeToast(toast.id)}
              type="button"
            >
              <X size={16} />
            </button>
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

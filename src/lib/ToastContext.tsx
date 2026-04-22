import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from './utils';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  addToast: (message: string, type: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);

    // Auto dismiss after 5 seconds
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  }, [removeToast]);

  const success = useCallback((message: string) => addToast(message, 'success'), [addToast]);
  const error = useCallback((message: string) => addToast(message, 'error'), [addToast]);
  const warning = useCallback((message: string) => addToast(message, 'warning'), [addToast]);
  const info = useCallback((message: string) => addToast(message, 'info'), [addToast]);

  return (
    <ToastContext.Provider value={{ addToast, success, error, warning, info }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-start justify-between p-4 shadow-xl rough-border animate-in slide-in-from-right-8 fade-in duration-300",
              toast.type === 'success' && "bg-[#dcfce7] border-green-800 text-green-900",
              toast.type === 'error' && "bg-[#fee2e2] border-red-800 text-red-900",
              toast.type === 'warning' && "bg-[#fef3c7] border-yellow-800 text-yellow-900",
              toast.type === 'info' && "bg-[#e0f2fe] border-blue-800 text-blue-900"
            )}
            style={{
              // Add a slight random rotation for the sketchy feel
              transform: `rotate(${Math.random() * 2 - 1}deg)`,
            }}
          >
            <div className="flex-1 mr-2">
              <p className="font-bold font-sans text-sm">{toast.message}</p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

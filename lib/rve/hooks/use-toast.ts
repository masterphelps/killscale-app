'use client'
import { useState, useCallback } from 'react';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  variant?: 'default' | 'destructive';
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
}

let toastCount = 0;

export function useToast() {
  const [state, setState] = useState<ToastState>({ toasts: [] });

  const toast = useCallback((props: Omit<Toast, 'id'>) => {
    const id = (++toastCount).toString();
    const newToast: Toast = {
      id,
      ...props,
    };

    setState((prevState) => ({
      toasts: [...prevState.toasts, newToast],
    }));

    // Auto-dismiss toast after duration
    const duration = props.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        setState((prevState) => ({
          toasts: prevState.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }

    return {
      id,
      dismiss: () => {
        setState((prevState) => ({
          toasts: prevState.toasts.filter((t) => t.id !== id),
        }));
      },
      update: (updatedProps: Partial<Toast>) => {
        setState((prevState) => ({
          toasts: prevState.toasts.map((t) =>
            t.id === id ? { ...t, ...updatedProps } : t
          ),
        }));
      },
    };
  }, []);

  const dismiss = useCallback((toastId?: string) => {
    setState((prevState) => ({
      toasts: toastId
        ? prevState.toasts.filter((t) => t.id !== toastId)
        : [],
    }));
  }, []);

  return {
    toast,
    dismiss,
    toasts: state.toasts,
  };
}

// Export a singleton toast function for convenience
let globalToast: ReturnType<typeof useToast> | null = null;

export function toast(props: Omit<Toast, 'id'>) {
  if (!globalToast) {
    console.warn('Toast called before useToast hook was initialized');
    return {
      id: '',
      dismiss: () => {},
      update: () => {},
    };
  }
  return globalToast.toast(props);
}

// Set the global toast instance
export function setGlobalToast(toastInstance: ReturnType<typeof useToast>) {
  globalToast = toastInstance;
} 
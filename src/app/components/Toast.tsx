import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect } from 'react';

export interface ToastState {
  kind: 'success' | 'error';
  message: string;
}

export function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 2000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div className={`app-toast ${toast.kind}`} role="status" aria-live="polite">
      {toast.kind === 'success' ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
      <span>{toast.message}</span>
    </div>
  );
}

import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';

export interface ConfirmOptions {
  title: string;
  message: string;
  warning?: string;
  confirmLabel: string;
}

export function ConfirmDialog({
  options,
  onCancel,
  onConfirm,
}: {
  options: ConfirmOptions;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onCancel, busy]);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="confirm-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section className="confirm-card" role="alertdialog" aria-modal="true" aria-label={options.title}>
        <header>
          <span className="confirm-icon"><AlertTriangle size={20} /></span>
          <div><h2>{options.title}</h2></div>
          <button type="button" className="close-button" onClick={onCancel} disabled={busy} aria-label={t('close')}>
            <X size={18} />
          </button>
        </header>
        <div className="confirm-body">
          <p>{options.message}</p>
          {options.warning && <p className="confirm-warning">{options.warning}</p>}
        </div>
        <footer>
          <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>{t('cancel')}</button>
          <button type="button" className="danger-button" onClick={() => void confirm()} disabled={busy}>
            {busy ? <><span className="mini-spinner" /> {t('deleting')}</> : options.confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}

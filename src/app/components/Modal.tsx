import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from '../../i18n';

export function Modal({
  title,
  children,
  onClose,
  wide = false,
  hideEyebrow = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  hideEyebrow?: boolean;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`modal-card ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <div>
            {!hideEyebrow && <span>{t('configuration')}</span>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t('close')}><X size={20} /></button>
        </header>
        <div className="modal-content">{children}</div>
      </section>
    </div>
  );
}

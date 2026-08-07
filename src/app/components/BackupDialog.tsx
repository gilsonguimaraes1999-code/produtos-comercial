import { CheckCircle2, DatabaseBackup, Download, History, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { translateAppError, useTranslation } from '../../i18n';
import { backupApi } from '../api';
import type { BackupRecord, BackupResult } from '../types';

export function BackupDialog({ token }: { token: string }) {
  const { locale, t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [backup, setBackup] = useState<BackupResult | null>(null);
  const [history, setHistory] = useState<BackupRecord[]>([]);

  const loadBackups = useCallback(async () => {
    const result = await backupApi.list(token);
    setHistory(result.backups);
  }, [token]);

  useEffect(() => {
    void loadBackups().catch(() => setHistory([]));

    const timer = window.setInterval(() => {
      void loadBackups().catch(() => undefined);
    }, 5000);

    const onFocus = () => {
      void loadBackups().catch(() => undefined);
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [loadBackups]);

  function downloadBackup(nextBackup: BackupResult | BackupRecord) {
    const content = nextBackup.snapshot || {};
    const fileName = nextBackup.fileName || `santagroup-backup-${nextBackup.id}.json`;
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  async function createBackup() {
    setSaving(true);
    setError('');
    setErrorDetail('');
    try {
      const result = await backupApi.create(token);
      setBackup(result.backup);
      setHistory((items) => [{ id: result.backup.id, createdAt: result.backup.createdAt, fileName: result.backup.fileName, snapshot: result.backup.snapshot }, ...items]);
      downloadBackup(result.backup);
      void loadBackups().catch(() => undefined);
    } catch (err) {
      setError(translateAppError(err, t, 'backupError'));
      setErrorDetail(err && typeof err === 'object' && 'technicalMessage' in err ? String(err.technicalMessage || '') : '');
    } finally {
      setSaving(false);
    }
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImporting(true);
    setError('');
    setErrorDetail('');
    try {
      const text = await file.text();
      const snapshot = JSON.parse(text) as unknown;
      await backupApi.import(token, snapshot);
      window.location.reload();
    } catch (err) {
      setError(err instanceof SyntaxError ? t('backupInvalidFile') : translateAppError(err, t, 'backupImportError'));
      setErrorDetail(err && typeof err === 'object' && 'technicalMessage' in err ? String(err.technicalMessage || '') : '');
      setImporting(false);
    }
  }

  return (
    <section className="backup-page">
      <div className="shop-head">
        <span>{t('configuration')}</span>
        <h1>{t('backup')}</h1>
        <p>{t('backupPageDescription')}</p>
      </div>

      <div className="backup-intro">
        <span><DatabaseBackup size={24} /></span>
        <div>
          <strong>{t('backupSnapshotTitle')}</strong>
          <p>{t('backupSnapshotDescription')}</p>
        </div>
      </div>

      {error && <p className="form-error normal-case">{error}{errorDetail && <small>{errorDetail}</small>}</p>}

      {backup && (
        <div className="backup-result">
          <CheckCircle2 size={20} />
          <div>
            <strong>{t('backupCreated')}</strong>
            <small>
              {new Date(backup.createdAt).toLocaleString(locale)} · {backup.categoriesCount} {t('categories').toLowerCase()} · {backup.productsCount} {t('products').toLowerCase()} · {backup.usersCount} {t('users').toLowerCase()}
            </small>
            <code>{backup.fileName || backup.id}</code>
            <button type="button" className="backup-download-link" onClick={() => downloadBackup(backup)}>
              <Download size={15} /> {t('downloadBackup')}
            </button>
          </div>
        </div>
      )}

      <div className="backup-actions">
        <button type="button" className="primary-button" onClick={createBackup} disabled={saving || importing}>
          <DatabaseBackup size={17} /> {saving ? t('creatingBackup') : t('createBackupNow')}
        </button>
        <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()} disabled={saving || importing}>
          <Upload size={17} /> {importing ? t('importingBackup') : t('importBackup')}
        </button>
        <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={importBackup} />
      </div>

      <div className="backup-history">
        <h2><History size={18} /> {t('backupHistory')}</h2>
        {history.length ? (
          <div className="backup-history-list">
            {history.map((item) => (
              <article key={`${item.id}-${item.createdAt}`}>
                <code>{item.id}</code>
                <span>{new Date(item.createdAt).toLocaleString(locale)}</span>
                <button type="button" onClick={() => downloadBackup(item)} aria-label={t('downloadBackup')} title={t('downloadBackup')}>
                  <Download size={15} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p>{t('backupHistoryEmpty')}</p>
        )}
      </div>
    </section>
  );
}

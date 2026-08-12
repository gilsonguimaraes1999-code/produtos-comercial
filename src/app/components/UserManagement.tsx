import { Check, Clock, Pencil, Plus, ShieldCheck, Trash2, UserRound, XCircle } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { translateAppError, useTranslation } from '../../i18n';
import { accessRequestsApi, usersApi } from '../api';
import { useAuth } from '../auth';
import { normalizeUserPermissions, PRODUCT_PERMISSIONS } from '../permissions';
import type { AccessRequest, AuthUser, ProductPermission, UserPayload, UserRole } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { RoleSelect } from './RoleSelect';

const blankUser: UserPayload = { name: '', username: '', password: '', role: 'COMERCIAL', active: true, permissions: normalizeUserPermissions(undefined) };

const productPermissionLabels: Record<ProductPermission, string> = {
  createProduct: 'Criar produto',
  editProductCategory: 'Editar categoria do produto',
  editProductName: 'Editar nome do produto',
  editProductPrice: 'Editar valor do produto',
  editProductDescription: 'Editar descrição do produto',
  editProductMedia: 'Editar imagens/vídeos do produto',
  markProductSold: 'Marcar como vendido',
  viewSoldDiscordId: 'Ver Discord ID do dono',
  cloneProduct: 'Clonar produto',
  deleteProduct: 'Excluir produto',
  moveProduct: 'Mover produto',
};

export function UserManagement({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { token, user: currentUser, replaceUser } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [editing, setEditing] = useState<UserPayload | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [requestBusy, setRequestBusy] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let active = true;

    Promise.all([usersApi.list(token), accessRequestsApi.list(token)])
      .then(([usersResult, requestsResult]) => {
        if (!active) return;
        setUsers(usersResult.users);
        setRequests(requestsResult.requests);
      })
      .catch((err) => {
        console.error(err);
        setError(translateAppError(err, t, 'deleteUserError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token, t]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    if (!editing.name.trim() || !editing.username.trim()) return setError(t('fillNameUser'));
    if (!editing.id && !editing.password) return setError(t('definePassword'));
    setSaving(true);
    setError('');
    try {
      const result = await usersApi.save(token, {
        ...editing,
        permissions: normalizeUserPermissions(editing.permissions),
      });
      setUsers(result.users);
      const updatedCurrent = result.users.find((item) => item.id === currentUser?.id);
      if (updatedCurrent) replaceUser(updatedCurrent);
      setEditing(null);
    } catch (err) {
      console.error(err);
      setError(translateAppError(err, t, 'saveUserError'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(target: AuthUser) {
    setError('');
    try {
      const result = await usersApi.remove(token, target.id);
      const requestsResult = await accessRequestsApi.list(token);
      setUsers(result.users);
      setRequests(requestsResult.requests);
      setPendingRemoval(null);
    } catch (err) {
      console.error(err);
      setError(translateAppError(err, t, 'deleteUserError'));
      setPendingRemoval(null);
    }
  }

  async function approveRequest(item: AccessRequest) {
    setRequestBusy(item.id);
    setError('');
    try {
      const result = await accessRequestsApi.approve(token, item.id, 'COMERCIAL', normalizeUserPermissions(undefined));
      setUsers(result.users);
      setRequests(result.requests);
    } catch (err) {
      console.error(err);
      setError(translateAppError(err, t, 'saveUserError'));
    } finally {
      setRequestBusy(null);
    }
  }

  async function rejectRequest(item: AccessRequest) {
    setRequestBusy(item.id);
    setError('');
    try {
      const result = await accessRequestsApi.reject(token, item.id);
      setRequests(result.requests);
    } catch (err) {
      console.error(err);
      setError(translateAppError(err, t, 'deleteUserError'));
    } finally {
      setRequestBusy(null);
    }
  }

  function roleLabel(role: UserRole) {
    return role === 'OWNER' ? t('owner') : t('commercial');
  }

  function statusLabel(status: string) {
    return status === 'Ativo' ? t('active') : t('inactive');
  }

  function requestStatusLabel(status: AccessRequest['status']) {
    if (status === 'APROVADO') return t('accessStatusApproved');
    if (status === 'REPROVADO') return t('accessStatusRejected');
    if (status === 'REMOVIDO') return t('accessStatusRemoved');
    return t('accessStatusPending');
  }

  function toggleEditUser(item: AuthUser) {
    if (editing?.id === item.id) {
      setEditing(null);
      return;
    }
    setEditing({
      id: item.id,
      name: item.name,
      username: item.username,
      password: '',
      role: item.role,
      permissions: normalizeUserPermissions(item.permissions),
      active: item.status === 'Ativo',
    });
  }

  const pendingRequests = requests.filter((item) => item.status === 'PENDENTE');
  const historyRequests = requests.filter((item) => item.status !== 'PENDENTE');

  return (
    <div className="users-layout">
      <div className="users-toolbar">
        <div><strong>{t('exhibitorPermissions')}</strong><p>{t('permissionsHint')}</p></div>
        <div className="users-toolbar-actions">
          <button type="button" className="secondary-button history-toggle icon-only" onClick={() => setShowHistory(true)} aria-label={t('accessHistory')} title={t('accessHistory')}><Clock size={17} /></button>
          <button type="button" className="primary-button" onClick={() => setEditing({ ...blankUser })}><Plus size={17} /> {t('newAccount')}</button>
        </div>
      </div>
      {error && <p className="form-error normal-case">{error}</p>}

      {loading ? <div className="center-message"><span className="spinner" /> {t('loadingUsers')}</div> : (
        <>
          <div className="access-requests-panel">
            <div className="access-requests-header">
              <div><strong>{t('accessRequests')}</strong><p>{t('accessPendingHint')}</p></div>
            </div>
            {pendingRequests.length ? (
              <div className="access-requests-list">
                {pendingRequests.map((item) => (
                  <article key={item.id}>
                    <span className="user-avatar"><Clock size={18} /></span>
                    <div><strong>{item.name}</strong><small>@{item.username} - {item.cityName}</small></div>
                    <span className={`status-dot request-${item.status.toLowerCase()}`}>{requestStatusLabel(item.status)}</span>
                    <div className="row-actions">
                      <button type="button" disabled={requestBusy === item.id} onClick={() => approveRequest(item)} aria-label={t('approveAccess')} title={t('approveAccess')}><Check size={16} /></button>
                      <button type="button" disabled={requestBusy === item.id} onClick={() => rejectRequest(item)} aria-label={t('rejectAccess')} title={t('rejectAccess')}><XCircle size={16} /></button>
                    </div>
                  </article>
                ))}
              </div>
            ) : <p className="muted-small">{t('noPendingAccessRequests')}</p>}
          </div>

          <div className="users-list">
            {users.map((item) => (
              <article key={item.id}>
                <span className="user-avatar">{item.role === 'OWNER' ? <ShieldCheck size={20} /> : <UserRound size={20} />}</span>
                <div><strong>{item.name}</strong><small>@{item.username}</small></div>
                <span className={`role-pill ${item.role.toLowerCase()}`}>{roleLabel(item.role)}</span>
                <span className={`status-dot ${item.status === 'Ativo' ? 'on' : 'off'}`}>{statusLabel(item.status)}</span>
                <div className="row-actions">
                  <button type="button" className={editing?.id === item.id ? 'active' : ''} onClick={() => toggleEditUser(item)} aria-label={t('editUserAction', { name: item.name })} title={t('editUserAction', { name: item.name })}><Pencil size={16} /></button>
                  <button type="button" onClick={() => setPendingRemoval(item)} disabled={item.id === currentUser?.id} aria-label={t('deleteUserAction', { name: item.name })} title={t('deleteUserAction', { name: item.name })}><Trash2 size={16} /></button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {editing && (
        <form onSubmit={save} className="embedded-form">
          <div className="embedded-form-title"><strong>{editing.id ? t('editAccount') : t('newAccount')}</strong><button type="button" onClick={() => setEditing(null)}>{t('close')}</button></div>
          <div className="two-columns">
            <label className="field-label">{t('name')}<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <label className="field-label">{t('username')}<input value={editing.username} onChange={(e) => setEditing({ ...editing, username: e.target.value })} /></label>
          </div>
          <div className="two-columns">
            <label className="field-label">{t('password')}<input type="password" value={editing.password || ''} onChange={(e) => setEditing({ ...editing, password: e.target.value })} placeholder={editing.id ? t('leaveEmptyPassword') : t('requiredPassword')} /></label>
            <div className="field-label">{t('role')}<RoleSelect value={editing.role} onChange={(role) => setEditing({ ...editing, role })} /></div>
          </div>
          <div className="permission-editor">
            <strong>{t('productPermissions')}</strong>
            <p>{t('productPermissionsHint')}</p>
            <div className="permission-grid">
              {PRODUCT_PERMISSIONS.map((permission) => {
                const normalized = normalizeUserPermissions(editing.permissions);
                const checked = editing.role === 'OWNER' || normalized.product?.[permission] === true;
                return (
                  <label key={permission} className={`remember-row account-active-row permission-toggle${checked ? ' is-checked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={editing.role === 'OWNER'}
                      onChange={(event) => {
                        const next = normalizeUserPermissions(editing.permissions);
                        next.product = { ...next.product, [permission]: event.target.checked };
                        setEditing({ ...editing, permissions: next });
                      }}
                    />
                    <span className="remember-dot" aria-hidden="true" />
                    <span>{productPermissionLabels[permission]}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <label className="remember-row account-active-row"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /><span className="remember-dot" aria-hidden="true" /><span>{t('activeAccount')}</span></label>
          <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setEditing(null)}>{t('cancel')}</button><button className="primary-button" disabled={saving}>{saving ? t('saving') : t('saveAccount')}</button></div>
        </form>
      )}

      <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>{t('closeSettings')}</button></div>

      {showHistory && (
        <div className="history-modal-overlay" role="dialog" aria-modal="true" aria-label={t('accessHistoryTitle')}>
          <div className="history-modal-card">
            <div className="history-modal-header">
              <div>
                <span>{t('configuration')}</span>
                <strong>{t('accessHistoryTitle')}</strong>
                <p>{t('accessHistoryHint')}</p>
              </div>
              <button type="button" onClick={() => setShowHistory(false)} aria-label={t('close')} title={t('close')}><XCircle size={18} /></button>
            </div>
            {historyRequests.length ? (
              <div className="access-requests-list history-modal-list">
                {historyRequests.map((item) => (
                  <article key={item.id} className="history-request-item">
                    <span className="user-avatar"><Clock size={18} /></span>
                    <div>
                      <strong>{item.name}</strong>
                      <small>@{item.username} - {item.cityName}</small>
                      {(item.reviewedAt || item.reviewedBy) && <small className="request-meta">{item.reviewedBy || ''}{item.reviewedAt ? ` - ${item.reviewedAt}` : ''}</small>}
                    </div>
                    <span className={`status-dot request-${item.status.toLowerCase()}`}>{requestStatusLabel(item.status)}</span>
                    <div className="row-actions">
                      {item.status === 'REPROVADO' && (
                        <button type="button" disabled={requestBusy === item.id} onClick={() => approveRequest(item)} aria-label={t('approveAccess')} title={t('approveAccess')}><Check size={16} /></button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : <p className="muted-small history-modal-empty">{t('noAccessHistory')}</p>}
          </div>
        </div>
      )}

      {pendingRemoval && (
        <ConfirmDialog
          options={{
            title: t('deleteUser'),
            message: t('deleteUserMessage', { name: pendingRemoval.name }),
            warning: t('irreversible'),
            confirmLabel: t('deleteUser'),
          }}
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => remove(pendingRemoval)}
        />
      )}
    </div>
  );
}

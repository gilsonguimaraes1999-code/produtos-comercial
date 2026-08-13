import { ArrowLeft, ArrowUpDown, Building2, Check, Clock, Pencil, Plus, Search, ShieldCheck, Trash2, UserRound, X, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { translateAppError, useTranslation } from '../../i18n';
import { accessRequestsApi, usersApi } from '../api';
import { useAuth } from '../auth';
import { normalizeUserPermissions, PRODUCT_PERMISSIONS } from '../permissions';
import type { AccessRequest, AuthUser, City, ProductPermission, UserPayload, UserRole } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { Modal } from './Modal';
import { RoleSelect } from './RoleSelect';
import { UserFilterDatePicker, UserFilterSelect } from './UserFilterControls';

const blankUser = (allowedCityIds: string[]): UserPayload => ({ name: '', username: '', password: '', role: 'COMERCIAL', active: true, permissions: normalizeUserPermissions(undefined), allowedCityIds });

function userCreatedAtTime(value?: string) {
  if (!value) return Number.NaN;
  const direct = Date.parse(value);
  if (Number.isFinite(direct)) return direct;
  const brazilianDate = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value.trim());
  if (!brazilianDate) return Number.NaN;
  return new Date(Number(brazilianDate[3]), Number(brazilianDate[2]) - 1, Number(brazilianDate[1])).getTime();
}

function formatUserCreationDate(value: string | undefined, locale: string, emptyLabel: string) {
  const timestamp = userCreatedAtTime(value);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(timestamp)
    : emptyLabel;
}

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

export function UserManagement({ cities, onClose }: { cities: City[]; onClose: () => void }) {
  const { t, locale } = useTranslation();
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
  const [query, setQuery] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [cityFilter, setCityFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [requestCitySelections, setRequestCitySelections] = useState<Record<string, string[]>>({});

  const allCityIds = useMemo(() => cities.map((city) => city.id), [cities]);
  const cityNameById = useMemo(() => Object.fromEntries(cities.map((city) => [city.id, city.name])), [cities]);

  useEffect(() => {
    let active = true;

    Promise.all([usersApi.list(token), accessRequestsApi.list(token)])
      .then(([usersResult, requestsResult]) => {
        if (!active) return;
        setUsers(usersResult.users);
        setRequests(requestsResult.requests);
        setRequestCitySelections(Object.fromEntries(requestsResult.requests.map((request) => [
          request.id,
          cities.filter((city) => (request.requestedCityNames?.length ? request.requestedCityNames : [request.cityName]).includes(city.name)).map((city) => city.id),
        ])));
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
  }, [cities, token, t]);

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
        allowedCityIds: editing.role === 'OWNER' ? allCityIds : editing.allowedCityIds,
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
      const result = await accessRequestsApi.approve(
        token,
        item.id,
        'COMERCIAL',
        normalizeUserPermissions(undefined),
        requestCitySelections[item.id] || [],
      );
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
    setError('');
    setEditing({
      id: item.id,
      name: item.name,
      username: item.username,
      password: '',
      role: item.role,
      permissions: normalizeUserPermissions(item.permissions),
      allowedCityIds: item.allowedCityIds === undefined ? allCityIds : item.allowedCityIds,
      active: item.status === 'Ativo',
    });
  }

  const pendingRequests = requests.filter((item) => item.status === 'PENDENTE');
  const historyRequests = requests.filter((item) => item.status !== 'PENDENTE');
  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
    return users
      .filter((item) => {
        const normalizedRole = String(item.role || '').trim().toUpperCase() as UserRole;
        const hasGeneralCityAccess = normalizedRole === 'OWNER' || item.allowedCityIds === undefined || item.allowedCityIds.length === allCityIds.length;
        const cityNames = item.allowedCityIds === undefined
          ? 'todas as cidades compatibilidade acesso geral'
          : item.allowedCityIds.map((id) => cityNameById[id] || '').join(' ');
        const roleName = normalizedRole === 'OWNER' ? t('owner') : t('commercial');
        const matchesQuery = !normalizedQuery || [item.name, item.username, roleName, cityNames].join(' ').toLocaleLowerCase('pt-BR').includes(normalizedQuery);
        const matchesRole = roleFilter === 'ALL' || normalizedRole === roleFilter;
        const matchesCity = cityFilter === 'ALL'
          || (cityFilter === 'GENERAL_ACCESS' ? hasGeneralCityAccess : Array.isArray(item.allowedCityIds) && item.allowedCityIds.includes(cityFilter));
        const createdAt = userCreatedAtTime(item.createdAt);
        const fromTime = createdFrom ? new Date(`${createdFrom}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
        const toTime = createdTo ? new Date(`${createdTo}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
        const matchesCreationDate = (!createdFrom && !createdTo) || (Number.isFinite(createdAt) && createdAt >= fromTime && createdAt <= toTime);
        return matchesQuery && matchesRole && matchesCity && matchesCreationDate;
      })
      .sort((first, second) => {
        const result = first.name.localeCompare(second.name, 'pt-BR', { sensitivity: 'base' });
        return sortDirection === 'asc' ? result : -result;
      });
  }, [allCityIds, cityFilter, cityNameById, createdFrom, createdTo, query, roleFilter, sortDirection, t, users]);

  function toggleCity(values: string[], cityId: string) {
    return values.includes(cityId) ? values.filter((id) => id !== cityId) : [...values, cityId];
  }

  function citySummary(ids: string[] | undefined, role?: UserRole) {
    if (role === 'OWNER') return t('allCities');
    if (ids === undefined) return t('allCitiesCompatibility');
    return ids.map((id) => cityNameById[id]).filter(Boolean).join(', ') || 'Nenhuma cidade';
  }

  return (
    <section className="users-layout users-page">
      <div className="template-page-head users-page-head">
        <button type="button" className="secondary-button icon-only" onClick={onClose} aria-label="Voltar"><ArrowLeft size={18} /></button>
        <span><ShieldCheck size={20} /></span>
        <div><p>{t('configuration')}</p><h1>{t('usersPermissions')}</h1><small>{t('manageRolesAndCities')}</small></div>
      </div>
      <div className="users-toolbar">
        <div><strong>{t('exhibitorPermissions')}</strong><p>{t('permissionsHint')}</p></div>
      </div>
      <div className="users-catalog-toolbar">
        <div className="users-search-toolbar">
          <label className="users-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('userSearchPlaceholder')} />{query && <button type="button" onClick={() => setQuery('')} aria-label={t('clearSearch')} title={t('clearSearch')}><X size={15} /></button>}</label>
        </div>
        <div className="users-filter-grid" aria-label={t('userFilters')}>
          <label><span>{t('city')}</span><UserFilterSelect value={cityFilter} onChange={setCityFilter} ariaLabel={t('filterByCity')} icon={Building2} options={[{ value: 'ALL', label: t('allCities') }, { value: 'GENERAL_ACCESS', label: t('generalAccessCompatibility') }, ...cities.map((city) => ({ value: city.id, label: city.name }))]} /></label>
          <label><span>{t('role')}</span><UserFilterSelect value={roleFilter} onChange={(value) => setRoleFilter(value as 'ALL' | UserRole)} ariaLabel={t('filterByRole')} icon={ShieldCheck} options={[{ value: 'ALL', label: t('allRoles') }, { value: 'OWNER', label: t('owner') }, { value: 'COMERCIAL', label: t('commercial') }]} /></label>
          <label><span>{t('createdFrom')}</span><UserFilterDatePicker value={createdFrom} onChange={(value) => { setCreatedFrom(value); if (value && createdTo && value > createdTo) setCreatedTo(value); }} ariaLabel={t('creationStartDate')} /></label>
          <label><span>{t('createdTo')}</span><UserFilterDatePicker value={createdTo} onChange={setCreatedTo} min={createdFrom || undefined} ariaLabel={t('creationEndDate')} /></label>
        </div>
        <div className="users-catalog-actions owner-actions">
          <button type="button" className="secondary-button history-toggle" onClick={() => setShowHistory(true)}><Clock size={16} /> {t('accessHistory')}</button>
          <button type="button" className="secondary-button" onClick={() => { setError(''); setEditing(blankUser(allCityIds)); }}><Plus size={16} /> {t('newAccount')}</button>
          <button type="button" className="secondary-button" onClick={() => setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')}><ArrowUpDown size={16} /> {sortDirection === 'asc' ? 'A → Z' : 'Z → A'}</button>
          {(cityFilter !== 'ALL' || roleFilter !== 'ALL' || createdFrom || createdTo) && <button type="button" className="secondary-button users-clear-filters" onClick={() => { setCityFilter('ALL'); setRoleFilter('ALL'); setCreatedFrom(''); setCreatedTo(''); }}><X size={15} /> {t('clearFilters')}</button>}
        </div>
        <div className="users-filter-status" aria-live="polite">
          {t('usersFound', { visible: visibleUsers.length, total: users.length })}
          {(createdFrom || createdTo) && <span>{t('period')}: {createdFrom ? formatUserCreationDate(`${createdFrom}T12:00:00`, locale, t('noDateRegistered')) : t('beginning')} – {createdTo ? formatUserCreationDate(`${createdTo}T12:00:00`, locale, t('noDateRegistered')) : t('today')}</span>}
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
                    <div><strong>{item.name}</strong><small>@{item.username}</small><small><b>{t('requestedCities')}:</b> {(item.requestedCityNames?.length ? item.requestedCityNames : [item.cityName]).filter(Boolean).join(', ')}</small></div>
                    <div className="city-permission-picker compact" aria-label={t('requestedCitiesBy', { name: item.name })}>
                      {cities.map((city) => {
                        const checked = (requestCitySelections[item.id] || []).includes(city.id);
                        return <label key={city.id} className={checked ? 'is-checked' : ''}><input type="checkbox" checked={checked} onChange={() => setRequestCitySelections((current) => ({ ...current, [item.id]: toggleCity(current[item.id] || [], city.id) }))} /><span className="remember-dot" aria-hidden="true" /><span>{city.name}</span></label>;
                      })}
                    </div>
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
            {visibleUsers.map((item) => (
              <article key={item.id}>
                <span className="user-avatar">{item.role === 'OWNER' ? <ShieldCheck size={20} /> : <UserRound size={20} />}</span>
                <div><strong>{item.name}</strong><small>@{item.username}</small><small>{t('citiesLabel')}: {citySummary(item.allowedCityIds, item.role)}</small><small>{t('accountCreated')}: {formatUserCreationDate(item.createdAt, locale, t('noDateRegistered'))}</small></div>
                <span className={`role-pill ${item.role.toLowerCase()}`}>{roleLabel(item.role)}</span>
                <span className={`status-dot ${item.status === 'Ativo' ? 'on' : 'off'}`}>{statusLabel(item.status)}</span>
                <div className="row-actions">
                  <button type="button" className={editing?.id === item.id ? 'active' : ''} onClick={() => toggleEditUser(item)} aria-label={t('editUserAction', { name: item.name })} title={t('editUserAction', { name: item.name })}><Pencil size={16} /></button>
                  <button type="button" onClick={() => setPendingRemoval(item)} disabled={item.id === currentUser?.id} aria-label={t('deleteUserAction', { name: item.name })} title={t('deleteUserAction', { name: item.name })}><Trash2 size={16} /></button>
                </div>
              </article>
            ))}
            {!visibleUsers.length && <p className="muted-small users-empty">{t('noUsersFound')}</p>}
          </div>
        </>
      )}

      {editing && (
        <Modal title={editing.id ? t('editAccount') : t('newAccount')} onClose={() => setEditing(null)} wide>
        <form onSubmit={save} className="embedded-form user-editor-modal-form">
          {error && <p className="form-error normal-case">{error}</p>}
          <div className="two-columns">
            <label className="field-label">{t('name')}<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <label className="field-label">{t('username')}<input value={editing.username} onChange={(e) => setEditing({ ...editing, username: e.target.value })} /></label>
          </div>
          <div className="two-columns">
            <label className="field-label">{t('password')}<input type="password" value={editing.password || ''} onChange={(e) => setEditing({ ...editing, password: e.target.value })} placeholder={editing.id ? t('leaveEmptyPassword') : t('requiredPassword')} /></label>
            <div className="field-label">{t('role')}<RoleSelect value={editing.role} onChange={(role) => setEditing({ ...editing, role })} /></div>
          </div>
          <div className="permission-editor">
            <strong>{t('allowedCities')}</strong>
            <p>{t('allowedCitiesHint')}</p>
            <div className="city-permission-picker">
              {cities.map((city) => {
                const checked = editing.role === 'OWNER' || editing.allowedCityIds.includes(city.id);
                return <label key={city.id} className={checked ? 'is-checked' : ''}><input type="checkbox" checked={checked} disabled={editing.role === 'OWNER'} onChange={() => setEditing({ ...editing, allowedCityIds: toggleCity(editing.allowedCityIds, city.id) })} /><span className="remember-dot" aria-hidden="true" /><span>{city.name}</span></label>;
              })}
            </div>
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
        </Modal>
      )}

      <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}><ArrowLeft size={16} /> {t('backToCatalog')}</button></div>

      {showHistory && (
        <div className="history-modal-overlay" role="dialog" aria-modal="true" aria-label={t('accessHistoryTitle')} onMouseDown={(event) => { if (event.target === event.currentTarget) setShowHistory(false); }}>
          <div className="history-modal-card">
            <div className="history-modal-header">
              <div>
                <span>{t('configuration')}</span>
                <strong>{t('accessHistoryTitle')}</strong>
                <p>{t('accessHistoryHint')}</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowHistory(false)} aria-label={t('close')} title={t('close')}><X size={20} /></button>
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
    </section>
  );
}

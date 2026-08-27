import { ArrowLeft, Building2, Check, Clock, ClipboardCheck, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { translateAppError, useTranslation } from '../../i18n';
import { accessRequestsApi } from '../api';
import { useAuth } from '../auth';
import { normalizeUserPermissions } from '../permissions';
import type { AccessRequest, AuthUser, City } from '../types';
import { UserFilterSelect } from './UserFilterControls';

function requestedNames(item: AccessRequest) {
  return (item.requestedCityNames?.length ? item.requestedCityNames : [item.cityName]).filter(Boolean);
}

export function AccessRequestsPage({
  cities,
  onClose,
  onUsersChanged,
  onRequestsChanged,
}: {
  cities: City[];
  onClose: () => void;
  onUsersChanged?: (users: AuthUser[]) => void;
  onRequestsChanged?: (requests: AccessRequest[]) => void;
}) {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const owner = user?.role === 'OWNER';
  const availableCities = useMemo(() => owner || user?.allowedCityIds === undefined
    ? cities
    : cities.filter((city) => user.allowedCityIds?.includes(city.id)), [cities, owner, user?.allowedCityIds]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [cityFilter, setCityFilter] = useState('ALL');
  const [citySelections, setCitySelections] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    accessRequestsApi.list(token)
      .then((result) => {
        if (!active) return;
        setRequests(result.requests);
        setCitySelections(Object.fromEntries(result.requests.map((item) => [
          item.id,
          cities.filter((city) => requestedNames(item).includes(city.name)).map((city) => city.id),
        ])));
      })
      .catch((err) => {
        console.error(err);
        if (active) setError(translateAppError(err, t, 'requestFailed'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [cities, t, token]);

  const visibleRequests = useMemo(() => requests
    .filter((item) => item.status === 'PENDENTE')
    .filter((item) => cityFilter === 'ALL' || requestedNames(item).includes(cities.find((city) => city.id === cityFilter)?.name || '')),
  [cities, cityFilter, requests]);

  function toggleCity(itemId: string, cityId: string) {
    setCitySelections((current) => {
      const values = current[itemId] || [];
      return { ...current, [itemId]: values.includes(cityId) ? values.filter((id) => id !== cityId) : [...values, cityId] };
    });
  }

  async function approve(item: AccessRequest) {
    setBusyId(item.id);
    setError('');
    try {
      const result = await accessRequestsApi.approve(
        token,
        item.id,
        'COMERCIAL',
        normalizeUserPermissions(undefined),
        owner ? citySelections[item.id] || [] : undefined,
      );
      setRequests(result.requests);
      onRequestsChanged?.(result.requests);
      if (result.users?.length) onUsersChanged?.(result.users);
    } catch (err) {
      console.error(err);
      setError(translateAppError(err, t, 'saveUserError'));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(item: AccessRequest) {
    setBusyId(item.id);
    setError('');
    try {
      const result = await accessRequestsApi.reject(token, item.id);
      setRequests(result.requests);
      onRequestsChanged?.(result.requests);
    } catch (err) {
      console.error(err);
      setError(translateAppError(err, t, 'requestFailed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="users-layout users-page access-requests-page">
      <div className="template-page-head users-page-head">
        <button type="button" className="secondary-button icon-only" onClick={onClose} aria-label={t('backToCatalog')}><ArrowLeft size={18} /></button>
        <span><ClipboardCheck size={20} /></span>
        <div><p>{t('configuration')}</p><h1>{t('accessRequests')}</h1><small>{t('accessRequestsCityHint')}</small></div>
      </div>
      <div className="access-requests-modal-content">
        <div className="access-requests-modal-toolbar">
          <div><strong>{t('accessRequests')}</strong><p>{t('accessRequestsCityHint')}</p></div>
          <label className="request-city-filter"><span>{t('city')}</span><UserFilterSelect value={cityFilter} onChange={setCityFilter} ariaLabel={t('filterRequestsByCity')} icon={Building2} options={[{ value: 'ALL', label: t('allAllowedCities') }, ...availableCities.map((city) => ({ value: city.id, label: city.name }))]} /></label>
        </div>
        {error && <p className="form-error normal-case">{error}</p>}
        {loading ? <div className="center-message"><span className="spinner" /> {t('loadingAccessRequests')}</div> : visibleRequests.length ? (
          <div className="access-requests-list access-requests-modal-list">
            {visibleRequests.map((item) => (
              <article key={item.id}>
                <span className="user-avatar"><Clock size={18} /></span>
                <div><strong>{item.name}</strong><small>@{item.username}</small><small><b>{t('requestedCities')}:</b> {requestedNames(item).join(', ')}</small></div>
                {owner && (
                  <div className="city-permission-picker compact" aria-label={t('requestedCitiesBy', { name: item.name })}>
                    {cities.filter((city) => requestedNames(item).includes(city.name)).map((city) => {
                      const checked = (citySelections[item.id] || []).includes(city.id);
                      return <label key={city.id} className={checked ? 'is-checked' : ''}><input type="checkbox" checked={checked} onChange={() => toggleCity(item.id, city.id)} /><span className="remember-dot" aria-hidden="true" /><span>{city.name}</span></label>;
                    })}
                  </div>
                )}
                <span className="status-dot request-pendente">{t('accessStatusPending')}</span>
                <div className="row-actions">
                  <button type="button" disabled={busyId === item.id} onClick={() => void approve(item)} aria-label={t('approveAccess')} title={t('approveAccess')}><Check size={16} /></button>
                  <button type="button" disabled={busyId === item.id} onClick={() => void reject(item)} aria-label={t('rejectAccess')} title={t('rejectAccess')}><XCircle size={16} /></button>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="muted-small access-requests-modal-empty">{t('noPendingAccessRequestsForCity')}</p>}
      </div>
      <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}><ArrowLeft size={16} /> {t('backToCatalog')}</button></div>
    </section>
  );
}

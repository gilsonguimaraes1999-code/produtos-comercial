import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Building2, ChevronDown, ChevronLeft, Lock, User } from 'lucide-react';
import { useAuth } from '../auth';
import { accessRequestsApi } from '../api';
import { translateAppError, useTranslation } from '../../i18n';
import { StarfieldBackground } from './StarfieldBackground';
import type { AccessRequestReceipt, AccessRequestTrackingStatus } from '../types';

const SAVED_LOGIN_KEY = 'sg_showcase_saved_login';
const ACCESS_REQUEST_RECEIPT_KEY = 'sg_access_request_receipt';
type LoginStep = 'start' | 'user' | 'password';
type LoginMode = 'login' | 'request' | 'viewer';

const blankAccessRequest = {
  name: '',
  username: '',
  password: '',
  confirmPassword: '',
  cityName: '',
  requestedCityNames: [] as string[],
};

function readAccessRequestReceipt(): AccessRequestReceipt | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(ACCESS_REQUEST_RECEIPT_KEY) || 'null') as AccessRequestReceipt | null;
    return value?.requestId && value.trackingSecret && value.submissionKey ? value : null;
  } catch {
    sessionStorage.removeItem(ACCESS_REQUEST_RECEIPT_KEY);
    return null;
  }
}

export function Login() {
  const { login, loginAsViewer } = useAuth();
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<LoginStep>('start');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<LoginMode>(() => readAccessRequestReceipt() ? 'request' : 'login');
  const [requestTracking, setRequestTracking] = useState<(AccessRequestTrackingStatus & { receipt: AccessRequestReceipt }) | null>(() => {
    const receipt = readAccessRequestReceipt();
    return receipt ? { receipt, status: 'PENDENTE' } : null;
  });
  const [cities, setCities] = useState<string[]>([]);
  const [cityMenuOpen, setCityMenuOpen] = useState(false);
  const [requestForm, setRequestForm] = useState(blankAccessRequest);
  const [viewerCities, setViewerCities] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const citiesRequestRef = useRef<Promise<string[]> | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_LOGIN_KEY) || 'null') as { username?: string; remember?: boolean } | null;
      if (saved?.username) setUsername(saved.username);
      if (saved?.remember !== undefined) setRememberMe(saved.remember);
    } catch {
      localStorage.removeItem(SAVED_LOGIN_KEY);
    }
  }, []);

  function loadCities() {
    if (!citiesRequestRef.current) {
      citiesRequestRef.current = accessRequestsApi.cities()
        .then((result) => {
          setCities(result.cities);
          return result.cities;
        })
        .catch((err) => {
          citiesRequestRef.current = null;
          throw err;
        });
    }
    return citiesRequestRef.current;
  }

  useEffect(() => {
    void loadCities().catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (mode !== 'request' || requestTracking?.status !== 'PENDENTE') return;
    let active = true;
    let checking = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const isHidden = () => document.visibilityState === 'hidden';
    const checkStatus = async () => {
      if (isHidden() || checking) return;
      checking = true;
      try {
        const status = await accessRequestsApi.status(requestTracking.receipt);
        if (!active) return;
        setRequestTracking((current) => current ? { ...current, ...status } : current);
        if (status.status === 'REPROVADO') sessionStorage.removeItem(ACCESS_REQUEST_RECEIPT_KEY);
        if (status.status === 'PENDENTE' && !isHidden()) {
          timer = setTimeout(checkStatus, 1500);
        }
      } catch (statusError) {
        console.error(statusError);
        if (active && !isHidden()) timer = setTimeout(checkStatus, 1500);
      } finally {
        checking = false;
      }
    };
    const resume = () => {
      if (isHidden()) return;
      if (timer) clearTimeout(timer);
      void checkStatus();
    };
    timer = setTimeout(checkStatus, 1500);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, [mode, requestTracking?.receipt, requestTracking?.status]);

  function submitUsername(event: FormEvent) {
    event.preventDefault();
    if (!username.trim()) {
      setError(t('userRequired'));
      return;
    }
    setError('');
    setStep('password');
  }

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      if (rememberMe) localStorage.setItem(SAVED_LOGIN_KEY, JSON.stringify({ username, remember: true }));
      else localStorage.removeItem(SAVED_LOGIN_KEY);
    } catch (err) {
      console.error(err);
      setError(translateAppError(err, t, 'invalidCredentials'));
    } finally {
      setLoading(false);
    }
  }

  async function prepareCityMode(nextMode: 'request' | 'viewer') {
    setLoadingCities(true);
    setCityMenuOpen(false);
    setError('');
    setSuccess('');
    try {
      const loadedCities = await loadCities();
      if (!loadedCities.length) throw new Error(t('noCitiesAvailable'));
      setMode(nextMode);
    } catch (err) {
      console.error(err);
      setMode('login');
      setStep('start');
      setError(translateAppError(err, t, 'requestFailed'));
    } finally {
      setLoadingCities(false);
    }
  }

  function openRequestAccess() {
    void prepareCityMode('request');
  }

  function openViewerAccess() {
    void prepareCityMode('viewer');
  }

  function backToLogin() {
    setMode('login');
    setStep('start');
    setCityMenuOpen(false);
    setError('');
    setSuccess('');
  }

  function restartAccessRequest() {
    sessionStorage.removeItem(ACCESS_REQUEST_RECEIPT_KEY);
    setRequestTracking(null);
    setRequestForm(blankAccessRequest);
    setError('');
    setSuccess('');
  }

  function backToLobby() {
    setStep('start');
    setPassword('');
    setError('');
    setSuccess('');
  }

  async function submitAccessRequest(event: FormEvent) {
    event.preventDefault();
    const payload = {
      name: requestForm.name.trim(),
      username: requestForm.username.trim(),
      password: requestForm.password,
      cityName: requestForm.requestedCityNames[0] || '',
      requestedCityNames: requestForm.requestedCityNames,
    };

    if (!payload.name) return setError(t('accessNameRequired'));
    if (!payload.username) return setError(t('accessUsernameRequired'));
    if (!payload.password) return setError(t('accessPasswordRequired'));
    if (!payload.cityName) return setError(t('accessCityRequired'));

    if (/\s/.test(payload.username)) return setError(t('usernameInvalid'));

    if (payload.password.length < 8) {
      setError(t('passwordMinLength'));
      return;
    }
    if (payload.password !== requestForm.confirmPassword) return setError(t('passwordsDoNotMatch'));

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const result = await accessRequestsApi.create(payload);
      sessionStorage.setItem(ACCESS_REQUEST_RECEIPT_KEY, JSON.stringify(result.receipt));
      setRequestTracking({ receipt: result.receipt, status: 'PENDENTE' });
      setRequestForm(blankAccessRequest);
      setCityMenuOpen(false);
      try {
        const status = await accessRequestsApi.status(result.receipt);
        setRequestTracking({ receipt: result.receipt, ...status });
        if (status.status === 'REPROVADO') sessionStorage.removeItem(ACCESS_REQUEST_RECEIPT_KEY);
      } catch (statusError) {
        console.error(statusError);
      }
    } catch (err) {
      console.error(err);
      setError(translateAppError(err, t, 'requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function submitViewerAccess(event: FormEvent) {
    event.preventDefault();
    if (!viewerCities.length) return setError(t('viewerCityRequired'));
    setLoading(true);
    setError('');
    try {
      await loginAsViewer(viewerCities);
    } catch (err) {
      console.error(err);
      setError(translateAppError(err, t, 'requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <StarfieldBackground />
      <div className="login-glow" />
      <section className="login-panel login-enter">
        <div className="login-logo-wrap">
          <img src="/alpha-logo.png" alt={t('siteName')} className="login-logo" />
        </div>

        <h1>{mode === 'request' ? t('requestAccessTitle') : mode === 'viewer' ? t('viewerAccessTitle') : t('siteName')}</h1>

        <div className="login-flow">
          {mode === 'login' && step === 'start' && error && <p className="form-error login-start-error">{error}</p>}
          {mode === 'login' && step === 'start' && success && <p className="form-success login-start-error">{success}</p>}
          {mode === 'login' && step === 'start' && (
            <button type="button" onClick={openViewerAccess} className="access-button login-step-enter">
              <span>{t('viewCatalog')}</span>
              <i aria-hidden="true" />
            </button>
          )}

          {mode === 'login' && step === 'user' && (
            <form onSubmit={submitUsername} className="login-form login-step-enter">
              {error && <p className="form-error">{error}</p>}
              <button type="button" className="back-login login-lobby-back" onClick={backToLobby}>
                <ChevronLeft size={14} strokeWidth={3} />
                <span>{t('backToLobby')}</span>
              </button>
              <div className="login-input-shell">
                <User size={17} />
                <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('username')} />
                <button type="submit" aria-label={t('continue')}><ArrowRight size={20} /></button>
              </div>
            </form>
          )}

          {mode === 'login' && step === 'password' && (
            <form onSubmit={submitLogin} className="login-form login-step-enter">
              {error && <p className="form-error">{error}</p>}
              <div className="login-back-actions">
                <button type="button" className="back-login" onClick={() => { setStep('user'); setError(''); }}>
                  <ChevronLeft size={14} strokeWidth={3} />
                  <span>{t('backToUser')}</span>
                </button>
                <button type="button" className="back-login login-lobby-back" onClick={backToLobby}>
                  <ChevronLeft size={14} strokeWidth={3} />
                  <span>{t('backToLobby')}</span>
                </button>
              </div>
              <div className="login-input-shell">
                <Lock size={17} />
                <input
                  autoFocus
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('password')}
                />
                <button type="submit" disabled={loading} aria-label={t('enter')}>
                  {loading ? <span className="mini-spinner" /> : <ArrowRight size={20} />}
                </button>
              </div>
              <label className="remember-row">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                <span className="remember-dot" aria-hidden="true" />
                <span>{t('rememberAccess')}</span>
              </label>
            </form>
          )}

          {mode === 'login' && (
            <div className="login-links login-entry-links">
              <button
                type="button"
                className="login-link-button login-request-button login-access-button"
                onClick={() => { setError(''); setStep(username ? 'password' : 'user'); }}
              >
                {t('access')}
              </button>
              <button type="button" className="login-link-button login-request-button" onClick={openRequestAccess}>
                {t('requestAccess')}
              </button>
            </div>
          )}

          {mode === 'request' && requestTracking && (
            <section className="request-access-form login-step-enter" aria-live="polite">
              <p className="viewer-access-hint">
                {requestTracking.status === 'APROVADO'
                  ? t('accessRequestTrackingApproved')
                  : requestTracking.status === 'REPROVADO'
                    ? t('accessRequestTrackingRejected')
                    : t('accessRequestTrackingPending')}
              </p>
              {requestTracking.rejectionReason && <p className="form-error">{requestTracking.rejectionReason}</p>}
              <div className="login-links">
                {requestTracking.status === 'REPROVADO' && (
                  <button type="button" className="login-link-button" onClick={restartAccessRequest}>{t('newAccessRequest')}</button>
                )}
                <button type="button" className="login-link-button" onClick={backToLogin}>{t('backToLogin')}</button>
              </div>
            </section>
          )}

          {mode === 'request' && !requestTracking && (
            <form onSubmit={submitAccessRequest} className="request-access-form login-step-enter">
              {error && <p className="form-error">{error}</p>}
              {success && <p className="form-success">{success}</p>}

              <label className="login-field-label">
                {t('displayName')} *
                <div className="login-input-shell">
                  <User size={17} />
                  <input
                    autoFocus
                    value={requestForm.name}
                    onChange={(e) => setRequestForm({ ...requestForm, name: e.target.value })}
                    placeholder={t('displayNamePlaceholder')}
                  />
                </div>
              </label>

              <label className="login-field-label">
                {t('username')} *
                <div className="login-input-shell">
                  <User size={17} />
                  <input
                    value={requestForm.username}
                    onChange={(e) => setRequestForm({ ...requestForm, username: e.target.value })}
                    placeholder={t('requestUsernamePlaceholder')}
                  />
                </div>
              </label>

              <label className="login-field-label">
                {t('password')} *
                <div className="login-input-shell">
                  <Lock size={17} />
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={requestForm.password}
                    onChange={(e) => setRequestForm({ ...requestForm, password: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>
                <span className="login-help-text">{t('requestPasswordHint')}</span>
              </label>

              <label className="login-field-label">
                {t('confirmPassword')} *
                <div className="login-input-shell">
                  <Lock size={17} />
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={requestForm.confirmPassword}
                    onChange={(e) => setRequestForm({ ...requestForm, confirmPassword: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>
              </label>

              <label className="login-field-label">
                {t('city')} *
                <div
                  className={`login-select-shell custom-login-select ${cityMenuOpen ? 'is-open' : ''}`}
                  onBlur={(event) => {
                    const nextFocus = event.relatedTarget as Node | null;
                    if (!nextFocus || !event.currentTarget.contains(nextFocus)) setCityMenuOpen(false);
                  }}
                >
                  <button
                    type="button"
                    className="login-select-trigger"
                    onClick={() => setCityMenuOpen((open) => !open)}
                    aria-expanded={cityMenuOpen}
                  >
                    <span className="login-select-value">
                      <span className="login-select-icon" aria-hidden="true"><Building2 size={15} /></span>
                      <span>{requestForm.requestedCityNames.length ? requestForm.requestedCityNames.join(', ') : t('selectCity')}</span>
                    </span>
                    <ChevronDown size={16} className="login-select-caret" />
                  </button>
                  {cityMenuOpen && (
                    <div className="login-select-menu">
                      {cities.map((city) => {
                        const selected = requestForm.requestedCityNames.includes(city);
                        return (
                        <button
                          type="button"
                          key={city}
                          className={`login-select-option ${selected ? 'is-selected' : ''}`}
                          aria-pressed={selected}
                          onClick={() => {
                            const nextSelection = selected
                              ? requestForm.requestedCityNames.filter((item) => item !== city)
                              : [...requestForm.requestedCityNames, city];
                            setRequestForm({ ...requestForm, cityName: nextSelection[0] || '', requestedCityNames: nextSelection });
                          }}
                        >
                          <span className="login-select-dot" aria-hidden="true" />
                          <span>{city}</span>
                        </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </label>

              <button type="submit" className="access-button" disabled={loading}>
                {loading ? <span className="mini-spinner" /> : <span>{t('sendAccessRequest')}</span>}
              </button>

              <div className="login-links">
                <span>{t('alreadyHaveAccount')}</span>
                <button type="button" className="login-link-button" onClick={backToLogin}>
                  {t('enter')}
                </button>
              </div>
            </form>
          )}

          {mode === 'viewer' && (
            <form onSubmit={submitViewerAccess} className="request-access-form viewer-access-form login-step-enter">
              {error && <p className="form-error">{error}</p>}
              <p className="viewer-access-hint">{t('viewerAccessHint')}</p>
              <label className="login-field-label">
                {t('city')} *
                <div
                  className={`login-select-shell custom-login-select ${cityMenuOpen ? 'is-open' : ''}`}
                  onBlur={(event) => {
                    const nextFocus = event.relatedTarget as Node | null;
                    if (!nextFocus || !event.currentTarget.contains(nextFocus)) setCityMenuOpen(false);
                  }}
                >
                  <button type="button" className="login-select-trigger" onClick={() => setCityMenuOpen((open) => !open)} aria-expanded={cityMenuOpen}>
                    <span className="login-select-value">
                      <span className="login-select-icon" aria-hidden="true"><Building2 size={15} /></span>
                      <span>{viewerCities.length ? viewerCities.join(', ') : t('selectCity')}</span>
                    </span>
                    <ChevronDown size={16} className="login-select-caret" />
                  </button>
                  {cityMenuOpen && (
                    <div className="login-select-menu">
                      {cities.map((city) => {
                        const selected = viewerCities.includes(city);
                        return (
                          <button
                            type="button"
                            key={city}
                            className={`login-select-option ${selected ? 'is-selected' : ''}`}
                            aria-pressed={selected}
                            onClick={() => {
                              setViewerCities((current) => current.includes(city)
                                ? current.filter((item) => item !== city)
                                : [...current, city]);
                              setError('');
                            }}
                          >
                            <span className="login-select-dot" aria-hidden="true" />
                            <span>{city}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </label>
              <button type="submit" className="access-button" disabled={loading}>
                {loading ? <span className="mini-spinner" /> : <span>{t('enterAsViewer')}</span>}
              </button>
              <div className="login-links">
                <button type="button" className="login-link-button" onClick={backToLogin}>{t('backToLogin')}</button>
              </div>
            </form>
          )}
        </div>
      </section>
      {loadingCities && (
        <div className="catalog-loading-overlay" role="dialog" aria-modal="true" aria-label={t('loadingCities')}>
          <div className="catalog-loading-card">
            <span className="spinner" />
            <div>
              <strong>{t('loadingCities')}</strong>
              <small>{t('loadingCreatedCities')}</small>
            </div>
          </div>
        </div>
      )}
      {loading && mode === 'viewer' && (
        <div className="catalog-loading-overlay" role="dialog" aria-modal="true" aria-label={t('loadingCatalog')}>
          <div className="catalog-loading-card">
            <span className="spinner" />
            <div>
              <strong>{t('loadingCatalog')}</strong>
              <small>{t('loadingCityProducts')}</small>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

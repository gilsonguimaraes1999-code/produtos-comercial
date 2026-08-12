import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Building2, ChevronDown, ChevronLeft, Lock, User } from 'lucide-react';
import { useAuth } from '../auth';
import { accessRequestsApi } from '../api';
import { translateAppError, useTranslation } from '../../i18n';
import { StarfieldBackground } from './StarfieldBackground';

const SAVED_LOGIN_KEY = 'sg_showcase_saved_login';
type LoginStep = 'start' | 'user' | 'password';
type LoginMode = 'login' | 'request';

const blankAccessRequest = {
  name: '',
  username: '',
  password: '',
  cityName: '',
};

export function Login() {
  const { login } = useAuth();
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<LoginStep>('start');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<LoginMode>('login');
  const [cities, setCities] = useState<string[]>([]);
  const [cityMenuOpen, setCityMenuOpen] = useState(false);
  const [requestForm, setRequestForm] = useState(blankAccessRequest);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_LOGIN_KEY) || 'null') as { username?: string; remember?: boolean } | null;
      if (saved?.username) setUsername(saved.username);
      if (saved?.remember !== undefined) setRememberMe(saved.remember);
    } catch {
      localStorage.removeItem(SAVED_LOGIN_KEY);
    }
  }, []);

  useEffect(() => {
    if (mode !== 'request' || cities.length) return;

    accessRequestsApi.cities()
      .then((result) => setCities(result.cities))
      .catch((err) => {
        console.error(err);
        setError(translateAppError(err, t, 'requestFailed'));
      });
  }, [cities.length, mode, t]);

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

  function openRequestAccess() {
    setMode('request');
    setCityMenuOpen(false);
    setError('');
    setSuccess('');
  }

  function backToLogin() {
    setMode('login');
    setCityMenuOpen(false);
    setError('');
    setSuccess('');
  }

  async function submitAccessRequest(event: FormEvent) {
    event.preventDefault();
    const payload = {
      name: requestForm.name.trim(),
      username: requestForm.username.trim(),
      password: requestForm.password,
      cityName: requestForm.cityName.trim(),
    };

    if (!payload.name || !payload.username || !payload.password || !payload.cityName) {
      setError(t('fillAccessRequest'));
      return;
    }

    if (payload.password.length < 8) {
      setError(t('passwordMinLength'));
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await accessRequestsApi.create(payload);
      setRequestForm(blankAccessRequest);
      setCityMenuOpen(false);
      setSuccess(t('accessRequestSent'));
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

        <p className="login-kicker">{t('appTitle')}</p>
        <h1>{mode === 'request' ? t('requestAccessTitle') : t('siteName')}</h1>

        <div className="login-flow">
          {mode === 'login' && step === 'start' && (
            <button type="button" onClick={() => setStep(username ? 'password' : 'user')} className="access-button login-step-enter">
              <span>{t('access')}</span>
              <i aria-hidden="true" />
            </button>
          )}

          {mode === 'login' && step === 'user' && (
            <form onSubmit={submitUsername} className="login-form login-step-enter">
              {error && <p className="form-error">{error}</p>}
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
              <button type="button" className="back-login" onClick={() => { setStep('user'); setError(''); }}>
                <ChevronLeft size={14} strokeWidth={3} />
                <span>{t('backToUser')}</span>
              </button>
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
            <div className="login-links">
              <button type="button" className="login-link-button login-request-button" onClick={openRequestAccess}>
                {t('requestAccess')}
              </button>
            </div>
          )}

          {mode === 'request' && (
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
                    value={requestForm.password}
                    onChange={(e) => setRequestForm({ ...requestForm, password: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>
                <span className="login-help-text">{t('requestPasswordHint')}</span>
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
                      <Building2 size={17} />
                      <span>{requestForm.cityName || t('selectCity')}</span>
                    </span>
                    <ChevronDown size={16} className="login-select-caret" />
                  </button>
                  {cityMenuOpen && (
                    <div className="login-select-menu">
                      <button
                        type="button"
                        className={`login-select-option ${!requestForm.cityName ? 'is-selected' : ''}`}
                        onClick={() => {
                          setRequestForm({ ...requestForm, cityName: '' });
                          setCityMenuOpen(false);
                        }}
                      >
                        {t('selectCity')}
                      </button>
                      {cities.map((city) => (
                        <button
                          type="button"
                          key={city}
                          className={`login-select-option ${requestForm.cityName === city ? 'is-selected' : ''}`}
                          onClick={() => {
                            setRequestForm({ ...requestForm, cityName: city });
                            setCityMenuOpen(false);
                          }}
                        >
                          {city}
                        </button>
                      ))}
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
        </div>
      </section>
    </main>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, ChevronLeft, Lock, User } from 'lucide-react';
import { useAuth } from '../auth';
import { translateAppError, useTranslation } from '../../i18n';
import { StarfieldBackground } from './StarfieldBackground';

const SAVED_LOGIN_KEY = 'sg_showcase_saved_login';
type LoginStep = 'start' | 'user' | 'password';

export function Login() {
  const { login } = useAuth();
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<LoginStep>('start');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_LOGIN_KEY) || 'null') as { username?: string; remember?: boolean } | null;
      if (saved?.username) setUsername(saved.username);
      if (saved?.remember !== undefined) setRememberMe(saved.remember);
    } catch {
      localStorage.removeItem(SAVED_LOGIN_KEY);
    }
  }, []);

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

  return (
    <main className="login-page">
      <StarfieldBackground />
      <div className="login-glow" />
      <section className="login-panel login-enter">
        <div className="login-logo-wrap">
          <img src="/alpha-logo.png" alt={t('siteName')} className="login-logo" />
        </div>

        <p className="login-kicker">{t('appTitle')}</p>
        <h1>{t('siteName')}</h1>

        <div className="login-flow">
          {step === 'start' && (
            <button type="button" onClick={() => setStep(username ? 'password' : 'user')} className="access-button login-step-enter">
              <span>{t('access')}</span>
              <i aria-hidden="true" />
            </button>
          )}

          {step === 'user' && (
            <form onSubmit={submitUsername} className="login-form login-step-enter">
              {error && <p className="form-error">{error}</p>}
              <div className="login-input-shell">
                <User size={17} />
                <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('username')} />
                <button type="submit" aria-label={t('continue')}><ArrowRight size={20} /></button>
              </div>
            </form>
          )}

          {step === 'password' && (
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
        </div>
      </section>
    </main>
  );
}

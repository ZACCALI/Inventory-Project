'use client';

import { useState, useEffect, useRef } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { Eye, EyeOff, Loader2, Package, ShoppingCart, Truck, BarChart3, Shield, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState('Amroding General Merchandise');
  const [rememberMe, setRememberMe] = useState(true);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load settings
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data && !data.error && data.companyName) {
          setCompanyName(data.companyName);
        }
      })
      .catch(err => console.error('Failed to load settings:', err));

    // Load saved email if exists
    try {
      const savedEmail = localStorage.getItem('amroding_remember_email');
      const pref = localStorage.getItem('amroding_remember_me_pref');
      if (savedEmail) {
        setEmail(prev => prev || savedEmail);
        setRememberMe(true);
        // Autofill may happen slightly after mount; defer focus to ensure input is ready
        setTimeout(() => {
          passwordInputRef.current?.focus();
        }, 100);
      } else {
        if (pref === 'false') {
          setRememberMe(false);
        } else {
          setRememberMe(true);
        }
        setTimeout(() => {
          emailInputRef.current?.focus();
        }, 100);
      }
    } catch (e) {
      console.warn('Failed to load remembered email:', e);
    }

    // Read NextAuth query error from URL, then clean the URL to avoid re-showing stale errors on refresh
    try {
      const params = new URLSearchParams(window.location.search);
      const urlError = params.get('error');
      const urlCode  = params.get('code');  // Custom error code from CredentialsSignin subclasses

      // Always strip auth-related query params from the URL so stale errors don't re-show on refresh
      if (urlError !== null || urlCode !== null) {
        const cleaned = new URLSearchParams(params);
        cleaned.delete('error');
        cleaned.delete('code');
        const qs = cleaned.toString();
        router.replace(`${pathname}${qs ? '?' + qs : ''}`, { scroll: false });
      }

      // Ignore garbage values NextAuth passes when it has no real error code
      const isGarbageError = !urlError || urlError === 'undefined' || urlError === 'null' || urlError.trim() === '';

      if (!isGarbageError) {
        if (urlError === 'CredentialsSignin') {
          // Check the custom `code` param for specific error types from our CredentialsSignin subclasses
          if (urlCode === 'DatabaseError') {
            setError('Database connection error. Please try again later.');
          } else if (urlCode === 'RateLimitError') {
            setError('Too many login attempts. Please try again in 15 minutes.');
          } else {
            setError('Invalid email or password. Please try again.');
          }
        } else if (urlError === 'Configuration') {
          setError('Server configuration error. Please contact your administrator.');
        } else if (urlError === 'AccessDenied') {
          setError('Access denied. You do not have permission to sign in.');
        } else if (urlError === 'Verification') {
          setError('Sign in link has expired or has already been used.');
        } else {
          setError('An error occurred during sign in. Please try again.');
        }
      }
    } catch (e) {
      console.error('Failed to parse auth error:', e);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Save or remove remembered email
      try {
        if (rememberMe) {
          localStorage.setItem('amroding_remember_email', email);
        } else {
          localStorage.removeItem('amroding_remember_email');
        }
        localStorage.setItem('amroding_remember_me_pref', String(rememberMe));
      } catch (e) {
        console.warn('Failed to save remember me preference:', e);
      }

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      // Guard: if result is undefined, the auth provider endpoint was unreachable
      if (!result) {
        setError('Could not reach the authentication service. Please check your connection and try again.');
        setLoading(false);
        return;
      }

      if (result.error) {
        // result.error is always 'CredentialsSignin' for credential failures.
        // The specific cause is in result.code (set by our DatabaseError/RateLimitError subclasses).
        if ((result as { code?: string }).code === 'DatabaseError') {
          setError('Database connection error. Please try again later.');
        } else if ((result as { code?: string }).code === 'RateLimitError') {
          setError('Too many login attempts. Please try again in 15 minutes.');
        } else {
          setError('Invalid email or password. Please try again.');
        }
        setLoading(false);
      } else if (result.ok) {
        router.push('/dashboard');
        router.refresh();
      } else {
        setError('Sign-in failed. Please try again.');
        setLoading(false);
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  const highlights = [
    { icon: Package, text: 'Inventory Management' },
    { icon: ShoppingCart, text: 'Order & POS System' },
    { icon: Truck, text: 'Delivery Tracking' },
    { icon: BarChart3, text: 'Sales Analytics' },
  ];

  return (
    <div className="login-container">
      {/* LEFT BRANDING PANEL - Dark navy matching sidebar */}
      <div className="login-brand-panel">
        <div className="login-brand-inner">
          <Link href="/?ref=home" className="login-back-link" prefetch={false}>
            <ArrowLeft size={16} />
            Back to Home
          </Link>

          <div className="login-brand-content">
            <div className="login-brand-logo">
              <div className="login-brand-logo-icon">
                <Truck size={28} strokeWidth={1.75} />
              </div>
              <h1>{companyName}</h1>
            </div>
            <p className="login-brand-tagline">
              Your complete distribution management system. Track inventory, 
              process orders, and manage deliveries — all from one dashboard.
            </p>

            <div className="login-highlights">
              {highlights.map((h) => (
                <div key={h.text} className="login-highlight-item">
                  <div className="login-highlight-icon">
                    <h.icon size={18} />
                  </div>
                  <span>{h.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="login-brand-footer">
            <Shield size={14} style={{ opacity: 0.5 }} />
            <span>Secure login · Role-based access control</span>
          </div>
        </div>
      </div>

      {/* RIGHT FORM PANEL - White matching dashboard cards */}
      <div className="login-form-panel">
        <div className="login-form-inner">
          <div className="login-form-header">
            <h2>Welcome back</h2>
            <p>Sign in to access your dashboard</p>
          </div>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="login-error">
                {error}
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label className="form-label" htmlFor="email" style={{ display: 'block', marginBottom: '8px' }}>Email Address</label>
              <input
                id="email"
                ref={emailInputRef}
                type="email"
                autoComplete="email"
                className="form-input"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ marginTop: '4px' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label className="form-label" htmlFor="password" style={{ display: 'block', marginBottom: '8px' }}>Password</label>
              <div style={{ position: 'relative', marginTop: '4px' }}>
                <input
                  id="password"
                  ref={passwordInputRef}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="form-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ paddingRight: '44px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    padding: '4px',
                    display: 'flex',
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0 24px 0' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none', fontSize: '14px', color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => {
                    setRememberMe(e.target.checked);
                    localStorage.setItem('amroding_remember_me_pref', String(e.target.checked));
                  }}
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    accentColor: 'var(--primary)',
                    cursor: 'pointer'
                  }}
                />
                Remember me
              </label>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
              style={{ width: '100%', marginTop: '24px', justifyContent: 'center' }}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="loading-spinner" style={{ border: 'none', borderTop: 'none', animation: 'spin 0.6s linear infinite' }} />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

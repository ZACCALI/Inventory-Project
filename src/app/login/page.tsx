'use client';

import { useState, useEffect, useRef } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Package, ShoppingCart, Truck, BarChart3, Shield, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState('Amroding General Merchandise');
  const [rememberMe, setRememberMe] = useState(true);
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
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
        // Autofill may happen slightly after mount; defer focus to ensure input is ready
        setTimeout(() => {
          passwordInputRef.current?.focus();
        }, 100);
      } else {
        setRememberMe(false);
      }
    } catch (e) {
      console.warn('Failed to load remembered email:', e);
    }

    // Read NextAuth query error from URL
    try {
      const params = new URLSearchParams(window.location.search);
      const urlError = params.get('error');
      if (urlError) {
        if (urlError === 'CredentialsSignin') {
          setError('Invalid email or password. Please try again.');
        } else if (urlError === 'Configuration') {
          setError('Server configuration error. Please ensure AUTH_SECRET is set correctly.');
        } else if (urlError === 'DatabaseError') {
          setError('Database connection error. Please try again later.');
        } else if (urlError === 'RateLimitError') {
          setError('Too many login attempts. Please try again in 15 minutes.');
        } else if (urlError === 'undefined' || urlError === 'null' || urlError.trim() === '') {
          setError('An unexpected authentication error occurred. Please try again.');
        } else {
          setError(`Authentication error: ${urlError}`);
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
      } catch (e) {
        console.warn('Failed to save remember me preference:', e);
      }

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        if (result.error === 'CredentialsSignin') {
          setError('Invalid email or password. Please try again.');
        } else if (result.error === 'DatabaseError') {
          setError('Database connection error. Please try again later.');
        } else if (result.error === 'RateLimitError') {
          setError('Too many login attempts. Please try again in 15 minutes.');
        } else {
          setError('An error occurred during sign in. Please try again.');
        }
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
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
                type="email"
                autoComplete="email"
                className="form-input"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
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
                  onChange={(e) => setRememberMe(e.target.checked)}
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

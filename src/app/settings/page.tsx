'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useSession} from 'next-auth/react';
import { Save, Shield,  Settings as  Building,  Lock, User, Info } from 'lucide-react';
import { useAlert } from '@/components/AlertModal';

import Image from "next/image";

interface SettingsData {
  companyName: string;
  email: string;
  phone: string;
  address: string;
  currency: string;
  taxRate: number;
  cleanupMode: boolean;
  lockProductDelete: boolean;
  lockProductEdit: boolean;
  lockOrderDelete: boolean;
  lockOrderEdit: boolean;
  lockOrderCancel: boolean;
  lockOrderDate: boolean;
  lockStockVoid: boolean;
  expiryWarningDays: number;
  staffPermissions: string;
  cashierPermissions: string;
}

export default function SettingsPage() {
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { showAlert, showConfirm, showToast } = useAlert();
  const { data: session, update: updateSession } = useSession();
  const isAdmin = session?.user?.role === 'admin';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const currentUserEmail = session?.user?.email;

  const [activeTab, setActiveTab] = useState('profile');
  const [settings, setSettings] = useState<SettingsData>({
    companyName: '', email: '', phone: '', address: '', currency: 'PHP', taxRate: 0, cleanupMode: false,
    lockProductDelete: true, lockProductEdit: false, lockOrderDelete: true, lockOrderEdit: false, lockOrderCancel: false, lockOrderDate: false, lockStockVoid: false,
    expiryWarningDays: 30, staffPermissions: '', cashierPermissions: ''
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const [profileData, setProfileData] = useState({ name: '', email: '', avatar: '' });
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const { data: swrRes } = useSWR('/api/settings', fetcher);

  useEffect(() => {
    if (swrRes) {
      setSettings({
        companyName: swrRes.companyName || '',
        email: swrRes.email || '',
        phone: swrRes.phone || '',
        address: swrRes.address || '',
        currency: swrRes.currency || 'PHP',
        taxRate: swrRes.taxRate || 0,
        cleanupMode: swrRes.cleanupMode || false,
        lockProductDelete: swrRes.lockProductDelete ?? true,
        lockProductEdit: swrRes.lockProductEdit ?? false,
        lockOrderDelete: swrRes.lockOrderDelete ?? true,
        lockOrderEdit: swrRes.lockOrderEdit ?? false,
        lockOrderCancel: swrRes.lockOrderCancel ?? false,
        lockOrderDate: swrRes.lockOrderDate ?? false,
        lockStockVoid: swrRes.lockStockVoid ?? false,
        expiryWarningDays: swrRes.expiryWarningDays || 30,
        staffPermissions: swrRes.staffPermissions || '',
        cashierPermissions: swrRes.cashierPermissions || ''
      });
    }
  }, [swrRes]);

  async function fetchSettings() {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await fetch(`/api/settings?timestamp=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setSettings({
          companyName: data.companyName || '',
          email: data.email || '',
          phone: data.phone || '',
          address: data.address || '',
          currency: data.currency || 'PHP',
          taxRate: data.taxRate || 0,
          cleanupMode: data.cleanupMode || false,
          lockProductDelete: data.lockProductDelete ?? true,
          lockProductEdit: data.lockProductEdit ?? false,
          lockOrderDelete: data.lockOrderDelete ?? true,
          lockOrderEdit: data.lockOrderEdit ?? false,
          lockOrderCancel: data.lockOrderCancel ?? false,
          lockOrderDate: data.lockOrderDate ?? false,
          lockStockVoid: data.lockStockVoid ?? false,
          expiryWarningDays: data.expiryWarningDays || 30,
          staffPermissions: data.staffPermissions || '',
          cashierPermissions: data.cashierPermissions || ''
        });
      }
    } catch (e) { console.error(e); }
  };

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        showToast('success', 'Settings saved successfully!');
        window.dispatchEvent(new Event('settingsUpdated'));
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to save settings.' }));
        showAlert('error', 'Action Failed', err.error || 'Failed to save settings.');
      }
    } catch (e) { 
      console.error(e); 
      showAlert('error', 'Action Failed', 'Error saving settings.'); 
    }
    finally { setIsSavingSettings(false); }
  };

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    setIsUploadingAvatar(true);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        setProfileData({ ...profileData, avatar: data.url });
        showToast('success', 'Photo uploaded. Click Update Profile to save.');
      } else {
        showAlert('error', 'Upload Failed', 'Could not upload avatar.');
      }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch(err) {
      showAlert('error', 'Upload Error', 'An unexpected error occurred.');
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.user) {
      showAlert('error', 'Session Error', 'Session not fully loaded.');
      return;
    }
    const userId = session.user.id;
    if (!userId) {
      showAlert('error', 'Session Error', 'User ID is missing from session. Please sign out and sign in again.');
      return;
    }
    setIsUpdatingProfile(true);
    try {
      const res = await fetch(`/api/users/${userId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData)
      });
      if (res.ok) {
        await updateSession({ name: profileData.name, email: profileData.email, avatar: profileData.avatar });
        showToast('success', 'Profile updated successfully!');
      } else {
        const err = await res.json();
        showAlert('error', 'Action Failed', err.error || 'Failed to update profile');
      }
    } catch (e) {
      console.error(e);
      showAlert('error', 'Action Failed', 'An unexpected error occurred while updating the profile.');
    } finally {
      setIsUpdatingProfile(false);
    }
  }


  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showAlert('error', 'Password Mismatch', 'New password and confirm password do not match.');
      return;
    }
    if (passwordData.newPassword.length < 8) {
      showAlert('error', 'Weak Password', 'New password must be at least 8 characters long.');
      return;
    }
    if (!session?.user?.id) {
      showAlert('error', 'Unauthorized', 'You must be logged in to update your password.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const res = await fetch(`/api/users/${session.user.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        })
      });

      if (res.ok) {
        showToast('success', 'Password updated successfully!');
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        const err = await res.json();
        showAlert('error', 'Action Failed', err.error || 'Failed to update password');
      }
    } catch (e) {
      console.error(e);
      showAlert('error', 'Action Failed', 'An unexpected error occurred while updating the password.');
    } finally {
      setIsUpdatingPassword(false);
    }
  }

  useEffect(() => {
    if (session?.user) {
      setProfileData({ name: session.user.name || '', email: session.user.email || '', avatar: session.user.avatar || '' });
    }
    fetchSettings();
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);


  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">System Settings</h1>
          <p className="page-subtitle">Configure your distribution inventory system preferences</p>
        </div>
      </div>

      <div className="settings-layout">
        
        {/* Settings Sidebar Menu */}
        <div className="card" style={{ padding: '0', overflow: 'hidden', height: 'max-content' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button 
              onClick={() => setActiveTab('profile')}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', border: 'none', background: activeTab === 'profile' ? 'var(--primary-light)' : 'transparent',
                color: activeTab === 'profile' ? 'var(--primary)' : 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'profile' ? 600 : 500, borderLeft: activeTab === 'profile' ? '3px solid var(--primary)' : '3px solid transparent'
              }}
            >
              <User size={18} /> My Profile
            </button>

            {isAdmin && (
              <button 
                onClick={() => setActiveTab('company')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', border: 'none', background: activeTab === 'company' ? 'var(--primary-light)' : 'transparent',
                  color: activeTab === 'company' ? 'var(--primary)' : 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'company' ? 600 : 500, borderLeft: activeTab === 'company' ? '3px solid var(--primary)' : '3px solid transparent'
                }}
              >
                <Building size={18} /> Company Profile
              </button>
            )}

            {isAdmin && (
              <button 
                onClick={() => setActiveTab('permissions')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', border: 'none', background: activeTab === 'permissions' ? 'var(--primary-light)' : 'transparent',
                  color: activeTab === 'permissions' ? 'var(--primary)' : 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'permissions' ? 600 : 500, borderLeft: activeTab === 'permissions' ? '3px solid var(--primary)' : '3px solid transparent'
                }}
              >
                <Lock size={18} /> Permissions
              </button>
            )}
            <button 
              onClick={() => setActiveTab('security')}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', border: 'none', background: activeTab === 'security' ? 'var(--primary-light)' : 'transparent',
                color: activeTab === 'security' ? 'var(--primary)' : 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left', fontWeight: activeTab === 'security' ? 600 : 500, borderLeft: activeTab === 'security' ? '3px solid var(--primary)' : '3px solid transparent'
              }}
            >
              <Shield size={18} /> My Security
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="card" style={{ minHeight: '500px' }}>
          
          {activeTab === 'profile' && (
            <div>
              <div className="card-header">
                <h2 className="card-title">My Profile</h2>
              </div>
              <form onSubmit={handleUpdateProfile} style={{ padding: '24px', maxWidth: '400px' }}>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'var(--bg-hover)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', flexShrink: 0 }}>
                    {profileData.avatar ? (
                      <Image width={400} height={400} src={profileData.avatar} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }}  />
                    ) : (
                      <User size={32} color="var(--text-secondary)" />
                    )}
                  </div>
                  <div>
                    <label htmlFor="avatar-upload" className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-block' }}>
                      {isUploadingAvatar ? 'Uploading...' : 'Upload Photo'}
                    </label>
                    <input id="avatar-upload" name="avatarUpload" aria-label="Upload Photo" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} disabled={isUploadingAvatar} />
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>Recommended size: 256x256px.</p>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="profile-name" className="form-label">Full Name</label>
                  <input id="profile-name" name="name" autoComplete="name" type="text" required className="form-input" placeholder="John Doe" value={profileData.name} onChange={e => setProfileData({...profileData, name: e.target.value})} />
                </div>
                <div className="form-group">
                  <label htmlFor="profile-email" className="form-label">Email Address</label>
                  <input id="profile-email" name="email" autoComplete="email" type="email" required className="form-input" placeholder="john@example.com" value={profileData.email} onChange={e => setProfileData({...profileData, email: e.target.value})} />
                </div>
                
                <button type="submit" disabled={isUpdatingProfile} className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }}>
                  {isUpdatingProfile ? 'Saving...' : 'Update Profile'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'company' && isAdmin && (
            <form onSubmit={saveSettings}>
              <div className="card-header">
                <h2 className="card-title">Company Profile</h2>
              </div>
              <div style={{ margin: '24px 24px 0', padding: '16px', background: 'var(--primary-light)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-md)', color: 'var(--primary)', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <Info size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5' }}>
                  <strong>Note:</strong> The details you configure here (Company Name, Email, Phone, Address) will automatically reflect across the system including the <strong>Public Landing Page</strong>, <strong>System Navbar</strong>, <strong>PDF Reports</strong>, and <strong>Point of Sale (POS) Printed Receipts</strong>.
                </p>
              </div>
              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="form-group">
                  <label htmlFor="company-name" className="form-label">Company / Business Name *</label>
                  <input id="company-name" name="companyName" autoComplete="organization" type="text" className="form-input" required value={settings.companyName} onChange={e => setSettings({...settings, companyName: e.target.value})} disabled={!isAdmin} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="company-email" className="form-label">Email Address</label>
                    <input id="company-email" name="email" autoComplete="email" type="email" className="form-input" value={settings.email} onChange={e => setSettings({...settings, email: e.target.value})} disabled={!isAdmin} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="company-phone" className="form-label">Phone Number</label>
                    <input id="company-phone" name="phone" autoComplete="tel" type="text" className="form-input" value={settings.phone} onChange={e => setSettings({...settings, phone: e.target.value})} disabled={!isAdmin} />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="company-address" className="form-label">Business Address</label>
                  <textarea id="company-address" name="address" rows={3} className="form-input" value={settings.address} onChange={e => setSettings({...settings, address: e.target.value})} disabled={!isAdmin}></textarea>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="company-currency" className="form-label">Currency Symbol</label>
                    <select id="company-currency" name="currency" className="form-select" value={settings.currency} onChange={e => setSettings({...settings, currency: e.target.value})} disabled={!isAdmin}>
                      <option value="PHP">PHP (₱)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="company-expiry" className="form-label">Expiry Warning Threshold (Days)</label>
                    <input id="company-expiry" name="expiryWarningDays" type="number" min="1" max="365" className="form-input" value={settings.expiryWarningDays} onChange={e => setSettings({...settings, expiryWarningDays: parseInt(e.target.value) || 30})} disabled={!isAdmin} />
                  </div>
                </div>
              </div>


              
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px', padding: '24px' }}>
                <button type="submit" disabled={isSavingSettings} className="btn btn-primary" style={{ display: 'flex', gap: '8px' }}>
                  <Save size={18} /> {isSavingSettings ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          )}



          {activeTab === 'permissions' && isAdmin && (
            <div>
              <div className="card-header">
                <h2 className="card-title">Permission Controls</h2>
              </div>
              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '0' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                  Control which actions are restricted to admin users only. When a lock is enabled, only admin users can perform that action. Staff members will see buttons hidden or disabled.
                </p>
                {[
                  { key: 'lockProductDelete' as const, label: 'Lock Product Delete', desc: 'Only admins can delete products. Prevents accidental removal of inventory items by staff members. Does not affect editing.' },
                  { key: 'lockProductEdit' as const, label: 'Lock Product Edit & Archive', desc: 'Only admins can edit existing products and archive products. Prevents staff from modifying prices, details, and archiving items.' },
                  { key: 'lockOrderDelete' as const, label: 'Lock Order Archive/Delete', desc: 'Only admins can archive or delete orders. Staff can only view and edit pending orders. Prevents staff from hiding cancelled orders.' },
                  { key: 'lockOrderEdit' as const, label: 'Lock Order Edit', desc: 'Only admins can edit orders. Prevents staff from modifying products or quantities on existing orders. Staff can only view orders.' },
                  { key: 'lockOrderCancel' as const, label: 'Lock Order Cancel', desc: 'Only admins can cancel orders. Since cancelling an order automatically restores stock back to inventory, this prevents unauthorized stock manipulation by staff.' },
                  { key: 'lockOrderDate' as const, label: 'Lock Order Date', desc: 'Locks the Walk-in Home order date strictly to today. Prevents staff from backdating orders to manipulate daily sales reports.' },
                  { key: 'lockStockVoid' as const, label: 'Lock Stock Void', desc: 'Only admins can void stock logs. Staff members will have the void button disabled or hidden.' },
                ].map(item => (
                  <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Lock size={16} color={settings[item.key] ? 'var(--primary)' : 'var(--text-tertiary)'} />
                        {item.label}
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '450px' }}>{item.desc}</p>
                    </div>
                    <label htmlFor={`lock-${item.key}`} style={{ position: 'relative', display: 'inline-block', width: '48px', height: '26px', flexShrink: 0 }}>
                      <input 
                        id={`lock-${item.key}`}
                        name={item.key}
                        aria-label={`Toggle ${item.label}`}
                        type="checkbox" 
                        checked={settings[item.key] || false}
                        onChange={async (e) => {
                          const newValue = e.target.checked;
                          const newSettings = { ...settings, [item.key]: newValue };
                          setSettings(newSettings);
                          try {
                            const res = await fetch('/api/settings', {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(newSettings)
                            });
                            if (res.ok) showToast('success', `${item.label} is now ${newValue ? 'ON' : 'OFF'}`);
                            else showAlert('error', 'Action Failed', 'Failed to update setting');
                          } catch (error) {
                            console.error(error);
                            showAlert('error', 'Action Failed', 'Failed to save setting');
                          }
                        }}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span style={{
                        position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: settings[item.key] ? 'var(--primary)' : 'var(--border)',
                        borderRadius: '26px', transition: '0.3s'
                      }}>
                        <span style={{
                          position: 'absolute', height: '20px', width: '20px', left: settings[item.key] ? '25px' : '3px', bottom: '3px',
                          backgroundColor: 'white', borderRadius: '50%', transition: '0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                        }} />
                      </span>
                    </label>
                  </div>
                ))}
              </div>

              {isAdmin && (
                <div className="card" style={{ marginTop: '24px', border: '1px solid var(--danger)' }}>
                  <div className="card-header" style={{ background: 'rgba(239, 68, 68, 0.05)', borderBottom: '1px solid var(--danger-light)' }}>
                    <h3 style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Shield size={20} />
                      Danger Zone (Admin Only)
                    </h3>
                  </div>
                  <div className="card-body" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Database Cleanup Mode</div>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '500px' }}>
                          When enabled, &apos;Hard Delete&apos; (Trash Can) buttons become visible across the system. This permanently deletes records from the database instead of archiving them. ONLY use this to clean up accidental test data. TURN OFF immediately when finished.
                        </p>
                      </div>
                      <label htmlFor="cleanup-mode" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
                        <input 
                          id="cleanup-mode"
                          name="cleanupMode"
                          aria-label="Toggle Database Cleanup Mode"
                          type="checkbox" 
                          checked={settings.cleanupMode || false}
                          onChange={async (e) => {
                            const newValue = e.target.checked;
                            setSettings({...settings, cleanupMode: newValue});
                            
                            // Auto-save this specific critical setting
                            try {
                              const res = await fetch('/api/settings', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ ...settings, cleanupMode: newValue })
                              });
                              if (res.ok) {
                                showToast('success', `Cleanup Mode is now ${newValue ? 'ON' : 'OFF'}`);
                              }
                            } catch (error) {
                              console.error('Failed to auto-save cleanup mode', error);
                            }
                          }}
                          style={{ width: '18px', height: '18px', accentColor: 'var(--danger)' }}
                        />
                        <span style={{ fontWeight: 600, color: settings.cleanupMode ? 'var(--danger)' : 'var(--text-secondary)' }}>
                          {settings.cleanupMode ? 'ON' : 'OFF'}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              <div className="card-header" style={{ marginTop: '32px', borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
                <h2 className="card-title">Role Access Matrix</h2>
              </div>
              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '0' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                  Select which modules are accessible to Staff and Cashier roles. Admins always have access to all modules. Changes are applied instantly upon saving.
                </p>
                
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '13px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                  <div>Module Name</div>
                  <div style={{ textAlign: 'center' }}>Staff</div>
                  <div style={{ textAlign: 'center' }}>Cashier</div>
                </div>

                {[
                  { key: 'inventory', label: 'Inventory Management (Products, Stock)' },
                  { key: 'delivery', label: 'Logistics (Deliveries, Drivers)' },
                  { key: 'customers', label: 'Customer Directory' },
                  { key: 'orders', label: 'Sales & Orders' },
                  { key: 'history', label: 'Transaction History' },
                ].map(mod => {
                  const staffHasIt = settings.staffPermissions.includes(mod.key);
                  const cashierHasIt = settings.cashierPermissions.includes(mod.key);

                  const togglePerm = async (role: 'staff' | 'cashier', key: string, current: boolean) => {
                    const permKey = role === 'staff' ? 'staffPermissions' : 'cashierPermissions';
                    let currentList = settings[permKey].split(',').map(s=>s.trim()).filter(Boolean);
                    
                    if (current) currentList = currentList.filter(p => p !== key);
                    else currentList.push(key);
                    
                    const newList = currentList.join(',');
                    const newSettings = { ...settings, [permKey]: newList };
                    setSettings(newSettings);
                    
                    try {
                      await fetch('/api/settings', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newSettings)
                      });
                    } catch (e) {
                      console.error(e);
                      showToast('error', 'Failed to save permission change');
                    }
                  };

                  return (
                    <div key={mod.key} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--border-light)' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '14px' }}>{mod.label}</div>
                      
                      {/* Staff Checkbox */}
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <input 
                          id={`perm-staff-${mod.key}`}
                          name={`perm-staff-${mod.key}`}
                          aria-label={`Staff permission for ${mod.label}`}
                          type="checkbox" 
                          checked={staffHasIt}
                          onChange={() => togglePerm('staff', mod.key, staffHasIt)}
                          style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                        />
                      </div>

                      {/* Cashier Checkbox */}
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <input 
                          id={`perm-cashier-${mod.key}`}
                          name={`perm-cashier-${mod.key}`}
                          aria-label={`Cashier permission for ${mod.label}`}
                          type="checkbox" 
                          checked={cashierHasIt}
                          onChange={() => togglePerm('cashier', mod.key, cashierHasIt)}
                          style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}

          {activeTab === 'security' && (
            <div>
              <div className="card-header">
                <h2 className="card-title">My Security</h2>
              </div>
              <form onSubmit={handleUpdatePassword} style={{ padding: '24px', maxWidth: '400px' }}>
                <div className="form-group">
                  <label htmlFor="security-current" className="form-label">Current Password</label>
                  <input id="security-current" name="currentPassword" autoComplete="current-password" type="password" required className="form-input" placeholder="••••••••" value={passwordData.currentPassword} onChange={e => setPasswordData({...passwordData, currentPassword: e.target.value})} />
                </div>
                <div className="form-group">
                  <label htmlFor="security-new" className="form-label">New Password</label>
                  <input id="security-new" name="newPassword" autoComplete="new-password" type="password" required className="form-input" placeholder="••••••••" value={passwordData.newPassword} onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})} />
                </div>
                <div className="form-group">
                  <label htmlFor="security-confirm" className="form-label">Confirm New Password</label>
                  <input id="security-confirm" name="confirmPassword" autoComplete="new-password" type="password" required className="form-input" placeholder="••••••••" value={passwordData.confirmPassword} onChange={e => setPasswordData({...passwordData, confirmPassword: e.target.value})} />
                </div>
                <button type="submit" disabled={isUpdatingPassword} className="btn btn-primary" style={{ marginTop: '16px', width: '100%' }}>
                  {isUpdatingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </div>
          )}

        </div>
      </div>


    </>
  );
}

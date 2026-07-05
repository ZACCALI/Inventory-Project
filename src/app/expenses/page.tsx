'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useSession } from 'next-auth/react';
import { Search, Plus, Trash2, X, DollarSign, TrendingDown, Calendar, Edit, Filter } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import { useAlert } from '@/components/AlertModal';
import { useDebounce } from '@/hooks/useDebounce';

interface Expense {
  id: string;
  date: string;
  amount: number;
  category: string;
  description: string;
  reference: string | null;
}

const DEFAULT_CATEGORIES = [
  'Rent & Lease',
  'Utilities',
  'Payroll & Salary',
  'Office Supplies',
  'Marketing',
  'Maintenance',
  'Transportation',
  'Other'
];

export default function ExpensesPage() {
  const { showAlert, showConfirm, showToast } = useAlert();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCategoryManageOpen, setIsCategoryManageOpen] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    category: DEFAULT_CATEGORIES[0],
    description: '',
    reference: ''
  });

  const getQueryString = () => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.append('search', debouncedSearch);
    if (categoryFilter) params.append('category', categoryFilter);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return params.toString();
  };

  const { data: swrRes } = useSWR(
    `/api/expenses?${getQueryString()}`,
    fetcher
  );

  useEffect(() => {
    if (swrRes) {
      setExpenses(swrRes);
      setLoading(false);
    }
  }, [swrRes]);

  const fetchExpenses = async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await fetch(`/api/expenses?${getQueryString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error('Failed to fetch expenses');
      setExpenses(data);
    } catch (error) {
      console.error('Failed to fetch expenses', error);
    } finally {
      setLoading(false);
    }
  };

  // Realtime Polling
  useEffect(() => {
    fetchExpenses();
    const interval = setInterval(() => {
      fetchExpenses();
    }, 15000); // 15 seconds

    return () => clearInterval(interval);
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, categoryFilter, startDate, endDate]);

  // Fetch expense categories from settings
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const settings = await res.json();
          if (settings.expenseCategories) {
            const parsed = JSON.parse(settings.expenseCategories);
            if (Array.isArray(parsed) && parsed.length > 0) setCategories(parsed);
          }
        }
      } catch {}
    })();
  }, []);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isFilterOpen && !(e.target as Element).closest('.filter-dropdown-container')) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFilterOpen]);


  const openAdd = () => {
    setEditId(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      amount: '',
      category: categories[0] || DEFAULT_CATEGORIES[0],
      description: '',
      reference: ''
    });
    setIsModalOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setEditId(expense.id);
    setFormData({
      date: new Date(expense.date).toISOString().split('T')[0],
      amount: expense.amount.toString(),
      category: expense.category,
      description: expense.description,
      reference: expense.reference || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!await showConfirm('Confirm', 'Are you sure you want to delete this expense log?')) return;
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchExpenses();
        showAlert('success', 'Expense Deleted', 'The expense record has been permanently removed from the system.');
      } else {
        showAlert('error', 'Action Failed', 'Failed to delete expense');
      }
    } catch (error) {
      console.error(error);
      showAlert('error', 'Action Failed', 'Error deleting expense');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const url = editId ? `/api/expenses/${editId}` : '/api/expenses';
      const method = editId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchExpenses();
      } else {
        const err = await res.json();
        showAlert('error', 'Action Failed', err.error || 'Failed to log expense');
      }
    } catch (error) {
      console.error(error);
      showAlert('error', 'Action Failed', 'Error saving expense');
    } finally {
      setActionLoading(false);
    }
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  
  const todayStr = new Date().toISOString().split('T')[0];
  const todayExpenses = expenses.filter(e => e.date.startsWith(todayStr)).reduce((sum, e) => sum + e.amount, 0);
  
  const monthStr = todayStr.substring(0, 7);
  const monthExpenses = expenses.filter(e => e.date.startsWith(monthStr)).reduce((sum, e) => sum + e.amount, 0);

  let contextLabel = 'All Expenses';
  if (search) contextLabel = `Search: ${search}`;
  else if (categoryFilter || startDate || endDate) contextLabel = [categoryFilter, startDate, endDate].filter(Boolean).join(' | ');

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="page-subtitle">Track operational costs and overheads</p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: '8px' }}>
          <button onClick={openAdd} className="btn btn-danger" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Plus size={18} />
            Log Expense
          </button>
        </div>
      </div>

      {loading ? (
        <div className="stats-grid-3" style={{ marginBottom: '24px' }}>
          {[1,2,3].map(i => (
            <div key={i} className="stat-card">
              <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', flexShrink: 0 }} />
              <div className="stat-info">
                <div className="skeleton" style={{ height: '12px', width: '80px', marginBottom: '8px' }} />
                <div className="skeleton" style={{ height: '24px', width: '100px', marginBottom: '6px' }} />
                <div className="skeleton" style={{ height: '10px', width: '70px' }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="stats-grid-3" style={{ marginBottom: '24px' }}>
        <div className="stat-card" style={{ borderLeft: '4px solid var(--primary)' }}>
          <div className="stat-icon blue"><Calendar size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Today&apos;s Expenses</div>
            <div className="stat-value">{formatCurrency(todayExpenses)}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>{contextLabel}</div>
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid var(--warning)' }}>
          <div className="stat-icon orange"><TrendingDown size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">This Month</div>
            <div className="stat-value">{formatCurrency(monthExpenses)}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>{contextLabel}</div>
          </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, var(--danger) 0%, var(--danger-dark) 100%)', color: 'white', border: 'none' }}>
          <div className="stat-icon" style={{ background: 'rgba(255,255,255,0.2)' }}><DollarSign size={24} color="white" /></div>
          <div className="stat-info">
            <div className="stat-label" style={{ color: 'rgba(255,255,255,0.8)' }}>Total All Time</div>
            <div className="stat-value" style={{ color: 'white' }}>{formatCurrency(totalExpenses)}</div>
            <div className="stat-change" style={{ color: 'rgba(255,255,255,0.7)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>{contextLabel}</div>
          </div>
        </div>
      </div>
      )}

      <div className="card">
        <div className="card-header filter-bar" style={{ marginBottom: 0 }}>
           <div className="search-bar" style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input 
              id="expense-search"
              name="search"
              aria-label="Search expenses"
              type="text" 
              className="form-input" 
              placeholder="Search expenses..." 
              style={{ paddingLeft: '36px' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-dropdown-container" style={{ position: 'relative' }}>
            <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="btn btn-outline filter-btn" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Filter size={18} />
              Filter {(categoryFilter || startDate || endDate) && <span style={{ width: '8px', height: '8px', background: 'var(--primary)', borderRadius: '50%' }}></span>}
            </button>
            {isFilterOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '8px', zIndex: 50,
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                padding: '16px', boxShadow: 'var(--shadow-lg)', width: '280px'
              }}>
                <h4 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600 }}>Filter Expenses</h4>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="expense-category-filter" className="form-label" style={{ fontSize: '12px' }}>Category</label>
                  <select id="expense-category-filter" name="categoryFilter" className="form-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                    <option value="">All Categories</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="expense-start-date" className="form-label" style={{ fontSize: '12px' }}>From Date</label>
                  <input id="expense-start-date" name="startDate" type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="expense-end-date" className="form-label" style={{ fontSize: '12px' }}>To Date</label>
                  <input id="expense-end-date" name="endDate" type="date" className="form-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
                <button
                  className="btn btn-outline"
                  style={{ width: '100%' }}
                  onClick={() => { setCategoryFilter(''); setStartDate(''); setEndDate(''); setIsFilterOpen(false); }}
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Reference</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                {isAdmin && <th style={{ textAlign: 'center', width: '60px' }}></th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(5).fill(0).map((_, idx) => (
                  <tr key={idx}>
                    <td><div className="skeleton" style={{ height: '20px', width: '80%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '70%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '90%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '60%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '50%', marginLeft: 'auto' }} /></td>
                    {isAdmin && <td><div className="skeleton" style={{ height: '20px', width: '100%' }} /></td>}
                  </tr>
                ))
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                    No expenses logged yet.
                  </td>
                </tr>
              ) : (
                expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                        <Calendar size={14} />
                        {new Date(expense.date).toLocaleDateString()}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-neutral" style={{ fontWeight: 500 }}>
                        {expense.category}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{expense.description}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)' }}>{expense.reference || '-'}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--danger-dark)' }}>
                      {formatCurrency(expense.amount)}
                    </td>
                    {isAdmin && (
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            onClick={() => openEdit(expense)}
                            className="btn btn-icon"
                            style={{ 
                              width: '32px', height: '32px', padding: 0,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              background: 'var(--bg-main)',
                              border: '1px solid var(--border)',
                              color: 'var(--text-secondary)',
                              borderRadius: '6px',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                            }}
                            data-tooltip="Edit Expense"
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-main)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(expense.id)}
                            className="btn btn-icon"
                            style={{ 
                              width: '32px', height: '32px', padding: 0,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              background: 'var(--bg-main)',
                              border: '1px solid var(--border)',
                              color: 'var(--text-secondary)',
                              borderRadius: '6px',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                            }}
                            data-tooltip="Delete Expense"
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--danger)'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = 'var(--danger)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-main)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay" style={{  }}>
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '440px', borderRadius: '24px', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div className="modal-header" style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{editId ? 'Edit Expense' : 'Log New Expense'}</h2>
              <button type="button" className="btn btn-icon btn-ghost" onClick={() => setIsModalOpen(false)} style={{ background: 'var(--bg-main)' }}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div className="modal-body" style={{ padding: '32px', overflowY: 'auto', flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="expense-date" className="form-label">Date <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input 
                      id="expense-date"
                      name="date"
                      type="date" 
                      required 
                      className="form-input"
                      style={{ height: '48px', borderRadius: '12px' }}
                      value={formData.date}
                      onChange={e => setFormData({...formData, date: e.target.value})}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="expense-category" className="form-label">Category <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <select 
                        id="expense-category"
                        name="category"
                        className="form-select"
                        required
                        style={{ height: '48px', borderRadius: '12px', flex: 1 }}
                        value={formData.category}
                        onChange={e => setFormData({...formData, category: e.target.value})}
                      >
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      {isAdmin && (
                        <button type="button" onClick={() => setIsCategoryManageOpen(true)} className="btn btn-outline" style={{ height: '48px', borderRadius: '12px', padding: '0 12px', whiteSpace: 'nowrap', fontSize: '12px' }}>
                          <Edit size={14} /> Manage
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="expense-amount" className="form-label">Amount <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontWeight: 700 }}>₱</span>
                      <input 
                        id="expense-amount"
                        name="amount"
                        type="number" 
                        step="0.01"
                        min="0.01"
                        required 
                        className="form-input"
                        style={{ paddingLeft: '32px', height: '48px', borderRadius: '12px', fontWeight: 600 }}
                        value={formData.amount}
                        onChange={e => setFormData({...formData, amount: e.target.value})}
                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      />
                    </div>
                  </div>
                  
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="expense-desc" className="form-label">Description <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input 
                      id="expense-desc"
                      name="description"
                      type="text" 
                      required 
                      placeholder="e.g. June Electricity Bill"
                      className="form-input"
                      style={{ height: '48px', borderRadius: '12px' }}
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="expense-ref" className="form-label">Reference (Optional)</label>
                    <input 
                      id="expense-ref"
                      name="reference"
                      type="text" 
                      placeholder="Receipt No / Invoice No"
                      className="form-input"
                      style={{ height: '48px', borderRadius: '12px' }}
                      value={formData.reference}
                      onChange={e => setFormData({...formData, reference: e.target.value})}
                    />
                  </div>
                </div>
              </div>
              
              <div className="modal-footer" style={{ padding: '24px 32px', borderTop: '1px solid var(--border)', display: 'flex', gap: '16px', background: '#FFFFFF', borderRadius: '0 0 24px 24px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, height: '48px', borderRadius: '12px', fontSize: '15px' }} onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, height: '48px', borderRadius: '12px', fontSize: '15px' }} disabled={actionLoading}>
                  {actionLoading ? 'Saving...' : (editId ? 'Save Changes' : 'Log Expense')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Management Modal */}
      {isCategoryManageOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '420px', borderRadius: '24px', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
            <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Manage Expense Categories</h2>
              <button type="button" className="btn btn-icon btn-ghost" onClick={() => setIsCategoryManageOpen(false)} style={{ background: 'var(--bg-main)' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              {/* Add new category */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="New category name..."
                  style={{ flex: 1, height: '40px', borderRadius: '10px' }}
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const trimmed = newCategoryName.trim();
                      if (trimmed && !categories.includes(trimmed)) {
                        const updated = [...categories, trimmed];
                        setCategories(updated);
                        setNewCategoryName('');
                        fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expenseCategories: JSON.stringify(updated) }) });
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ height: '40px', borderRadius: '10px', padding: '0 16px' }}
                  onClick={() => {
                    const trimmed = newCategoryName.trim();
                    if (trimmed && !categories.includes(trimmed)) {
                      const updated = [...categories, trimmed];
                      setCategories(updated);
                      setNewCategoryName('');
                      fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expenseCategories: JSON.stringify(updated) }) });
                    }
                  }}
                >
                  <Plus size={16} /> Add
                </button>
              </div>

              {/* Category list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {categories.map((cat, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-main)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{cat}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!await showConfirm('Delete Category', `Are you sure you want to remove "${cat}" from the category list?`)) return;
                        const updated = categories.filter((_, i) => i !== idx);
                        setCategories(updated);
                        fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expenseCategories: JSON.stringify(updated) }) });
                        showToast('success', `Category "${cat}" has been removed.`);
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '4px', borderRadius: '6px' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
              <button type="button" className="btn btn-primary" style={{ width: '100%', height: '44px', borderRadius: '12px' }} onClick={() => setIsCategoryManageOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

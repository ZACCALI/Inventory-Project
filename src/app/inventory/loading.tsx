export default function Loading() {
  return (
    <div style={{ animation: 'simpleFadeIn 150ms ease' }}>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="skeleton" style={{ height: '28px', width: '140px', marginBottom: '8px' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '250px' }}></div>
        </div>
        <div className="skeleton skeleton-button" style={{ height: '40px', width: '140px', borderRadius: 'var(--radius-md)' }}></div>
      </div>

      {/* Stats Grid (3 cards) */}
      <div className="stats-grid stats-grid-3" style={{ marginBottom: '24px' }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div className="skeleton" style={{ height: '14px', width: '100px' }}></div>
              <div className="skeleton skeleton-avatar" style={{ height: '36px', width: '36px' }}></div>
            </div>
            <div className="skeleton" style={{ height: '32px', width: '80px', marginBottom: '8px' }}></div>
            <div className="skeleton" style={{ height: '12px', width: '120px' }}></div>
          </div>
        ))}
      </div>

      {/* Search & Filter Bar */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div className="skeleton" style={{ height: '40px', flex: 1, borderRadius: 'var(--radius-md)' }}></div>
          <div className="skeleton" style={{ height: '40px', width: '120px', borderRadius: 'var(--radius-md)' }}></div>
        </div>

        {/* Table Header */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
          <div className="skeleton" style={{ height: '14px', width: '18%' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '12%' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '15%' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '12%' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '12%' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '10%' }}></div>
        </div>

        {/* Table Rows (Product, SKU, Category, Stock, Price, Actions) */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: '16px', padding: '12px 0', alignItems: 'center', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
            <div style={{ width: '18%', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="skeleton skeleton-avatar" style={{ height: '32px', width: '32px', flexShrink: 0 }}></div>
              <div className="skeleton" style={{ height: '16px', width: '80%' }}></div>
            </div>
            <div className="skeleton" style={{ height: '16px', width: '12%' }}></div>
            <div className="skeleton" style={{ height: '16px', width: '15%' }}></div>
            <div className="skeleton" style={{ height: '16px', width: '12%' }}></div>
            <div className="skeleton" style={{ height: '16px', width: '12%' }}></div>
            <div style={{ width: '10%', display: 'flex', gap: '8px' }}>
              <div className="skeleton" style={{ height: '30px', width: '30px', borderRadius: 'var(--radius-sm, 4px)' }}></div>
              <div className="skeleton" style={{ height: '30px', width: '30px', borderRadius: 'var(--radius-sm, 4px)' }}></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div style={{ animation: 'simpleFadeIn 150ms ease' }}>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="skeleton" style={{ height: '28px', width: '140px', marginBottom: '8px' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '260px' }}></div>
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
            <div className="skeleton" style={{ height: '32px', width: '90px', marginBottom: '8px' }}></div>
            <div className="skeleton" style={{ height: '12px', width: '120px' }}></div>
          </div>
        ))}
      </div>

      {/* Search & Filter Bar + Table Card */}
      <div className="card" style={{ padding: '24px' }}>
        {/* Search + Filter */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div className="skeleton" style={{ height: '40px', flex: 1, borderRadius: 'var(--radius-md)' }}></div>
          <div className="skeleton skeleton-button" style={{ height: '40px', width: '100px', borderRadius: 'var(--radius-md)' }}></div>
        </div>

        {/* Table Header (Date, Category, Description, Reference, Amount) */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
          <div className="skeleton" style={{ height: '14px', width: '15%' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '18%' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '30%' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '18%' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '15%' }}></div>
        </div>

        {/* Table Rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: '16px', padding: '12px 0', alignItems: 'center', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
            <div className="skeleton" style={{ height: '16px', width: '15%' }}></div>
            <div className="skeleton" style={{ height: '24px', width: '18%', borderRadius: '12px' }}></div>
            <div className="skeleton" style={{ height: '16px', width: '30%' }}></div>
            <div className="skeleton" style={{ height: '16px', width: '18%' }}></div>
            <div className="skeleton" style={{ height: '16px', width: '15%' }}></div>
          </div>
        ))}
      </div>
    </div>
  );
}

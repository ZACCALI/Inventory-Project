export default function Loading() {
  return (
    <div style={{ animation: 'simpleFadeIn 150ms ease' }}>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="skeleton" style={{ height: '28px', width: '150px', marginBottom: '8px' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '240px' }}></div>
        </div>
        <div className="skeleton skeleton-button" style={{ height: '40px', width: '150px', borderRadius: 'var(--radius-md)' }}></div>
      </div>

      {/* Stats Grid (2 cards) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', marginBottom: '24px' }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div className="skeleton" style={{ height: '14px', width: '110px' }}></div>
              <div className="skeleton skeleton-avatar" style={{ height: '36px', width: '36px' }}></div>
            </div>
            <div className="skeleton" style={{ height: '32px', width: '60px', marginBottom: '8px' }}></div>
            <div className="skeleton" style={{ height: '12px', width: '130px' }}></div>
          </div>
        ))}
      </div>

      {/* Search Bar + Table Card */}
      <div className="card" style={{ padding: '24px' }}>
        {/* Search Bar */}
        <div style={{ marginBottom: '20px' }}>
          <div className="skeleton" style={{ height: '40px', width: '100%', borderRadius: 'var(--radius-md)' }}></div>
        </div>

        {/* Table Header */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
          <div className="skeleton" style={{ height: '14px', width: '20%' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '20%' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '20%' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '20%' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '20%' }}></div>
        </div>

        {/* Table Rows (5 columns, 5 rows) */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: '16px', padding: '12px 0', alignItems: 'center', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
            <div style={{ width: '20%', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="skeleton skeleton-avatar" style={{ height: '32px', width: '32px', flexShrink: 0 }}></div>
              <div className="skeleton" style={{ height: '16px', width: '75%' }}></div>
            </div>
            <div className="skeleton" style={{ height: '16px', width: '20%' }}></div>
            <div className="skeleton" style={{ height: '16px', width: '20%' }}></div>
            <div className="skeleton" style={{ height: '16px', width: '20%' }}></div>
            <div className="skeleton" style={{ height: '16px', width: '20%' }}></div>
          </div>
        ))}
      </div>
    </div>
  );
}

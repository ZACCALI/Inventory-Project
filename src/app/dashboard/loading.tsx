export default function Loading() {
  return (
    <div style={{ animation: 'simpleFadeIn 150ms ease' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="skeleton" style={{ height: '28px', width: '160px', marginBottom: '8px' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '280px' }}></div>
        </div>
      </div>

      {/* Stats Grid - Row 1 (3 cards) */}
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

      {/* Stats Grid - Row 2 (3 cards) */}
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

      {/* Chart Area */}
      <div className="card" style={{ marginBottom: '24px', padding: '24px' }}>
        <div className="skeleton" style={{ height: '20px', width: '180px', marginBottom: '16px' }}></div>
        <div className="skeleton" style={{ height: '300px', width: '100%', borderRadius: 'var(--radius-md)' }}></div>
      </div>

      {/* Table Card */}
      <div className="card" style={{ padding: '24px' }}>
        <div className="skeleton" style={{ height: '20px', width: '140px', marginBottom: '20px' }}></div>
        {/* Table Header */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
          <div className="skeleton" style={{ height: '14px', width: '20%' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '20%' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '20%' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '20%' }}></div>
          <div className="skeleton" style={{ height: '14px', width: '20%' }}></div>
        </div>
        {/* Table Rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: '16px', padding: '12px 0', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
            <div className="skeleton" style={{ height: '16px', width: '20%' }}></div>
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

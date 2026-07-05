export default function ReportsLoading() {
  return (
    <div style={{ animation: 'simpleFadeIn 150ms ease' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="skeleton skeleton-title" style={{ width: '140px' }} />
          <div className="skeleton skeleton-text" style={{ width: '260px', marginTop: '8px' }} />
        </div>
      </div>

      {/* Chart Card */}
      <div className="card" style={{ marginTop: '24px', padding: '24px' }}>
        <div className="skeleton skeleton-text" style={{ width: '180px', marginBottom: '16px' }} />
        <div className="skeleton" style={{ width: '100%', height: '350px', borderRadius: '8px' }} />
      </div>

      {/* Section Title */}
      <div className="skeleton skeleton-title" style={{ width: '200px', marginTop: '32px', marginBottom: '16px' }} />

      {/* Bestseller Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="card" key={i} style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div className="skeleton" style={{ width: '48px', height: '48px', borderRadius: '8px' }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton skeleton-text" style={{ width: '80%', marginBottom: '6px' }} />
                <div className="skeleton skeleton-text" style={{ width: '50%', height: '12px' }} />
              </div>
            </div>
            <div className="skeleton skeleton-text" style={{ width: '60%', marginBottom: '6px' }} />
            <div className="skeleton skeleton-text" style={{ width: '40%' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

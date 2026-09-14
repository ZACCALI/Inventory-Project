export default function StockCheckerLoading() {
  return (
    <div style={{ animation: 'simpleFadeIn 150ms ease' }}>
      {/* Page header skeleton */}
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div>
          <div className="skeleton" style={{ width: 'min(200px, 100%)', height: '28px', borderRadius: 'var(--radius-sm)', marginBottom: '8px' }} />
          <div className="skeleton" style={{ width: 'min(320px, 100%)', height: '18px', borderRadius: 'var(--radius-sm)' }} />
        </div>
      </div>

      {/* Stats grid skeleton (cards on top) */}
      <div className="stats-grid" style={{ marginBottom: '16px' }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="stat-card">
            <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', flexShrink: 0 }} />
            <div className="stat-info">
              <div className="skeleton" style={{ height: '12px', width: '70px', marginBottom: '8px' }} />
              <div className="skeleton" style={{ height: '22px', width: '50px' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Unified Single Card: Filters + Table skeleton */}
      <div className="card">
        {/* Filter bar header skeleton */}
        <div className="card-header filter-bar" style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          margin: 0,
        }}>
          {/* Row 1: Search */}
          <div style={{ display: 'flex', gap: '10px', width: '100%', flexWrap: 'wrap' }}>
            <div className="skeleton" style={{ flex: '1 1 240px', height: '38px', borderRadius: 'var(--radius-md)' }} />
            <div className="skeleton" style={{ width: '90px', height: '38px', borderRadius: 'var(--radius-md)' }} />
          </div>
          {/* Row 2: Category + Stock Status */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="skeleton" style={{ flex: '0 1 220px', minWidth: '150px', height: '38px', borderRadius: 'var(--radius-md)' }} />
            <div className="skeleton" style={{ flex: '0 1 180px', minWidth: '140px', height: '38px', borderRadius: 'var(--radius-md)' }} />
          </div>
        </div>

        {/* Table skeleton with mobile-stack and data-labels */}
        <div className="table-container">
          <table className="table mobile-stack">
            <thead>
              <tr>
                <th><div className="skeleton" style={{ height: '14px', width: '70px', borderRadius: 'var(--radius-sm)' }} /></th>
                <th><div className="skeleton" style={{ height: '14px', width: '90px', borderRadius: 'var(--radius-sm)' }} /></th>
                <th><div className="skeleton" style={{ height: '14px', width: '75px', borderRadius: 'var(--radius-sm)' }} /></th>
                <th style={{ textAlign: 'right' }}><div className="skeleton" style={{ height: '14px', width: '80px', borderRadius: 'var(--radius-sm)', marginLeft: 'auto' }} /></th>
                <th style={{ textAlign: 'right' }}><div className="skeleton" style={{ height: '14px', width: '85px', borderRadius: 'var(--radius-sm)', marginLeft: 'auto' }} /></th>
                <th style={{ textAlign: 'center' }}><div className="skeleton" style={{ height: '14px', width: '50px', borderRadius: 'var(--radius-sm)', margin: '0 auto' }} /></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  <td data-label="Product">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div className="skeleton" style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
                      <div className="skeleton" style={{ width: '130px', height: '14px', borderRadius: 'var(--radius-sm)' }} />
                    </div>
                  </td>
                  <td data-label="Barcode / SKU"><div><div className="skeleton" style={{ width: '110px', height: '14px', borderRadius: 'var(--radius-sm)' }} /></div></td>
                  <td data-label="Category"><div><div className="skeleton" style={{ width: '90px', height: '14px', borderRadius: 'var(--radius-sm)' }} /></div></td>
                  <td data-label="Selling Price" style={{ textAlign: 'right' }}><div><div className="skeleton" style={{ width: '60px', height: '14px', borderRadius: 'var(--radius-sm)', marginLeft: 'auto' }} /></div></td>
                  <td data-label="Current Stock" style={{ textAlign: 'right' }}><div><div className="skeleton" style={{ width: '40px', height: '14px', borderRadius: 'var(--radius-sm)', marginLeft: 'auto' }} /></div></td>
                  <td data-label="Status" style={{ textAlign: 'center' }}><div><div className="skeleton" style={{ width: '70px', height: '22px', borderRadius: 'var(--radius-full)', margin: '0 auto' }} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

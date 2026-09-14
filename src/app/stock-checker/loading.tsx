export default function StockCheckerLoading() {
  return (
    <div style={{ animation: 'simpleFadeIn 150ms ease' }}>
      {/* Page header skeleton */}
      <div className="page-header">
        <div>
          <div className="skeleton" style={{ width: 'min(220px, 100%)', height: '28px', borderRadius: 'var(--radius-sm)', marginBottom: '8px' }} />
          <div className="skeleton" style={{ width: 'min(340px, 100%)', height: '18px', borderRadius: 'var(--radius-sm)' }} />
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

      {/* Filters + Search card skeleton */}
      <div className="card" style={{ marginBottom: '16px', padding: '16px' }}>
        {/* Search row */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div className="skeleton" style={{ flex: '1 1 220px', height: '38px', borderRadius: 'var(--radius-md)' }} />
          <div className="skeleton" style={{ width: '100px', height: '38px', borderRadius: 'var(--radius-md)' }} />
        </div>
        {/* Filter row: Category + Stock Status (Brand removed) */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="skeleton" style={{ flex: '1 1 160px', height: '38px', borderRadius: 'var(--radius-md)' }} />
          <div className="skeleton" style={{ flex: '1 1 140px', height: '38px', borderRadius: 'var(--radius-md)' }} />
        </div>
      </div>

      {/* Table skeleton with mobile-stack and data-labels */}
      <div className="card">
        <div className="table-container">
          <table className="table mobile-stack" style={{ minWidth: '650px' }}>
            <thead>
              <tr>
                {['Product', 'Barcode / SKU', 'Category', 'Selling Price', 'Current Stock', 'Status'].map((col) => (
                  <th key={col}>
                    <div className="skeleton" style={{ height: '14px', width: '80px', borderRadius: 'var(--radius-sm)' }} />
                  </th>
                ))}
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
                  <td data-label="Selling Price"><div><div className="skeleton" style={{ width: '60px', height: '14px', borderRadius: 'var(--radius-sm)' }} /></div></td>
                  <td data-label="Current Stock"><div><div className="skeleton" style={{ width: '40px', height: '14px', borderRadius: 'var(--radius-sm)' }} /></div></td>
                  <td data-label="Status"><div><div className="skeleton" style={{ width: '70px', height: '22px', borderRadius: 'var(--radius-full)' }} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

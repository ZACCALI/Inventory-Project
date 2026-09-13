export default function StockCheckerLoading() {
  return (
    <div style={{ animation: 'simpleFadeIn 150ms ease' }}>
      {/* Page header skeleton */}
      <div className="page-header">
        <div>
          <div className="skeleton" style={{ width: '220px', height: '28px', borderRadius: 'var(--radius-sm)', marginBottom: '8px' }} />
          <div className="skeleton" style={{ width: '340px', height: '18px', borderRadius: 'var(--radius-sm)' }} />
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
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="skeleton" style={{ flex: 1, minWidth: '240px', height: '40px', borderRadius: 'var(--radius-sm)' }} />
          <div className="skeleton" style={{ width: '120px', height: '40px', borderRadius: 'var(--radius-sm)' }} />
          <div className="skeleton" style={{ width: '140px', height: '40px', borderRadius: 'var(--radius-sm)' }} />
          <div className="skeleton" style={{ width: '130px', height: '40px', borderRadius: 'var(--radius-sm)' }} />
          <div className="skeleton" style={{ width: '110px', height: '40px', borderRadius: 'var(--radius-sm)' }} />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                {['#', 'Product Name', 'Barcode / SKU', 'Category', 'Selling Price', 'Current Stock', 'Status'].map((col) => (
                  <th key={col}>
                    <div className="skeleton" style={{ height: '14px', width: col === '#' ? '20px' : '80px', borderRadius: '4px' }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  <td><div className="skeleton" style={{ width: '20px', height: '14px', borderRadius: '4px' }} /></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div className="skeleton" style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
                      <div className="skeleton" style={{ width: '130px', height: '14px', borderRadius: '4px' }} />
                    </div>
                  </td>
                  <td><div className="skeleton" style={{ width: '110px', height: '14px', borderRadius: '4px' }} /></td>
                  <td><div className="skeleton" style={{ width: '90px', height: '14px', borderRadius: '4px' }} /></td>
                  <td><div className="skeleton" style={{ width: '60px', height: '14px', borderRadius: '4px' }} /></td>
                  <td><div className="skeleton" style={{ width: '40px', height: '14px', borderRadius: '4px' }} /></td>
                  <td><div className="skeleton" style={{ width: '70px', height: '22px', borderRadius: '20px' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

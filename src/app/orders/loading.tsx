export default function OrdersLoading() {
  return (
    <div style={{ animation: 'simpleFadeIn 150ms ease' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="skeleton skeleton-title" style={{ width: '120px' }} />
          <div className="skeleton skeleton-text" style={{ width: '240px', marginTop: '8px' }} />
        </div>
        <div className="skeleton skeleton-button" style={{ width: '130px' }} />
      </div>

      {/* Search & Filter Card */}
      <div className="card" style={{ marginTop: '24px', padding: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="skeleton" style={{ flex: 1, minWidth: '200px', height: '40px', borderRadius: '8px' }} />
          <div className="skeleton" style={{ width: '150px', height: '40px', borderRadius: '8px' }} />
          <div className="skeleton" style={{ width: '150px', height: '40px', borderRadius: '8px' }} />
          <div className="skeleton" style={{ width: '150px', height: '40px', borderRadius: '8px' }} />
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ marginTop: '16px', padding: '0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Order #', 'Customer', 'Date', 'Items', 'Total', 'Status', 'Actions'].map((col) => (
                <th key={col} style={{ padding: '14px 16px', textAlign: 'left' }}>
                  <div className="skeleton skeleton-text" style={{ width: col.length > 5 ? '80px' : '50px' }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
                <td style={{ padding: '14px 16px' }}>
                  <div className="skeleton skeleton-text" style={{ width: '80px' }} />
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <div className="skeleton skeleton-text" style={{ width: '130px' }} />
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <div className="skeleton skeleton-text" style={{ width: '90px' }} />
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <div className="skeleton skeleton-text" style={{ width: '40px' }} />
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <div className="skeleton skeleton-text" style={{ width: '70px' }} />
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <div className="skeleton" style={{ width: '80px', height: '24px', borderRadius: '12px' }} />
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <div className="skeleton skeleton-button" style={{ width: '60px' }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

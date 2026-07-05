export default function DriversLoading() {
  return (
    <div style={{ animation: 'simpleFadeIn 150ms ease' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="skeleton skeleton-title" style={{ width: '180px' }} />
          <div className="skeleton skeleton-text" style={{ width: '260px', marginTop: '8px' }} />
        </div>
        <div className="skeleton skeleton-button" style={{ width: '130px' }} />
      </div>

      {/* Stat Cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div className="stat-card" key={i}>
            <div className="skeleton skeleton-text" style={{ width: '120px', marginBottom: '8px' }} />
            <div className="skeleton skeleton-title" style={{ width: '60px' }} />
          </div>
        ))}
      </div>

      {/* Search & Filter Card */}
      <div className="card" style={{ marginTop: '24px', padding: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="skeleton" style={{ flex: 1, height: '40px', borderRadius: '8px' }} />
          <div className="skeleton" style={{ width: '160px', height: '40px', borderRadius: '8px' }} />
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ marginTop: '16px', padding: '0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Driver', 'Phone', 'Vehicle Info', 'Status', 'Actions'].map((col) => (
                <th key={col} style={{ padding: '14px 16px', textAlign: 'left' }}>
                  <div className="skeleton skeleton-text" style={{ width: col === 'Actions' ? '60px' : '80px' }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="skeleton skeleton-avatar" />
                    <div className="skeleton skeleton-text" style={{ width: '120px' }} />
                  </div>
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <div className="skeleton skeleton-text" style={{ width: '100px' }} />
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <div className="skeleton skeleton-text" style={{ width: '140px' }} />
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <div className="skeleton" style={{ width: '70px', height: '24px', borderRadius: '12px' }} />
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

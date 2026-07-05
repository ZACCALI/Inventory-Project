export default function Loading() {
  return (
    <div style={{ animation: 'simpleFadeIn 150ms ease' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="skeleton" style={{ height: '28px', width: '160px', marginBottom: '8px' }} />
          <div className="skeleton" style={{ height: '16px', width: '380px' }} />
        </div>
      </div>

      {/* Table Card with Search + Filters */}
      <div className="card">
        {/* Filter Bar: Search + Action Filter + Entity Filter */}
        <div className="card-header filter-bar" style={{ paddingTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
          <div style={{ flex: 1, minWidth: '280px', maxWidth: '400px' }}>
            <div className="skeleton" style={{ height: '40px', width: '100%', borderRadius: '8px' }} />
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div className="skeleton" style={{ height: '40px', width: '140px', borderRadius: '8px' }} />
            <div className="skeleton" style={{ height: '40px', width: '140px', borderRadius: '8px' }} />
          </div>
        </div>

        {/* Table */}
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '180px' }}>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Module</th>
                <th style={{ width: '40%' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map(i => (
                <tr key={i}>
                  <td><div className="skeleton" style={{ height: '16px', width: '90%' }} /></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="skeleton" style={{ width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0 }} />
                      <div className="skeleton" style={{ height: '16px', width: '100px' }} />
                    </div>
                  </td>
                  <td><div className="skeleton" style={{ height: '24px', width: '60px', borderRadius: '4px' }} /></td>
                  <td><div className="skeleton" style={{ height: '24px', width: '80px', borderRadius: '16px' }} /></td>
                  <td><div className="skeleton" style={{ height: '16px', width: '80%' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

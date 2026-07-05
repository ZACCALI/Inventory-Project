export default function Loading() {
  return (
    <div style={{ animation: 'simpleFadeIn 150ms ease' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="skeleton" style={{ height: '28px', width: '200px', marginBottom: '8px' }} />
          <div className="skeleton" style={{ height: '16px', width: '280px' }} />
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: '8px' }}>
          <div className="skeleton" style={{ height: '40px', width: '120px', borderRadius: '8px' }} />
        </div>
      </div>

      {/* Table Card with Search */}
      <div className="card" style={{ marginBottom: '24px' }}>
        {/* Search Bar */}
        <div style={{ padding: '16px' }}>
          <div className="skeleton" style={{ height: '40px', width: '100%', maxWidth: '400px', borderRadius: '8px' }} />
        </div>

        {/* Table */}
        <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th style={{ textAlign: 'center', width: '80px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map(i => (
                <tr key={i}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div className="skeleton" style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0 }} />
                      <div className="skeleton" style={{ height: '16px', width: '120px' }} />
                    </div>
                  </td>
                  <td><div className="skeleton" style={{ height: '16px', width: '160px' }} /></td>
                  <td><div className="skeleton" style={{ height: '24px', width: '70px', borderRadius: '16px' }} /></td>
                  <td><div className="skeleton" style={{ height: '16px', width: '80px' }} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <div className="skeleton" style={{ width: '32px', height: '32px', borderRadius: '6px' }} />
                      <div className="skeleton" style={{ width: '32px', height: '32px', borderRadius: '6px' }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

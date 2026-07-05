export default function Loading() {
  return (
    <div style={{ animation: 'simpleFadeIn 150ms ease' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="skeleton" style={{ height: '28px', width: '140px', marginBottom: '8px' }} />
          <div className="skeleton" style={{ height: '16px', width: '360px' }} />
        </div>
      </div>

      {/* Settings Layout: Sidebar + Content */}
      <div className="settings-layout">
        {/* Sidebar Card */}
        <div className="card" style={{ padding: '0', overflow: 'hidden', height: 'max-content' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderLeft: i === 1 ? '3px solid var(--border)' : '3px solid transparent' }}>
                <div className="skeleton" style={{ width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0 }} />
                <div className="skeleton" style={{ height: '14px', width: '100px' }} />
              </div>
            ))}
          </div>
        </div>

        {/* Main Content Card */}
        <div className="card" style={{ minHeight: '500px' }}>
          {/* Section 1: Profile Section */}
          <div style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="card-header">
              <div className="skeleton" style={{ height: '20px', width: '120px' }} />
            </div>
            <div style={{ padding: '24px', maxWidth: '400px' }}>
              {/* Avatar row */}
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                <div className="skeleton" style={{ width: '80px', height: '80px', borderRadius: '50%', flexShrink: 0 }} />
                <div>
                  <div className="skeleton" style={{ height: '32px', width: '120px', borderRadius: '6px', marginBottom: '8px' }} />
                  <div className="skeleton" style={{ height: '12px', width: '160px' }} />
                </div>
              </div>
              {/* Form fields */}
              <div className="form-group">
                <div className="skeleton" style={{ height: '14px', width: '80px', marginBottom: '8px' }} />
                <div className="skeleton" style={{ height: '40px', width: '100%', borderRadius: '8px' }} />
              </div>
              <div className="form-group">
                <div className="skeleton" style={{ height: '14px', width: '100px', marginBottom: '8px' }} />
                <div className="skeleton" style={{ height: '40px', width: '100%', borderRadius: '8px' }} />
              </div>
              {/* Save button */}
              <div className="skeleton" style={{ height: '40px', width: '100%', borderRadius: '8px', marginTop: '8px' }} />
            </div>
          </div>

          {/* Section 2: Permissions-like rows */}
          <div style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="card-header">
              <div className="skeleton" style={{ height: '20px', width: '160px' }} />
            </div>
            <div style={{ padding: '24px' }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ height: '14px', width: '180px', marginBottom: '8px' }} />
                    <div className="skeleton" style={{ height: '12px', width: '300px' }} />
                  </div>
                  <div className="skeleton" style={{ width: '48px', height: '26px', borderRadius: '26px', flexShrink: 0 }} />
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Security-like fields */}
          <div>
            <div className="card-header">
              <div className="skeleton" style={{ height: '20px', width: '130px' }} />
            </div>
            <div style={{ padding: '24px', maxWidth: '400px' }}>
              {[1, 2].map(i => (
                <div key={i} className="form-group">
                  <div className="skeleton" style={{ height: '14px', width: '120px', marginBottom: '8px' }} />
                  <div className="skeleton" style={{ height: '40px', width: '100%', borderRadius: '8px' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DeliveryLoading() {
  return (
    <div style={{ animation: 'simpleFadeIn 150ms ease' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="skeleton skeleton-title" style={{ width: '240px' }} />
          <div className="skeleton skeleton-text" style={{ width: '280px', marginTop: '8px' }} />
        </div>
      </div>

      {/* Search & Filter Card */}
      <div className="card" style={{ marginTop: '24px', padding: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="skeleton" style={{ flex: 1, height: '40px', borderRadius: '8px' }} />
          <div className="skeleton skeleton-button" style={{ width: '100px' }} />
        </div>
      </div>

      {/* Delivery Card Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="card" key={i} style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              {/* Order Number */}
              <div style={{ minWidth: '100px' }}>
                <div className="skeleton skeleton-text" style={{ width: '60px', marginBottom: '4px' }} />
                <div className="skeleton skeleton-text" style={{ width: '90px', height: '14px' }} />
              </div>
              {/* Customer Name */}
              <div style={{ minWidth: '120px' }}>
                <div className="skeleton skeleton-text" style={{ width: '50px', marginBottom: '4px', height: '10px' }} />
                <div className="skeleton skeleton-text" style={{ width: '130px' }} />
              </div>
              {/* Driver */}
              <div style={{ minWidth: '120px' }}>
                <div className="skeleton skeleton-text" style={{ width: '40px', marginBottom: '4px', height: '10px' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className="skeleton skeleton-avatar" style={{ width: '28px', height: '28px' }} />
                  <div className="skeleton skeleton-text" style={{ width: '100px' }} />
                </div>
              </div>
              {/* Status Badge */}
              <div>
                <div className="skeleton" style={{ width: '90px', height: '26px', borderRadius: '12px' }} />
              </div>
              {/* Date */}
              <div>
                <div className="skeleton skeleton-text" style={{ width: '90px' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

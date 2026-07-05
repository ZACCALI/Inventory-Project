import React from 'react';

export default function SkeletonLoader() {
  return (
    <div className="page-container" style={{ animation: 'simpleFadeIn 150ms ease' }}>
      {/* Header Skeleton */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ width: '100%', maxWidth: '300px' }}>
          <div className="skeleton skeleton-title"></div>
          <div className="skeleton skeleton-text" style={{ width: '60%' }}></div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div className="skeleton skeleton-button"></div>
          <div className="skeleton skeleton-button" style={{ width: '140px' }}></div>
        </div>
      </div>

      {/* Stats Row Skeleton */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="stat-card" style={{ display: 'flex', gap: '16px', padding: '16px', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <div className="skeleton skeleton-avatar"></div>
            <div style={{ flex: 1 }}>
              <div className="skeleton skeleton-text" style={{ width: '40%' }}></div>
              <div className="skeleton skeleton-text" style={{ width: '70%', height: '24px' }}></div>
            </div>
          </div>
        ))}
      </div>

      {/* Table Skeleton */}
      <div className="card table-container" style={{ padding: '0' }}>
        <div className="table-header" style={{ padding: '16px' }}>
          <div className="skeleton skeleton-text" style={{ width: '200px', height: '20px', marginBottom: '0' }}></div>
          <div className="skeleton skeleton-text" style={{ width: '150px', height: '36px', borderRadius: 'var(--radius-md)', marginBottom: '0' }}></div>
        </div>
        <div style={{ padding: '16px' }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--border-light)', padding: '16px 0' }}>
              <div className="skeleton skeleton-text" style={{ width: '20%' }}></div>
              <div className="skeleton skeleton-text" style={{ width: '30%' }}></div>
              <div className="skeleton skeleton-text" style={{ width: '15%' }}></div>
              <div className="skeleton skeleton-text" style={{ width: '15%' }}></div>
              <div className="skeleton skeleton-text" style={{ width: '20%' }}></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

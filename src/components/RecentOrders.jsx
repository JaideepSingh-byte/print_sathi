/**
 * ============================================================================
 * PRINT-SATHI COMPONENT: Recent Orders & Campus Queue Tracker
 * ============================================================================
 * 
 * Supports multi-file orders, displays token ID, shop/counter, and live status.
 */

import React from 'react';
import { clearOrderHistory } from '../services/firebase';
import { formatCurrency } from '../utils/pricingEngine';

export default function RecentOrders({ orders, onSelectOrder, onBackToForm, onRefreshOrders }) {
  const handleClear = () => {
    if (window.confirm('Clear your saved local print history on this device?')) {
      clearOrderHistory();
      onRefreshOrders();
    }
  };

  return (
    <div className="panel-card" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div className="panel-header recent-orders-header">
        <h2 className="panel-title">
          <span className="panel-title-icon">📋</span>
          My Campus Print Queue
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {orders.length > 0 && (
            <button
              type="button"
              className="remove-btn"
              onClick={handleClear}
            >
              Clear History
            </button>
          )}
          {onBackToForm && (
            <button
              type="button"
              className="secondary-action-btn"
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}
              onClick={onBackToForm}
            >
              ← Back to Print Form
            </button>
          )}
        </div>
      </div>

      {orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📭</div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.35rem' }}>
            No Print Orders in Queue Yet
          </h3>
          <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Upload a PDF document to queue your first campus print job!
          </p>
          {onBackToForm && (
            <button
              type="button"
              className="primary-action-btn"
              style={{ display: 'inline-flex', padding: '0.65rem 1.25rem' }}
              onClick={onBackToForm}
            >
              Upload PDF & Print Now
            </button>
          )}
        </div>
      ) : (
        <div className="orders-table-wrapper">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Token ID</th>
                <th>Documents</th>
                <th>Pickup Counter</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const filesCount = order.files?.length || 1;
                const firstFileName = order.files?.[0]?.fileName || order.fileName || 'document.pdf';
                const docLabel = filesCount > 1 
                  ? `${firstFileName} +${filesCount - 1} more` 
                  : firstFileName;

                const isPrinted = order.status === 'PRINTED' || order.status === 'COMPLETED';

                return (
                  <tr key={order.orderId}>
                    <td>
                      <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>
                        #{order.orderId}
                      </strong>
                    </td>
                    <td style={{ maxWidth: '220px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span title={firstFileName}>📄 {docLabel}</span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                      {order.pickupCounter ? order.pickupCounter.split('(')[0] : 'Counter 1'}
                    </td>
                    <td>
                      <strong style={{ fontFamily: 'var(--font-mono)' }}>
                        {formatCurrency(order.totalAmount || 0)}
                      </strong>
                    </td>
                    <td>
                      <span className={`status-badge ${isPrinted ? 'printed' : 'queued'}`}>
                        <span className="status-dot"></span>
                        {isPrinted ? 'PRINTED' : 'QUEUED'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="view-ticket-btn"
                        onClick={() => onSelectOrder(order)}
                      >
                        View Pass
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

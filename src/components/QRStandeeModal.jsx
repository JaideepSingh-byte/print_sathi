/**
 * ============================================================================
 * PRINT-SATHI COMPONENT: Campus Shop Counter QR Standee Modal
 * ============================================================================
 * 
 * Generates an A4-printable, branded counter standee with a scannable QR code
 * that deep-links students directly to `/shop/:shopId`.
 */

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function QRStandeeModal({ shop, isOpen, onClose }) {
  if (!isOpen || !shop) return null;

  const origin = window.location.origin;
  const shopUrl = `${origin}/shop/${shop.shopId}`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '520px', padding: '0', overflow: 'hidden' }}
      >
        <div className="modal-header" style={{ padding: '1rem 1.5rem', background: '#0f172a' }}>
          <div className="modal-title" style={{ fontSize: '1.05rem' }}>Counter QR Standee</div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Printable Standee Sheet */}
        <div 
          id="printable-standee"
          style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            padding: '2rem 1.5rem',
            color: '#0f172a',
            textAlign: 'center',
            boxShadow: 'inset 0 0 100px rgba(0,0,0,0.03)'
          }}
        >
          {/* Header Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: '#4f46e5',
            color: '#ffffff',
            padding: '0.35rem 0.85rem',
            borderRadius: '999px',
            fontSize: '0.78rem',
            fontWeight: '700',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            marginBottom: '1rem'
          }}>
            <span>⚡ Print-Sathi Smart Counter</span>
          </div>

          <h2 style={{ fontSize: '1.45rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.25rem' }}>
            {shop.name}
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 1.25rem' }}>
            📍 {shop.location?.building}, {shop.location?.floor} &bull; {shop.location?.room || 'Counter Desk'}
          </p>

          {/* QR Code Container */}
          <div style={{
            display: 'inline-block',
            padding: '1rem',
            maxWidth: '100%',
            background: '#ffffff',
            borderRadius: '16px',
            border: '2px solid #e2e8f0',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <QRCodeSVG
              value={shopUrl}
              size={180}
              level="H"
              includeMargin={true}
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          </div>

          <div style={{ marginTop: '1rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#4f46e5', display: 'block' }}>
              SCAN TO SKIP THE QUEUE
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
              {shopUrl}
            </span>
          </div>

          {/* 3 Step Instruction Guide */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.6rem',
            marginTop: '1.5rem',
            padding: '1rem 0.75rem',
            background: '#f1f5f9',
            borderRadius: '12px',
            textAlign: 'center'
          }}>
            <div>
              <div style={{ fontSize: '1.2rem', marginBottom: '0.2rem' }}>📱</div>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#1e293b' }}>1. Scan QR</div>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Open link on phone</div>
            </div>
            <div>
              <div style={{ fontSize: '1.2rem', marginBottom: '0.2rem' }}>📄</div>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#1e293b' }}>2. Upload PDF</div>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Configure & Pay UPI</div>
            </div>
            <div>
              <div style={{ fontSize: '1.2rem', marginBottom: '0.2rem' }}>🖨️</div>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#1e293b' }}>3. Grab Prints</div>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Quote 4-digit token</div>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 1.5rem',
          background: '#0f172a',
          borderTop: '1px solid #1e293b'
        }}>
          <button
            type="button"
            className="secondary-action-btn"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="primary-action-btn"
            onClick={handlePrint}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print Standee (A4)
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ============================================================================
 * PRINT-SATHI COMPONENT: Campus UPI Payment Modal & Verification
 * ============================================================================
 * 
 * Features:
 * 1. Simulates campus UPI payment (GPay, PhonePe, Paytm, BHIM).
 * 2. Real UPI deeplink URI format for QR generation (`upi://pay?...`).
 * 3. Client & Server validation readiness (HMAC architecture).
 * 4. Resilient one-click payment confirmation simulation with progress state.
 */

import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { formatCurrency } from '../utils/pricingEngine';

export default function PaymentModal({
  isOpen,
  onClose,
  totalAmount,
  pricingSnapshot = null,
  onConfirmPayment,
  error = null,
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [modalError, setModalError] = useState(error);
  const [paymentMode, setPaymentMode] = useState('qr'); // 'qr' | 'upi_id'

  useEffect(() => {
    setModalError(error);
  }, [error]);

  if (!isOpen) return null;

  const displayAmount = typeof totalAmount === 'number' ? totalAmount : 0;
  // Standard NPCI UPI URI string
  const upiUri = `upi://pay?pa=printsathi.campus@okaxis&pn=PrintSathi%20Campus%20Xerox&am=${displayAmount.toFixed(2)}&cu=INR&tn=PrintJobOrder`;

  const handleSimulatePayment = async () => {
    setIsProcessing(true);
    setModalError(null);
    setProcessingStatus('Verifying UPI Payment with Bank...');
    try {
      await onConfirmPayment((statusText) => {
        if (statusText) setProcessingStatus(statusText);
      });
    } catch (err) {
      console.error('Payment confirmation error:', err);
      setModalError(err.message || 'Payment simulation / file upload failed.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const handleClose = () => {
    if (isProcessing) return; // Prevent closing while in-flight upload
    setModalError(null);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title">Campus UPI Fast Pay</div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={handleClose}
            aria-label="Close modal"
            disabled={isProcessing}
          >
            ×
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {/* Price display */}
          <div className="modal-amount-display">
            <span className="modal-amount-label">Amount to Pay</span>
            <div className="modal-amount-value">{formatCurrency(displayAmount)}</div>
            {pricingSnapshot?.totalFiles && (
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                For {pricingSnapshot.totalFiles} documents &bull; {pricingSnapshot.totalSheets} sheets
              </span>
            )}
          </div>

          {/* Real QR Code using qrcode.react */}
          <div className="qr-code-frame" style={{ display: 'flex', justifyContent: 'center', padding: '0.75rem', background: '#ffffff', borderRadius: '12px' }}>
            <QRCodeSVG
              value={upiUri}
              size={160}
              level="H"
              includeMargin={true}
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          </div>

          <div style={{ textAlign: 'center', marginTop: '0.65rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Scan with <strong>Google Pay</strong>, <strong>PhonePe</strong>, or <strong>Paytm</strong>
            </span>
            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>
              UPI ID: printsathi.campus@okaxis
            </div>
          </div>

          <div className="payment-security-notice" style={{ marginTop: '0.85rem' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Verified 256-bit Campus Payment Gateway Simulation</span>
          </div>

          {/* Action Trigger */}
          <button
            type="button"
            className="confirm-payment-btn"
            onClick={handleSimulatePayment}
            disabled={isProcessing}
            aria-busy={isProcessing}
          >
            {isProcessing ? (
              <>
                <svg className="spin-animate payment-btn-spinner" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <span>{processingStatus || 'Verifying UPI Payment with Bank...'}</span>
              </>
            ) : (
              <>
                <svg className="payment-btn-icon-prefix" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span className="payment-btn-label">Simulate Payment &bull; {formatCurrency(displayAmount)}</span>
                <svg className="payment-btn-icon-suffix" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </>
            )}
          </button>

          {/* In-Modal Error Banner */}
          {modalError && (
            <div
              className="payment-error-banner"
              style={{
                marginTop: '1rem',
                padding: '0.85rem 1rem',
                borderRadius: '12px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                fontSize: '0.82rem',
                lineHeight: '1.45',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem', color: '#b91c1c' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>Order Submission & Upload Error</span>
              </div>
              <div style={{ wordBreak: 'break-word', color: '#7f1d1d' }}>
                {modalError}
              </div>
            </div>
          )}

          <p style={{ textAlign: 'center', fontSize: '0.74rem', color: '#64748b', marginTop: '0.6rem' }}>
            Testing Sandbox Mode: Clicking above approves payment and routes order to the live counter queue.
          </p>
        </div>
      </div>
    </div>
  );
}

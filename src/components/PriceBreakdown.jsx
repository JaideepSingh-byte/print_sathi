/**
 * ============================================================================
 * PRINT-SATHI COMPONENT: Multi-File & Dynamic Shop Price Breakdown
 * ============================================================================
 * 
 * Features:
 * 1. Computes live multi-file order pricing using the dynamic pricing engine.
 * 2. Displays itemized per-document calculations and overall sheets needed.
 * 3. Shows active shop info & counter pickup details.
 * 4. Transparent breakdown of tiered volume discounts.
 * 5. Primary "Proceed to Payment & Submit" checkout trigger.
 */

import React from 'react';
import { calculateOrderPricing, formatCurrency } from '../utils/pricingEngine';

export default function PriceBreakdown({
  filesList = [],
  shop = null,
  pricingSnapshot: externalPricingSnapshot = null,
  // Backwards compatibility props:
  isFileActive,
  calculatedPages = 1,
  copies = 1,
  colorMode = 'bw',
  sides = 'single',
  onProceedToPayment,
}) {
  // If multi-file list is provided
  const hasFiles = Array.isArray(filesList) && filesList.length > 0;

  // Single-file synthesized fallback
  const effectiveFilesList = hasFiles
    ? filesList
    : isFileActive
    ? [
        {
          name: 'document.pdf',
          calculatedPages: calculatedPages || 1,
          totalPages: calculatedPages || 1,
          copies: copies || 1,
          colorMode: colorMode || 'bw',
          sides: sides || 'single',
        },
      ]
    : [];

  const pricingSnapshot = externalPricingSnapshot || calculateOrderPricing(
    effectiveFilesList,
    shop?.pricingTiers || null
  );

  const isShopActive = shop ? (shop.isAcceptingOrders !== false && (shop.status === 'APPROVED' || !shop.status)) : true;
  const hasInvalidRanges = effectiveFilesList.some(
    (f) => f.rangeValidation && f.rangeValidation.isValid === false
  );
  const canProceed = effectiveFilesList.length > 0 && pricingSnapshot.totalAmount > 0 && isShopActive && !hasInvalidRanges;

  return (
    <div className="sticky-column">
      <div className="price-card">
        <div className="price-header">
          <h3 className="price-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            Live Cost Breakdown
          </h3>
          {shop && (
            <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: '600' }}>
              📍 {shop.name}
            </span>
          )}
        </div>

        {/* Multi-file Itemized list or single summary */}
        <div className="cost-breakdown-list">
          <div className="breakdown-row">
            <span className="breakdown-label">
              <span>📁</span> Total Documents:
            </span>
            <span className="breakdown-value">
              {pricingSnapshot.totalFiles} {pricingSnapshot.totalFiles === 1 ? 'file' : 'files'}
            </span>
          </div>

          <div className="breakdown-row">
            <span className="breakdown-label">
              <span>📄</span> Total Impressions:
            </span>
            <span className="breakdown-value">
              {pricingSnapshot.totalPages} {pricingSnapshot.totalPages === 1 ? 'page' : 'pages'}
            </span>
          </div>

          <div className="breakdown-row">
            <span className="breakdown-label">
              <span>📦</span> Paper Sheets Needed:
            </span>
            <span className="breakdown-value">
              ~{pricingSnapshot.totalSheets} sheets
            </span>
          </div>

          {/* Itemized per-file rows */}
          {pricingSnapshot.items.length > 0 && (
            <div style={{
              margin: '0.5rem 0',
              padding: '0.5rem 0',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#94a3b8', marginBottom: '0.35rem' }}>
                Per-File Breakdown:
              </div>
              {pricingSnapshot.items.map((item, idx) => (
                <div 
                  key={item.fileId || idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.78rem',
                    padding: '0.2rem 0',
                    color: '#cbd5e1'
                  }}
                >
                  <span style={{ flex: '1 1 auto', minWidth: 0, marginRight: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.fileName}>
                    {idx + 1}. {item.fileName} ({item.pageRangeString || `${item.calculatedPages} pgs`}, {item.copies}x, {item.colorMode.toUpperCase()})
                  </span>
                  <span style={{ fontWeight: '600', color: item.calculatedPages > 0 ? '#38bdf8' : '#ef4444', flexShrink: 0 }}>
                    {item.calculatedPages > 0 ? formatCurrency(item.itemTotal) : 'Invalid'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Big Total Due Display */}
        <div className="total-due-box">
          <div>
            <div className="total-label">Total Amount Due</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Subsidized Campus Student Rate
            </div>
          </div>
          <div className="total-price">{formatCurrency(pricingSnapshot.totalAmount)}</div>
        </div>

        {/* Proceed to Payment CTA */}
        <button
          type="button"
          className="submit-order-btn"
          disabled={!canProceed}
          onClick={() => onProceedToPayment(pricingSnapshot.totalAmount, pricingSnapshot)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
          {!isShopActive ? 'Counter Paused / Inactive' : 'Proceed to Payment & Submit'}
        </button>

        {isShopActive && hasInvalidRanges && (
          <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--danger)', marginTop: '0.65rem' }}>
            * Please resolve invalid page ranges on your uploaded files before proceeding
          </p>
        )}

        {!isShopActive && (
          <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--danger)', marginTop: '0.65rem' }}>
            * This counter is currently not accepting new print jobs. Please select another counter from the directory.
          </p>
        )}

        {isShopActive && !hasFiles && !isFileActive && (
          <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--danger)', marginTop: '0.65rem' }}>
            * Please upload at least one .pdf file to continue
          </p>
        )}

        {/* Campus Pickup Info Card */}
        <div className="campus-info-card">
          <div className="info-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <div className="info-text-title">Queue & Pickup Guarantee</div>
            <p className="info-text-desc">
              {shop?.location ? (
                <>Pick up at <strong>{shop.name}</strong> ({shop.location.building}, {shop.location.floor}) with your 4-digit token!</>
              ) : (
                'Your document is assigned a unique 4-digit token. Pick up your prints at Counter 1 without waiting in line!'
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

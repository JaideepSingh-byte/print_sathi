/**
 * ============================================================================
 * PRINT-SATHI COMPONENT: Shop-Specific Print View (/shop/:shopId)
 * ============================================================================
 * 
 * Handles direct QR code routing and counter-specific file uploads,
 * pricing, and queue submission.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import UploadZone from './UploadZone';
import PrintConfig from './PrintConfig';
import PriceBreakdown from './PriceBreakdown';
import PaymentModal from './PaymentModal';
import OrderConfirmation from './OrderConfirmation';
import { getShopById, submitMultiFileOrder } from '../services/firebase';
import { calculateOrderPricing } from '../utils/pricingEngine';

export default function ShopView({ onOrderCreated }) {
  const { shopId } = useParams();
  const navigate = useNavigate();

  const [shop, setShop] = useState(null);
  const [loadingShop, setLoadingShop] = useState(true);

  // Multi-file state
  const [filesList, setFilesList] = useState([]);

  // Print Configuration State
  const [copies, setCopies] = useState(1);
  const [colorMode, setColorMode] = useState('bw');
  const [pageRangeMode, setPageRangeMode] = useState('all');
  const [customRangeString, setCustomRangeString] = useState('');
  const [sides, setSides] = useState('single');
  const [calculatedPages, setCalculatedPages] = useState(1);

  // Modal, Error & Order Confirmation State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [currentOrder, setCurrentOrder] = useState(null);

  useEffect(() => {
    async function loadTargetShop() {
      setLoadingShop(true);
      try {
        const found = await getShopById(shopId);
        setShop(found);
      } catch (err) {
        console.warn('Error loading shop:', err);
      } finally {
        setLoadingShop(false);
      }
    }
    loadTargetShop();
  }, [shopId]);

  // Unified, authoritative order pricing snapshot (Single Source of Truth)
  const pricingSnapshot = useMemo(() => {
    return calculateOrderPricing(filesList, shop?.pricingTiers || null);
  }, [filesList, shop]);

  const handleProceedToPayment = (validatedAmount, snapshot) => {
    if (!filesList || filesList.length === 0) {
      alert('Please upload at least one PDF document before proceeding.');
      return;
    }
    const hasInvalidRanges = filesList.some(
      (f) => f.rangeValidation && f.rangeValidation.isValid === false
    );
    if (hasInvalidRanges) {
      alert('One or more uploaded documents have an invalid page range. Please correct the page ranges before proceeding.');
      return;
    }
    const finalAmount = typeof validatedAmount === 'number' ? validatedAmount : pricingSnapshot.totalAmount;
    if (finalAmount <= 0) {
      alert('Order total must be greater than ₹0.');
      return;
    }
    setPaymentError(null);
    setIsPaymentModalOpen(true);
  };

  const handleConfirmPayment = async (onProgress) => {
    const pickupCounter = shop 
      ? `${shop.name} (${shop.location?.building || 'Campus Plaza'}, ${shop.location?.floor || 'Ground'})` 
      : 'Counter 1 (Main Student Plaza)';

    const orderConfig = {
      shopId: shop?.shopId || shopId,
      pickupCounter,
      shopPricing: shop?.pricingTiers || null,
      pricingSnapshot, // Pass strict validated pricing snapshot
    };

    setPaymentError(null);
    try {
      const result = await submitMultiFileOrder(orderConfig, filesList, onProgress);

      if (result.success) {
        setCurrentOrder(result.order);
        if (onOrderCreated) {
          onOrderCreated(result.order);
        }
        setIsPaymentModalOpen(false);
      } else {
        const errorMsg = result.error || 'Unknown error occurred during order submission.';
        setPaymentError(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (err) {
      console.error('Order submission error:', err);
      setPaymentError(err.message);
      throw err; // Re-throw to PaymentModal so the spinner halts and the error banner is displayed
    }
  };

  const handleResetForm = () => {
    setFilesList([]);
    setCopies(1);
    setColorMode('bw');
    setPageRangeMode('all');
    setCustomRangeString('');
    setSides('single');
    setCurrentOrder(null);
  };

  if (loadingShop) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#94a3b8' }}>
        Loading print counter details...
      </div>
    );
  }

  // If order was completed, render confirmation slip
  if (currentOrder) {
    return (
      <OrderConfirmation
        order={currentOrder}
        onReset={handleResetForm}
      />
    );
  }

  return (
    <div>
      {/* Top Counter Bar */}
      <div className="shop-view-counter-bar">
        <div className="counter-info-group">
          <div className="counter-icon-box">
            🖨️
          </div>
          <div className="counter-meta">
            <div className="counter-title-row">
              <h3 className="counter-view-name">
                {shop?.name || 'Campus Print Counter'}
              </h3>
              <span className={`counter-status-pill ${shop?.isAcceptingOrders !== false ? 'open' : 'paused'}`}>
                {shop?.isAcceptingOrders !== false ? 'OPEN' : 'PAUSED'}
              </span>
            </div>
            <p className="counter-view-subtext">
              📍 {shop?.location?.building || 'Main Campus'}, {shop?.location?.floor || 'Floor 1'} &bull; {shop?.location?.room || 'Counter'}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="secondary-action-btn switch-counter-btn"
          onClick={() => navigate('/')}
        >
          ← Switch Counter
        </button>
      </div>

      {/* Main Two-Column Grid */}
      <div className="prototype-grid">
        <div className="flow-column">
          {/* Step 1: Multi-file upload */}
          <UploadZone
            filesList={filesList}
            setFilesList={setFilesList}
            shopPricing={shop?.pricingTiers || null}
          />

          {/* Step 2: Print Configuration */}
          <PrintConfig
            filesList={filesList}
            setFilesList={setFilesList}
            copies={copies}
            setCopies={setCopies}
            colorMode={colorMode}
            setColorMode={setColorMode}
            pageRangeMode={pageRangeMode}
            setPageRangeMode={setPageRangeMode}
            customRangeString={customRangeString}
            setCustomRangeString={setCustomRangeString}
            sides={sides}
            setSides={setSides}
            setCalculatedPages={setCalculatedPages}
            isFileActive={filesList.length > 0}
            supportedServices={shop?.supportedServices}
            shopPricing={shop?.pricingTiers || null}
          />
        </div>

        {/* Step 3: Sticky Price Card */}
        <PriceBreakdown
          filesList={filesList}
          shop={shop}
          pricingSnapshot={pricingSnapshot}
          onProceedToPayment={handleProceedToPayment}
        />
      </div>

      {/* Payment Simulation Modal */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setPaymentError(null);
        }}
        totalAmount={pricingSnapshot.totalAmount}
        pricingSnapshot={pricingSnapshot}
        onConfirmPayment={handleConfirmPayment}
        error={paymentError}
      />
    </div>
  );
}

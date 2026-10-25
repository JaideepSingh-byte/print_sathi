/**
 * ============================================================================
 * PRINT-SATHI COMPONENT: Campus Shop Directory
 * ============================================================================
 * 
 * Displays available print shops on campus with status, pricing, and routing.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscribeToApprovedShops, getApprovedShops } from '../services/firebase';
import QRStandeeModal from './QRStandeeModal';

export default function ShopDirectory({ onSelectShop }) {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [standeeShop, setStandeeShop] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToApprovedShops(
      (data) => {
        setShops(data);
        setLoading(false);
      },
      (err) => {
        console.warn('Could not subscribe to approved shops:', err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const filteredShops = shops.filter((shop) => {
    const query = searchQuery.toLowerCase();
    const nameMatch = shop.name?.toLowerCase().includes(query);
    const buildingMatch = shop.location?.building?.toLowerCase().includes(query);
    const floorMatch = shop.location?.floor?.toLowerCase().includes(query);
    return nameMatch || buildingMatch || floorMatch;
  });

  const handleChooseShop = (shop) => {
    if (onSelectShop) {
      onSelectShop(shop);
    }
    navigate(`/shop/${shop.shopId}`);
  };

  return (
    <div className="shop-directory-container">
      {/* Search & Header Row */}
      <div className="shop-directory-header">
        <div className="shop-directory-titles">
          <h3 className="shop-directory-heading">
            Campus Xerox Counters & Print Stations
          </h3>
          <p className="shop-directory-subheading">
            Select your nearest pickup counter to queue files and avoid waiting in line.
          </p>
        </div>

        <div className="shop-search-wrapper">
          <input
            type="text"
            className="shop-search-input"
            placeholder="🔍 Search by building, shop name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="shop-loading-state">
          Loading active campus print centers...
        </div>
      ) : filteredShops.length === 0 ? (
        <div className="shop-empty-state">
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🖨️</div>
          <div style={{ fontWeight: '700', fontSize: '1.1rem', color: '#f8fafc' }}>
            {shops.length === 0 ? 'No Approved Campus Print Counters Yet' : 'No matching print counters found'}
          </div>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.35rem', maxWidth: '480px', margin: '0.35rem auto 0', lineHeight: '1.45' }}>
            {shops.length === 0
              ? 'Counters must be registered via the Shopkeeper Portal and approved by the campus administrator before appearing here.'
              : 'Try searching by building name, Bhavan, or room number.'}
          </p>
        </div>
      ) : (
        <div className="shops-grid">
          {filteredShops.map((shop) => (
            <div
              key={shop.shopId}
              className="panel-card counter-card"
            >
              <div>
                {/* Status Indicator & QR Action */}
                <div className="counter-card-header">
                  <span className={`counter-status-pill ${shop.isAcceptingOrders !== false ? 'accepting' : 'paused'}`}>
                    {shop.isAcceptingOrders !== false ? '🟢 Accepting Orders' : '🔴 Paused'}
                  </span>

                  <button
                    type="button"
                    className="counter-qr-btn"
                    onClick={() => setStandeeShop(shop)}
                    title="View & Print Counter QR Standee"
                  >
                    <span>📱</span> QR Code
                  </button>
                </div>

                {/* Counter Name (Exact chosen name from Firestore) */}
                <h4 className="counter-card-name">
                  {shop.name}
                </h4>

                <p className="counter-card-tagline">
                  {shop.tagline || 'Campus printing, photocopy, and spiral binding'}
                </p>

                {/* Location Box */}
                <div className="counter-location-box">
                  <div>📍 <strong>Location:</strong> {shop.location?.building}, {shop.location?.floor}</div>
                  <div>🚪 <strong>Room/Counter:</strong> {shop.location?.room || 'Main Desk'}</div>
                  {shop.contactPhone && (
                    <div>📞 <strong>Phone:</strong> {shop.contactPhone}</div>
                  )}
                </div>

                {/* Supported Services & Tier Rates */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                    {shop.supportedServices?.bw !== false && <span style={pillStyle}>B&W Printing</span>}
                    {shop.supportedServices?.color && <span style={pillStyle}>Color</span>}
                    {shop.supportedServices?.single !== false && <span style={pillStyle}>Single-Sided</span>}
                    {shop.supportedServices?.duplex && <span style={pillStyle}>Duplex</span>}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div>
                <button
                  type="button"
                  className="primary-action-btn counter-select-btn"
                  onClick={() => handleChooseShop(shop)}
                  disabled={shop.isAcceptingOrders === false}
                >
                  {shop.isAcceptingOrders !== false ? 'Select Counter & Upload PDF →' : 'Counter Temporarily Paused'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Standee Modal */}
      {standeeShop && (
        <QRStandeeModal
          shop={standeeShop}
          isOpen={Boolean(standeeShop)}
          onClose={() => setStandeeShop(null)}
        />
      )}
    </div>
  );
}

const pillStyle = {
  fontSize: '0.72rem',
  fontWeight: '600',
  padding: '0.15rem 0.5rem',
  borderRadius: '4px',
  background: 'rgba(244, 255, 96, 0.27)',
  color: '#008f91',
  border: '1px solid rgba(2, 170, 242, 0.3)',
};

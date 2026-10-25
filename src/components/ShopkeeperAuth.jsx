/**
 * ============================================================================
 * PRINT-SATHI COMPONENT: Shopkeeper Authentication & Registration Portal
 * ============================================================================
 * 
 * Features:
 * 1. Comprehensive Shopkeeper Registration:
 *    - Personal details (Full Name, 10-digit Mobile, Email, Password, Confirm Password)
 *    - Custom Shop Details (Chosen Shop Name, Campus Building, Floor, Room, Tagline)
 *    - Supported Services toggles (B&W, Color, Single, Duplex)
 *    - Configurable Quantity Tiers (1–49, 50–99, 100+ copies) for enabled services
 * 2. Counter Sign-In & Session Persistence
 * 3. Robust Error Diagnosis (Firebase Auth activation, invalid credentials, duplicate accounts)
 * 4. Submission Confirmation View (Pending Administrator Approval state)
 */

import React, { useState } from 'react';
import { loginShopkeeper, registerShopkeeper } from '../services/firebase';
import { buildPricingConfig } from '../utils/pricingEngine';

export default function ShopkeeperAuth({ onAuthSuccess }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationSubmitted, setRegistrationSubmitted] = useState(null);

  // Shopkeeper credentials & identity
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Shop details
  const [shopName, setShopName] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('Ground Floor');
  const [room, setRoom] = useState('');
  const [tagline, setTagline] = useState('');

  // Supported services
  const [services, setServices] = useState({
    bw: true,
    color: true,
    single: true,
    duplex: true,
  });

  // Quantity tier rates (1-49, 50-99, 100+)
  const [tierRates, setTierRates] = useState({
    // B&W Single
    bw_single_t1: '2.0',
    bw_single_t2: '1.5',
    bw_single_t3: '1.0',
    // B&W Duplex
    bw_double_t1: '3.0',
    bw_double_t2: '2.2',
    bw_double_t3: '1.6',
    // Color Single
    color_single_t1: '8.0',
    color_single_t2: '6.0',
    color_single_t3: '5.0',
    // Color Duplex
    color_double_t1: '14.0',
    color_double_t2: '10.0',
    color_double_t3: '8.0',
  });

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Service toggle helper
  const handleServiceToggle = (key) => {
    setServices((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Tier rate update helper
  const handleRateChange = (key, val) => {
    setTierRates((prev) => ({ ...prev, [key]: val }));
  };

  // Registration Validation
  const validateRegistration = () => {
    if (!fullName.trim()) return 'Please enter your Full Name.';
    if (!mobile.trim() || !/^\d{10}$/.test(mobile.trim().replace(/\D/g, ''))) {
      return 'Please enter a valid 10-digit mobile number.';
    }
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email.trim())) {
      return 'Please enter a valid email address.';
    }
    if (password.length < 6) {
      return 'Password must be at least 6 characters in length.';
    }
    if (password !== confirmPassword) {
      return 'Passwords do not match. Please re-enter.';
    }
    if (!shopName.trim()) {
      return 'Please choose a name for your print shop / counter.';
    }
    if (!building.trim()) {
      return 'Please specify the building or campus area.';
    }
    if (!services.bw && !services.color) {
      return 'Please select at least one print mode (Black & White or Color).';
    }
    if (!services.single && !services.duplex) {
      return 'Please select at least one paper side mode (Single-Sided or Duplex).';
    }

    // Verify entered tier rates are valid positive numbers
    for (const [k, v] of Object.entries(tierRates)) {
      const num = parseFloat(v);
      if (isNaN(num) || num < 0) {
        return 'All custom pricing rates must be non-negative numeric values.';
      }
    }

    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (isRegistering) {
      const validationErr = validateRegistration();
      if (validationErr) {
        setError(validationErr);
        return;
      }
    }

    setLoading(true);

    try {
      if (isRegistering) {
        const pricingTiers = buildPricingConfig(tierRates);

        const shopDetails = {
          shopName: shopName.trim(),
          shopkeeperName: fullName.trim(),
          mobile: mobile.trim(),
          location: {
            building: building.trim(),
            floor: floor.trim(),
            room: room.trim() || 'Print Desk',
          },
          tagline: tagline.trim() || 'Fast Campus Printing Services',
          supportedServices: services,
          pricingTiers,
        };

        const result = await registerShopkeeper(email, password, shopDetails);
        setRegistrationSubmitted({
          user: result.user,
          shop: result.shop,
        });
      } else {
        const userCred = await loginShopkeeper(email, password);
        if (onAuthSuccess) onAuthSuccess(userCred.user);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Demo sign-in for testing counter 1
  const handleQuickDemoLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const userCred = await loginShopkeeper('counter1@printsathi.campus', 'demo1234');
      if (onAuthSuccess) onAuthSuccess(userCred.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // If registration was just completed, show approval acknowledgment card
  if (registrationSubmitted) {
    return (
      <div style={{ maxWidth: '580px', margin: '2rem auto', padding: '0 1rem' }}>
        <div className="panel-card" style={{ padding: '2.5rem 2rem', textAlign: 'center' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '2px solid #f59e0b',
            color: '#f59e0b',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            marginBottom: '1rem'
          }}>
            ⏳
          </div>

          <h2 style={{ fontSize: '1.45rem', fontWeight: '800', color: '#f8fafc', margin: '0 0 0.5rem' }}>
            Registration Submitted Successfully!
          </h2>

          <p style={{ fontSize: '0.9rem', color: '#94a3b8', lineHeight: '1.5', margin: '0 0 1.5rem' }}>
            Thank you, <strong style={{ color: '#f8fafc' }}>{registrationSubmitted.shop.shopkeeperName}</strong>. 
            Your print counter <strong style={{ color: '#38bdf8' }}>"{registrationSubmitted.shop.name}"</strong> has been registered 
            and is now <span style={{ color: '#fbbf24', fontWeight: '700' }}>PENDING ADMINISTRATOR APPROVAL</span>.
          </p>

          <div style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '1.25rem',
            textAlign: 'left',
            marginBottom: '1.75rem',
            fontSize: '0.85rem'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span style={{ color: '#64748b' }}>Assigned Shop ID:</span>
              <span style={{ color: '#38bdf8', fontFamily: 'monospace', fontWeight: '600' }}>
                {registrationSubmitted.shop.shopId}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span style={{ color: '#64748b' }}>Location:</span>
              <span style={{ color: '#f8fafc' }}>
                {registrationSubmitted.shop.location.building}, {registrationSubmitted.shop.location.floor} ({registrationSubmitted.shop.location.room})
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span style={{ color: '#64748b' }}>Owner Email:</span>
              <span style={{ color: '#f8fafc' }}>{registrationSubmitted.shop.ownerEmail}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem' }}>
              <span style={{ color: '#64748b' }}>Initial Status:</span>
              <span style={{
                color: '#fbbf24',
                fontWeight: '700',
                background: 'rgba(251, 191, 36, 0.15)',
                padding: '0.1rem 0.5rem',
                borderRadius: '4px',
                display: 'inline-block',
                width: 'fit-content'
              }}>
                PENDING REVIEW
              </span>
            </div>
          </div>

          <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1.5rem' }}>
            The campus administrator will review your shop details and pricing tiers. 
            Once approved, students can direct orders to your counter, and you can spool print jobs.
          </p>

          <button
            type="button"
            className="primary-action-btn"
            style={{ width: '100%', justifyContent: 'center', padding: '0.75rem' }}
            onClick={() => {
              if (onAuthSuccess) onAuthSuccess(registrationSubmitted.user);
            }}
          >
            Go to Counter Dashboard & Status
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: isRegistering ? '720px' : '440px', margin: '2rem auto', padding: '0 1rem' }}>
      <div className="panel-card" style={{ padding: '2rem 1.75rem' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: '#4f46e5',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            marginBottom: '0.75rem'
          }}>
            {isRegistering ? '🏪' : '🔐'}
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#f8fafc', margin: '0 0 0.35rem' }}>
            {isRegistering ? 'Register Campus Print Counter' : 'Shopkeeper Counter Portal'}
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>
            {isRegistering
              ? 'Provide counter details, supported services, and tiered rates to join Print-Sathi'
              : 'Sign in to access your incoming live print queue & printer desk'}
          </p>
        </div>

        {/* Error Notification Alert */}
        {error && (
          <div className="inline-error-alert" style={{
            marginBottom: '1.5rem',
            whiteSpace: 'pre-line',
            lineHeight: '1.45',
            padding: '1rem',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid #ef4444',
            color: '#fca5a5',
            fontSize: '0.84rem'
          }}>
            <strong>⚠️ System Notice:</strong>
            <div style={{ marginTop: '0.35rem' }}>{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* ======================================================== */}
          {/* SECTION 1: SHOPKEEPER PERSONAL DETAILS                   */}
          {/* ======================================================== */}
          {isRegistering && (
            <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #334155', paddingBottom: '1.25rem' }}>
              <h4 style={{ fontSize: '0.92rem', fontWeight: '700', color: '#38bdf8', margin: '0 0 0.85rem' }}>
                1. Shopkeeper Details
              </h4>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
                <div className="config-group" style={{ margin: 0 }}>
                  <label className="config-label">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Chandra"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div className="config-group" style={{ margin: 0 }}>
                  <label className="config-label">10-Digit Mobile Number *</label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="e.g. 9876543210"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* SECTION 2: SHOP DETAILS (CUSTOM NAME & LOCATION)         */}
          {/* ======================================================== */}
          {isRegistering && (
            <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #334155', paddingBottom: '1.25rem' }}>
              <h4 style={{ fontSize: '0.92rem', fontWeight: '700', color: '#38bdf8', margin: '0 0 0.85rem' }}>
                2. Counter Name & Location Details
              </h4>

              <div className="config-group" style={{ marginBottom: '0.85rem' }}>
                <label className="config-label">Shop / Counter Name * (Chosen by You)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rajiv Bhawan Xerox & Print Hub"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  style={inputStyle}
                />
                <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginTop: '0.25rem' }}>
                  This exact name will be displayed to students across the campus directory.
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
                <div className="config-group" style={{ margin: 0 }}>
                  <label className="config-label">Bhavan / Building *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rajiv Bhawan"
                    value={building}
                    onChange={(e) => setBuilding(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div className="config-group" style={{ margin: 0 }}>
                  <label className="config-label">Floor</label>
                  <input
                    type="text"
                    placeholder="e.g. Ground Floor"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div className="config-group" style={{ margin: 0 }}>
                  <label className="config-label">Room / Desk / Area</label>
                  <input
                    type="text"
                    placeholder="e.g. Near Canteen, Shop 4"
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div className="config-group" style={{ marginTop: '0.85rem', marginBottom: 0 }}>
                <label className="config-label">Short Description / Tagline (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Spiral binding, thesis printing, and glossy covers"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* SECTION 3: SUPPORTED SERVICES TOGGLES                    */}
          {/* ======================================================== */}
          {isRegistering && (
            <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #334155', paddingBottom: '1.25rem' }}>
              <h4 style={{ fontSize: '0.92rem', fontWeight: '700', color: '#38bdf8', margin: '0 0 0.85rem' }}>
                3. Supported Services
              </h4>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '0 0 0.75rem' }}>
                Enable the capabilities your physical printer and shop offer:
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.65rem' }}>
                <label style={checkboxCardStyle(services.bw)}>
                  <input
                    type="checkbox"
                    checked={services.bw}
                    onChange={() => handleServiceToggle('bw')}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <span>Black & White</span>
                </label>

                <label style={checkboxCardStyle(services.color)}>
                  <input
                    type="checkbox"
                    checked={services.color}
                    onChange={() => handleServiceToggle('color')}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <span>Color Printing</span>
                </label>

                <label style={checkboxCardStyle(services.single)}>
                  <input
                    type="checkbox"
                    checked={services.single}
                    onChange={() => handleServiceToggle('single')}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <span>Single-Sided</span>
                </label>

                <label style={checkboxCardStyle(services.duplex)}>
                  <input
                    type="checkbox"
                    checked={services.duplex}
                    onChange={() => handleServiceToggle('duplex')}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <span>Duplex (Double)</span>
                </label>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* SECTION 4: CONFIGURABLE QUANTITY TIERS                   */}
          {/* ======================================================== */}
          {isRegistering && (
            <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #334155', paddingBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h4 style={{ fontSize: '0.92rem', fontWeight: '700', color: '#38bdf8', margin: 0 }}>
                  4. Quantity Tier Pricing (Flat Rates in ₹)
                </h4>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Tiers: 1–49, 50–99, 100+ copies</span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '0 0 0.85rem' }}>
                Configure your custom per-page / per-sheet rates for each enabled service:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {/* B&W Single */}
                {services.bw && services.single && (
                  <div style={tierBoxStyle}>
                    <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#f8fafc', marginBottom: '0.5rem' }}>
                      📄 Black & White — Single-Sided (₹ / page)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                      <div>
                        <label style={tierLabelStyle}>1–49 copies</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={tierRates.bw_single_t1}
                          onChange={(e) => handleRateChange('bw_single_t1', e.target.value)}
                          style={tierInputStyle}
                        />
                      </div>
                      <div>
                        <label style={tierLabelStyle}>50–99 copies</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={tierRates.bw_single_t2}
                          onChange={(e) => handleRateChange('bw_single_t2', e.target.value)}
                          style={tierInputStyle}
                        />
                      </div>
                      <div>
                        <label style={tierLabelStyle}>100+ copies</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={tierRates.bw_single_t3}
                          onChange={(e) => handleRateChange('bw_single_t3', e.target.value)}
                          style={tierInputStyle}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* B&W Duplex */}
                {services.bw && services.duplex && (
                  <div style={tierBoxStyle}>
                    <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#f8fafc', marginBottom: '0.5rem' }}>
                      📄 Black & White — Duplex (₹ / sheet)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                      <div>
                        <label style={tierLabelStyle}>1–49 copies</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={tierRates.bw_double_t1}
                          onChange={(e) => handleRateChange('bw_double_t1', e.target.value)}
                          style={tierInputStyle}
                        />
                      </div>
                      <div>
                        <label style={tierLabelStyle}>50–99 copies</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={tierRates.bw_double_t2}
                          onChange={(e) => handleRateChange('bw_double_t2', e.target.value)}
                          style={tierInputStyle}
                        />
                      </div>
                      <div>
                        <label style={tierLabelStyle}>100+ copies</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={tierRates.bw_double_t3}
                          onChange={(e) => handleRateChange('bw_double_t3', e.target.value)}
                          style={tierInputStyle}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Color Single */}
                {services.color && services.single && (
                  <div style={tierBoxStyle}>
                    <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#f8fafc', marginBottom: '0.5rem' }}>
                      🌈 Color — Single-Sided (₹ / page)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                      <div>
                        <label style={tierLabelStyle}>1–49 copies</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={tierRates.color_single_t1}
                          onChange={(e) => handleRateChange('color_single_t1', e.target.value)}
                          style={tierInputStyle}
                        />
                      </div>
                      <div>
                        <label style={tierLabelStyle}>50–99 copies</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={tierRates.color_single_t2}
                          onChange={(e) => handleRateChange('color_single_t2', e.target.value)}
                          style={tierInputStyle}
                        />
                      </div>
                      <div>
                        <label style={tierLabelStyle}>100+ copies</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={tierRates.color_single_t3}
                          onChange={(e) => handleRateChange('color_single_t3', e.target.value)}
                          style={tierInputStyle}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Color Duplex */}
                {services.color && services.duplex && (
                  <div style={tierBoxStyle}>
                    <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#f8fafc', marginBottom: '0.5rem' }}>
                      🌈 Color — Duplex (₹ / sheet)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                      <div>
                        <label style={tierLabelStyle}>1–49 copies</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={tierRates.color_double_t1}
                          onChange={(e) => handleRateChange('color_double_t1', e.target.value)}
                          style={tierInputStyle}
                        />
                      </div>
                      <div>
                        <label style={tierLabelStyle}>50–99 copies</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={tierRates.color_double_t2}
                          onChange={(e) => handleRateChange('color_double_t2', e.target.value)}
                          style={tierInputStyle}
                        />
                      </div>
                      <div>
                        <label style={tierLabelStyle}>100+ copies</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={tierRates.color_double_t3}
                          onChange={(e) => handleRateChange('color_double_t3', e.target.value)}
                          style={tierInputStyle}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* SECTION 5: ACCOUNT CREDENTIALS (EMAIL & PASSWORD)        */}
          {/* ======================================================== */}
          <div style={{ marginBottom: '1.25rem' }}>
            {isRegistering && (
              <h4 style={{ fontSize: '0.92rem', fontWeight: '700', color: '#38bdf8', margin: '0 0 0.85rem' }}>
                5. Portal Login Credentials
              </h4>
            )}

            <div className="config-group" style={{ marginBottom: '0.85rem' }}>
              <label className="config-label">Shopkeeper Email Address *</label>
              <input
                type="email"
                required
                placeholder="counter@printsathi.campus"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isRegistering ? '1fr 1fr' : '1fr', gap: '0.85rem' }}>
              <div className="config-group" style={{ margin: 0 }}>
                <label className="config-label">Password *</label>
                <input
                  type="password"
                  required
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {isRegistering && (
                <div className="config-group" style={{ margin: 0 }}>
                  <label className="config-label">Confirm Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="primary-action-btn"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '0.75rem', fontSize: '0.95rem' }}
          >
            {loading
              ? 'Processing...'
              : isRegistering
              ? 'Submit Counter Registration'
              : 'Sign In to Counter Portal'}
          </button>
        </form>

        {/* Demo Fast Login & Mode Switcher */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #334155', textAlign: 'center' }}>
          {!isRegistering && (
            <button
              type="button"
              onClick={handleQuickDemoLogin}
              disabled={loading}
              style={{
                background: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                color: '#38bdf8',
                padding: '0.5rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: '600',
                width: '100%',
                marginBottom: '1rem'
              }}
            >
              ⚡ Fast Demo Sign-In (Counter 1)
            </button>
          )}

          <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            {isRegistering ? (
              <>
                Already have a registered counter?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsRegistering(false);
                    setError(null);
                  }}
                  style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', textDecoration: 'underline', fontWeight: '600' }}
                >
                  Sign in here
                </button>
              </>
            ) : (
              <>
                New campus Xerox shop or counter?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsRegistering(true);
                    setError(null);
                  }}
                  style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', textDecoration: 'underline', fontWeight: '600' }}
                >
                  Register new counter
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Styling helpers
const inputStyle = {
  width: '100%',
  padding: '0.65rem 0.85rem',
  borderRadius: '6px',
  background: '#0f172a',
  border: '1px solid #334155',
  color: '#f8fafc',
  fontSize: '0.85rem',
  boxSizing: 'border-box',
};

const checkboxCardStyle = (isActive) => ({
  display: 'flex',
  alignItems: 'center',
  padding: '0.55rem 0.75rem',
  borderRadius: '6px',
  background: isActive ? 'rgba(79, 70, 229, 0.15)' : '#0f172a',
  border: `1px solid ${isActive ? '#4f46e5' : '#334155'}`,
  color: isActive ? '#f8fafc' : '#94a3b8',
  fontSize: '0.82rem',
  cursor: 'pointer',
  fontWeight: isActive ? '600' : '400',
  transition: 'all 0.15s ease',
});

const tierBoxStyle = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '0.75rem 0.85rem',
};

const tierLabelStyle = {
  display: 'block',
  fontSize: '0.72rem',
  color: '#94a3b8',
  marginBottom: '0.25rem',
};

const tierInputStyle = {
  width: '100%',
  padding: '0.45rem 0.6rem',
  borderRadius: '4px',
  background: '#1e293b',
  border: '1px solid #334155',
  color: '#f8fafc',
  fontSize: '0.82rem',
  boxSizing: 'border-box',
};
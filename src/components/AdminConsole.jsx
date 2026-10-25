/**
 * ============================================================================
 * PRINT-SATHI COMPONENT: Campus Administrator Console (/admin)
 * ============================================================================
 * 
 * Features:
 * 1. Secure Admin Authentication:
 *    - Authenticates via Firebase Authentication (Zero plaintext passwords in client code)
 *    - Maps administrator username ("Jaideep Singh") to secure Firebase Auth identity
 * 2. Real-Time Shop Audit & Approval Lifecycle:
 *    - Displays real Firestore records (Seed mock data removed from live administrative view)
 *    - Tabs: Pending Review, Approved & Active, Suspended, Rejected, All Counters
 *    - Consequential actions with confirmation dialogs (Approve, Reject, Suspend, Reactivate)
 * 3. Onboarding & Direct Provisioning:
 *    - Allows authorized administrators to provision counters directly across university blocks
 */

import React, { useState, useEffect } from 'react';
import { 
  getAllShops, 
  subscribeToAllShops,
  updateShopStatus, 
  createShop, 
  loginAdmin, 
  logoutAdmin, 
  getAdminSession 
} from '../services/firebase';
import { formatCurrency } from '../utils/pricingEngine';

export default function AdminConsole({ adminUser: externalAdminUser, onLoginSuccess, onLogout: externalLogout }) {
  const [internalAdminUser, setInternalAdminUser] = useState(null);
  const adminUser = externalAdminUser !== undefined ? externalAdminUser : internalAdminUser;
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Shop management state
  const [shops, setShops] = useState([]);
  const [loadingShops, setLoadingShops] = useState(false);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'approved' | 'suspended' | 'rejected' | 'all'
  const [isAddingShop, setIsAddingShop] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null);

  // Rejection modal state
  const [rejectingShop, setRejectingShop] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Provisioning form state
  const [newShopName, setNewShopName] = useState('');
  const [newBuilding, setNewBuilding] = useState('');
  const [newFloor, setNewFloor] = useState('Ground Floor');
  const [newRoom, setNewRoom] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // Check stored admin session on mount
  useEffect(() => {
    const session = getAdminSession();
    if (session) {
      setInternalAdminUser(session);
      if (onLoginSuccess) onLoginSuccess(session);
    }
    setCheckingAuth(false);
  }, []);

  // Real-time synchronization of all shops from Firestore
  useEffect(() => {
    if (!adminUser) return;
    setLoadingShops(true);
    const unsubscribe = subscribeToAllShops(
      (all) => {
        setShops(all);
        setLoadingShops(false);
      },
      (err) => {
        console.warn('Admin real-time listener error:', err);
        setLoadingShops(false);
      }
    );
    return () => unsubscribe();
  }, [adminUser]);

  const loadShops = async () => {
    setLoadingShops(true);
    try {
      const all = await getAllShops();
      setShops(all);
    } catch (err) {
      console.warn('Error loading admin shops:', err);
    } finally {
      setLoadingShops(false);
    }
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      const result = await loginAdmin(username, password);
      setInternalAdminUser(result.user);
      if (onLoginSuccess) onLoginSuccess(result.user);
    } catch (err) {
      setAuthError(err.message || 'Administrator sign-in failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminLogout = async () => {
    await logoutAdmin();
    setInternalAdminUser(null);
    setShops([]);
    if (externalLogout) externalLogout();
  };

  // Consequential Action Handlers with explicit Confirmation
  const handleApproveShop = async (shop) => {
    const confirmed = window.confirm(
      `Authorize & Approve Counter?\n\nShop Name: "${shop.name}"\nLocation: ${shop.location?.building}, ${shop.location?.floor}\n\nThis will immediately enable student print queueing for this counter.`
    );
    if (!confirmed) return;

    setActionInProgress(shop.shopId);
    try {
      await updateShopStatus(shop.shopId, 'APPROVED');
      await loadShops();
    } catch (e) {
      alert(`Could not approve shop: ${e.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleSuspendShop = async (shop) => {
    const confirmed = window.confirm(
      `Suspend Print Counter?\n\nShop Name: "${shop.name}"\n\nStudents will not be able to send new orders to this desk until reactivated.`
    );
    if (!confirmed) return;

    setActionInProgress(shop.shopId);
    try {
      await updateShopStatus(shop.shopId, 'SUSPENDED');
      await loadShops();
    } catch (e) {
      alert(`Could not suspend shop: ${e.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingShop) return;
    setActionInProgress(rejectingShop.shopId);
    try {
      await updateShopStatus(rejectingShop.shopId, 'REJECTED', rejectionReason.trim());
      setRejectingShop(null);
      setRejectionReason('');
      await loadShops();
    } catch (e) {
      alert(`Could not reject shop: ${e.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCreateShop = async (e) => {
    e.preventDefault();
    const cleanSlug = newShopName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20) || 'counter';
    const shopId = `shop_${cleanSlug}_${Math.random().toString(36).substring(2, 7)}`;

    const newShopData = {
      shopId,
      name: newShopName.trim(),
      shopkeeperName: newOwnerName.trim(),
      ownerEmail: newEmail.trim().toLowerCase(),
      contactPhone: newPhone.trim(),
      location: {
        building: newBuilding.trim(),
        floor: newFloor.trim(),
        room: newRoom.trim() || 'Desk 1',
      },
      status: 'APPROVED',
      isAcceptingOrders: true,
      supportedServices: { bw: true, color: true, single: true, duplex: true },
    };

    try {
      await createShop(newShopData);
      setIsAddingShop(false);
      // Reset form
      setNewShopName('');
      setNewOwnerName('');
      setNewBuilding('');
      setNewFloor('Ground Floor');
      setNewRoom('');
      setNewEmail('');
      setNewPhone('');
      await loadShops();
    } catch (e) {
      alert(`Failed to provision counter: ${e.message}`);
    }
  };

  if (checkingAuth) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
        Verifying Administrator Access...
      </div>
    );
  }

  // ==========================================================================
  // VIEW 1: SECURE ADMIN LOGIN SCREEN (When Unauthenticated)
  // ==========================================================================
  if (!adminUser) {
    return (
      <div style={{ maxWidth: '440px', margin: '3rem auto', padding: '0 1rem' }}>
        <div className="panel-card" style={{ padding: '2.25rem 2rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{
              width: '54px',
              height: '54px',
              borderRadius: '14px',
              background: '#4f46e5',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.75rem',
              marginBottom: '0.75rem'
            }}>
              🛡️
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#f8fafc', margin: '0 0 0.35rem' }}>
              Campus IT Administrator Login
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>
              Authorized operations portal to approve, audit, and regulate campus print desks.
            </p>
          </div>

          {authError && (
            <div className="inline-error-alert" style={{
              marginBottom: '1.25rem',
              whiteSpace: 'pre-line',
              lineHeight: '1.45',
              padding: '0.9rem',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid #ef4444',
              color: '#fca5a5',
              fontSize: '0.84rem'
            }}>
              <strong>⚠️ Sign-In Warning:</strong>
              <div style={{ marginTop: '0.25rem' }}>{authError}</div>
            </div>
          )}

          <form onSubmit={handleAdminLogin}>
            <div className="config-group" style={{ marginBottom: '1rem' }}>
              <label className="config-label">Administrator Username or Email</label>
              <input
                type="text"
                required
                placeholder="e.g. Jaideep Singh"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={inputStyle}
              />
              <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginTop: '0.25rem' }}>
                Campus admin handles: Jaideep Singh or admin.jaideep@printsathi.campus
              </span>
            </div>

            <div className="config-group" style={{ marginBottom: '1.5rem' }}>
              <label className="config-label">Admin Master Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
            </div>

            <button
              type="submit"
              className="primary-action-btn"
              disabled={authLoading}
              style={{ width: '100%', justifyContent: 'center', padding: '0.75rem', fontSize: '0.92rem' }}
            >
              {authLoading ? 'Verifying Credentials...' : 'Authenticate & Open Console'}
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.76rem', color: '#64748b' }}>
            🔒 Authenticated against Google Identity Platform &bull; Print Sathi Campus Operations
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // VIEW 2: ADMINISTRATOR DASHBOARD & APPROVAL CONSOLE
  // ==========================================================================

  // Dynamic Metrics calculated directly from Firestore
  const pendingShops = shops.filter((s) => s.status === 'PENDING');
  const approvedShops = shops.filter((s) => s.status === 'APPROVED');
  const suspendedShops = shops.filter((s) => s.status === 'SUSPENDED');
  const rejectedShops = shops.filter((s) => s.status === 'REJECTED');

  // Filtered list based on active tab
  const displayedShops = shops.filter((s) => {
    if (activeTab === 'pending') return s.status === 'PENDING';
    if (activeTab === 'approved') return s.status === 'APPROVED';
    if (activeTab === 'suspended') return s.status === 'SUSPENDED';
    if (activeTab === 'rejected') return s.status === 'REJECTED';
    return true; // 'all'
  });

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 0.5rem' }}>
      {/* Admin Top Navigation & Header */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '1.25rem 1.5rem',
        marginBottom: '1.5rem',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🛡️</span>
            <h2 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#f8fafc', margin: 0 }}>
              Campus Printing Operations Admin
            </h2>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0.25rem 0 0' }}>
            Signed in as <strong style={{ color: '#38bdf8' }}>{adminUser.displayName || 'Administrator'}</strong> ({adminUser.email})
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          <button
            type="button"
            className="secondary-action-btn"
            onClick={loadShops}
            disabled={loadingShops}
            style={{ padding: '0.55rem 0.85rem', fontSize: '0.82rem' }}
          >
            🔄 Refresh Records
          </button>

          <button
            type="button"
            className="primary-action-btn"
            onClick={() => setIsAddingShop(!isAddingShop)}
            style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}
          >
            {isAddingShop ? 'Close Form' : '+ Provision Counter'}
          </button>

          <button
            type="button"
            onClick={handleAdminLogout}
            style={{
              background: 'transparent',
              border: '1px solid #475569',
              color: '#94a3b8',
              padding: '0.55rem 0.85rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Metrics Row (Dynamically Derived from Real Firestore Records) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '0.85rem',
        marginBottom: '1.5rem'
      }}>
        <div 
          className="panel-card" 
          onClick={() => setActiveTab('pending')}
          style={{ padding: '1rem', margin: 0, cursor: 'pointer', border: activeTab === 'pending' ? '1px solid #fbbf24' : '1px solid #334155' }}
        >
          <div style={{ fontSize: '0.74rem', color: '#fbbf24', textTransform: 'uppercase', fontWeight: '700' }}>
            Pending Review
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: '800', color: '#fbbf24', marginTop: '0.2rem' }}>
            {pendingShops.length}
          </div>
        </div>

        <div 
          className="panel-card" 
          onClick={() => setActiveTab('approved')}
          style={{ padding: '1rem', margin: 0, cursor: 'pointer', border: activeTab === 'approved' ? '1px solid #34d399' : '1px solid #334155' }}
        >
          <div style={{ fontSize: '0.74rem', color: '#34d399', textTransform: 'uppercase', fontWeight: '700' }}>
            Active & Approved
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: '800', color: '#34d399', marginTop: '0.2rem' }}>
            {approvedShops.length}
          </div>
        </div>

        <div 
          className="panel-card" 
          onClick={() => setActiveTab('suspended')}
          style={{ padding: '1rem', margin: 0, cursor: 'pointer', border: activeTab === 'suspended' ? '1px solid #f87171' : '1px solid #334155' }}
        >
          <div style={{ fontSize: '0.74rem', color: '#f87171', textTransform: 'uppercase', fontWeight: '700' }}>
            Suspended
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: '800', color: '#f87171', marginTop: '0.2rem' }}>
            {suspendedShops.length}
          </div>
        </div>

        <div 
          className="panel-card" 
          onClick={() => setActiveTab('rejected')}
          style={{ padding: '1rem', margin: 0, cursor: 'pointer', border: activeTab === 'rejected' ? '1px solid #94a3b8' : '1px solid #334155' }}
        >
          <div style={{ fontSize: '0.74rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>
            Rejected
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: '800', color: '#94a3b8', marginTop: '0.2rem' }}>
            {rejectedShops.length}
          </div>
        </div>

        <div 
          className="panel-card" 
          onClick={() => setActiveTab('all')}
          style={{ padding: '1rem', margin: 0, cursor: 'pointer', border: activeTab === 'all' ? '1px solid #38bdf8' : '1px solid #334155' }}
        >
          <div style={{ fontSize: '0.74rem', color: '#38bdf8', textTransform: 'uppercase', fontWeight: '700' }}>
            Total Counters
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: '800', color: '#f8fafc', marginTop: '0.2rem' }}>
            {shops.length}
          </div>
        </div>
      </div>

      {/* Provision New Counter Drawer / Form */}
      {isAddingShop && (
        <div className="panel-card" style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid #4f46e5' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#f8fafc', margin: '0 0 1rem' }}>
            Direct Provision New Campus Print Counter
          </h3>
          <form onSubmit={handleCreateShop}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
              <div>
                <label className="config-label">Shop / Counter Display Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jawahar Bhawan Xeroxing Desk"
                  value={newShopName}
                  onChange={(e) => setNewShopName(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="config-label">Shopkeeper Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Suresh Kumar"
                  value={newOwnerName}
                  onChange={(e) => setNewOwnerName(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="config-label">Bhavan / Building *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jawahar Bhawan"
                  value={newBuilding}
                  onChange={(e) => setNewBuilding(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="config-label">Floor</label>
                <input
                  type="text"
                  value={newFloor}
                  onChange={(e) => setNewFloor(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="config-label">Room / Desk</label>
                <input
                  type="text"
                  placeholder="e.g. Room G-12"
                  value={newRoom}
                  onChange={(e) => setNewRoom(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="config-label">Owner Email *</label>
                <input
                  type="email"
                  required
                  placeholder="counter@printsathi.campus"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="config-label">Contact Phone</label>
                <input
                  type="text"
                  placeholder="e.g. 9876543210"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="secondary-action-btn"
                onClick={() => setIsAddingShop(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-action-btn"
              >
                Deploy & Authorize Counter
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs Filter Row */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #334155', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          style={tabButtonStyle(activeTab === 'pending', '#fbbf24')}
        >
          Pending Review ({pendingShops.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('approved')}
          style={tabButtonStyle(activeTab === 'approved', '#34d399')}
        >
          Approved & Active ({approvedShops.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('suspended')}
          style={tabButtonStyle(activeTab === 'suspended', '#f87171')}
        >
          Suspended ({suspendedShops.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rejected')}
          style={tabButtonStyle(activeTab === 'rejected', '#94a3b8')}
        >
          Rejected ({rejectedShops.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          style={tabButtonStyle(activeTab === 'all', '#38bdf8')}
        >
          All Counters ({shops.length})
        </button>
      </div>

      {/* Counter List View */}
      <div className="panel-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
            {activeTab === 'pending' && 'Print Counters Awaiting Authorization'}
            {activeTab === 'approved' && 'Active Verified Campus Counters'}
            {activeTab === 'suspended' && 'Suspended Campus Counters'}
            {activeTab === 'rejected' && 'Rejected Counter Registrations'}
            {activeTab === 'all' && 'All Registered Campus Counters'}
          </h3>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
            Showing {displayedShops.length} of {shops.length} records in Firestore
          </span>
        </div>

        {loadingShops ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
            Loading live Firestore records...
          </div>
        ) : displayedShops.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
            <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>📋</span>
            No counters found in this category.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {displayedShops.map((shop) => (
              <div 
                key={shop.shopId}
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem'
                }}
              >
                {/* Top Row: Shop Name & Status Badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <h4 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#f8fafc', margin: 0 }}>
                      {shop.name}
                    </h4>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                      ID: {shop.shopId} &bull; Registered: {shop.createdAt ? new Date(shop.createdAt).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>

                  <span style={statusBadgeStyle(shop.status)}>
                    {shop.status}
                  </span>
                </div>

                {/* Details Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.82rem' }}>
                  <div>
                    <span style={{ color: '#64748b', display: 'block' }}>Shopkeeper & Contact:</span>
                    <strong style={{ color: '#f8fafc' }}>{shop.shopkeeperName || 'Unspecified'}</strong>
                    <div style={{ color: '#94a3b8' }}>{shop.ownerEmail}</div>
                    <div style={{ color: '#94a3b8' }}>{shop.contactPhone || 'No phone'}</div>
                  </div>

                  <div>
                    <span style={{ color: '#64748b', display: 'block' }}>Location:</span>
                    <strong style={{ color: '#f8fafc' }}>{shop.location?.building}</strong>
                    <div style={{ color: '#94a3b8' }}>{shop.location?.floor} &bull; {shop.location?.room || 'Desk'}</div>
                    {shop.tagline && <div style={{ color: '#64748b', fontStyle: 'italic', marginTop: '0.2rem' }}>"{shop.tagline}"</div>}
                  </div>

                  <div>
                    <span style={{ color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>Supported Services:</span>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {shop.supportedServices?.bw && <span style={pillStyle}>B&W</span>}
                      {shop.supportedServices?.color && <span style={pillStyle}>Color</span>}
                      {shop.supportedServices?.single && <span style={pillStyle}>Single</span>}
                      {shop.supportedServices?.duplex && <span style={pillStyle}>Duplex</span>}
                    </div>
                  </div>

                  {/* Quantity Tier Rates Preview */}
                  <div>
                    <span style={{ color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>Quantity Rates (1–49 / 50–99 / 100+):</span>
                    <div style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                      <div>
                        B&W Single: ₹{shop.pricingTiers?.bw?.single?.[0]?.rate ?? 2} / ₹{shop.pricingTiers?.bw?.single?.[1]?.rate ?? 1.5} / ₹{shop.pricingTiers?.bw?.single?.[2]?.rate ?? 1}
                      </div>
                      <div>
                        B&W Duplex: ₹{shop.pricingTiers?.bw?.double?.[0]?.rate ?? 3} / ₹{shop.pricingTiers?.bw?.double?.[1]?.rate ?? 2.2} / ₹{shop.pricingTiers?.bw?.double?.[2]?.rate ?? 1.6}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rejection remarks if present */}
                {shop.rejectionReason && (
                  <div style={{ fontSize: '0.78rem', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem', borderRadius: '6px' }}>
                    <strong>Rejection Notes:</strong> {shop.rejectionReason}
                  </div>
                )}

                {/* Actions Bar */}
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', borderTop: '1px solid #1e293b', paddingTop: '0.75rem', flexWrap: 'wrap' }}>
                  {shop.status === 'PENDING' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApproveShop(shop)}
                        disabled={actionInProgress === shop.shopId}
                        style={actionBtnStyle('#10b981')}
                      >
                        ✅ Authorize & Approve Counter
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingShop(shop);
                          setRejectionReason('');
                        }}
                        disabled={actionInProgress === shop.shopId}
                        style={actionBtnStyle('#ef4444')}
                      >
                        ❌ Reject Application
                      </button>
                    </>
                  )}

                  {shop.status === 'APPROVED' && (
                    <button
                      type="button"
                      onClick={() => handleSuspendShop(shop)}
                      disabled={actionInProgress === shop.shopId}
                      style={actionBtnStyle('#f59e0b')}
                    >
                      ⏸️ Suspend Counter
                    </button>
                  )}

                  {(shop.status === 'SUSPENDED' || shop.status === 'REJECTED') && (
                    <button
                      type="button"
                      onClick={() => handleApproveShop(shop)}
                      disabled={actionInProgress === shop.shopId}
                      style={actionBtnStyle('#10b981')}
                    >
                      🔄 Reactivate / Re-Approve Counter
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rejection Modal */}
      {rejectingShop && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div className="panel-card" style={{ maxWidth: '480px', width: '100%', padding: '1.75rem' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#f87171', margin: '0 0 0.5rem' }}>
              Reject Counter Application
            </h3>
            <p style={{ fontSize: '0.84rem', color: '#94a3b8', margin: '0 0 1rem', lineHeight: '1.45' }}>
              You are about to reject the registration for <strong style={{ color: '#f8fafc' }}>"{rejectingShop.name}"</strong>. 
              Please provide an explanation or feedback for the shopkeeper:
            </p>

            <textarea
              rows={3}
              placeholder="e.g. Incomplete floor/room details or duplicate counter registration."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              style={{ ...inputStyle, width: '100%', resize: 'vertical', marginBottom: '1.25rem' }}
            />

            <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="secondary-action-btn"
                onClick={() => setRejectingShop(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-action-btn"
                onClick={handleConfirmReject}
                style={{ background: '#ef4444' }}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Styling Constants
const inputStyle = {
  width: '100%',
  padding: '0.6rem 0.8rem',
  borderRadius: '6px',
  background: '#0f172a',
  border: '1px solid #334155',
  color: '#f8fafc',
  fontSize: '0.84rem',
  boxSizing: 'border-box',
};

const tabButtonStyle = (isActive, activeColor) => ({
  background: isActive ? '#334155' : 'transparent',
  border: 'none',
  color: isActive ? activeColor : '#94a3b8',
  padding: '0.5rem 0.85rem',
  borderRadius: '6px',
  fontSize: '0.84rem',
  fontWeight: '700',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
});

const statusBadgeStyle = (status) => {
  let bg = 'rgba(251, 191, 36, 0.2)';
  let color = '#fbbf24';

  if (status === 'APPROVED') {
    bg = 'rgba(16, 185, 129, 0.2)';
    color = '#34d399';
  } else if (status === 'SUSPENDED' || status === 'REJECTED') {
    bg = 'rgba(239, 68, 68, 0.2)';
    color = '#f87171';
  }

  return {
    fontSize: '0.72rem',
    fontWeight: '700',
    padding: '0.2rem 0.65rem',
    borderRadius: '999px',
    background: bg,
    color: color,
    display: 'inline-block',
  };
};

const pillStyle = {
  fontSize: '0.72rem',
  fontWeight: '600',
  padding: '0.15rem 0.45rem',
  borderRadius: '4px',
  background: 'rgba(56, 189, 248, 0.15)',
  color: '#38bdf8',
  border: '1px solid rgba(56, 189, 248, 0.3)',
};

const actionBtnStyle = (color) => ({
  background: color,
  border: 'none',
  color: '#fff',
  padding: '0.45rem 0.85rem',
  borderRadius: '6px',
  fontSize: '0.78rem',
  fontWeight: '700',
  cursor: 'pointer',
});
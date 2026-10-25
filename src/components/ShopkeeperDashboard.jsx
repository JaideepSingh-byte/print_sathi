/**
 * ============================================================================
 * PRINT-SATHI COMPONENT: Shopkeeper Dashboard & Live Queue Console
 * ============================================================================
 * 
 * Provides shop owners with real-time queue management, printer spooling
 * actions, availability toggles, and counter QR standee generation.
 */

import React, { useState, useEffect } from 'react';
import { 
  getShopForUser, 
  updateShop, 
  subscribeToShopOrders, 
  markJobAsPrinted,
  logoutUser 
} from '../services/firebase';
import { formatCurrency } from '../utils/pricingEngine';
import QRStandeeModal from './QRStandeeModal';

export default function ShopkeeperDashboard({ user, onLogout }) {
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState([]);
  const [completedJobs, setCompletedJobs] = useState([]);
  const [activeTab, setActiveTab] = useState('incoming'); // 'incoming' | 'completed' | 'settings'
  const [isStandeeOpen, setIsStandeeOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Load shop matching owner UID or email
  const loadShopProfile = async () => {
    setLoading(true);
    try {
      const found = await getShopForUser(user?.uid, user?.email);
      setShop(found);
    } catch (err) {
      console.warn('Could not load shop profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShopProfile();
  }, [user]);

  // Subscribe to live Firestore queue only if shop is APPROVED
  useEffect(() => {
    if (!shop?.shopId || shop?.status !== 'APPROVED') return;

    const unsubscribe = subscribeToShopOrders(
      shop.shopId,
      (orders) => {
        const pending = orders.filter((o) => o.status === 'QUEUED' || o.status === 'PRINTING');
        const done = orders.filter((o) => o.status === 'PRINTED' || o.status === 'COMPLETED');
        setQueue(pending);
        setCompletedJobs(done);
      },
      (err) => {
        console.error('Queue subscription error:', err);
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [shop?.shopId, shop?.status]);

  const handleToggleAccepting = async () => {
    if (!shop) return;
    setUpdatingStatus(true);
    const newStatus = !shop.isAcceptingOrders;
    await updateShop(shop.shopId, { isAcceptingOrders: newStatus });
    setShop({ ...shop, isAcceptingOrders: newStatus });
    setUpdatingStatus(false);
  };

  const handleMarkPrinted = async (orderId) => {
    await markJobAsPrinted(orderId);
  };

  const handleSignOut = async () => {
    await logoutUser();
    if (onLogout) onLogout();
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
        Loading Counter Console...
      </div>
    );
  }

  // If no shop record is linked with this account
  if (!shop) {
    return (
      <div style={{ maxWidth: '540px', margin: '3rem auto', padding: '0 1rem' }}>
        <div className="panel-card" style={{ padding: '2.5rem 2rem', textAlign: 'center' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>🔍</span>
          <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#f8fafc', margin: '0 0 0.5rem' }}>
            No Counter Linked to Account
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1.5rem', lineHeight: '1.5' }}>
            We could not find an active or pending print counter linked to <strong>{user?.email}</strong>. 
            Please make sure you have submitted the counter registration form.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              type="button"
              className="primary-action-btn"
              onClick={loadShopProfile}
              style={{ padding: '0.6rem 1.25rem', fontSize: '0.85rem' }}
            >
              🔄 Refresh Check
            </button>
            <button
              type="button"
              className="secondary-action-btn"
              onClick={handleSignOut}
              style={{ padding: '0.6rem 1.25rem', fontSize: '0.85rem' }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // STATUS: PENDING APPROVAL VIEW
  if (shop.status === 'PENDING') {
    return (
      <div style={{ maxWidth: '640px', margin: '2rem auto', padding: '0 1rem' }}>
        <div className="panel-card" style={{ padding: '2rem 1.75rem' }}>
          {/* Status Header */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(251, 191, 36, 0.15)',
              border: '2px solid #fbbf24',
              color: '#fbbf24',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.75rem',
              marginBottom: '0.75rem'
            }}>
              ⏳
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#f8fafc', margin: '0 0 0.35rem' }}>
              Counter Awaiting Administrator Approval
            </h2>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: '700',
              padding: '0.2rem 0.65rem',
              borderRadius: '999px',
              background: 'rgba(251, 191, 36, 0.2)',
              color: '#fbbf24',
              display: 'inline-block'
            }}>
              STATUS: PENDING REVIEW
            </span>
          </div>

          <p style={{ fontSize: '0.86rem', color: '#94a3b8', textAlign: 'center', margin: '0 0 1.5rem', lineHeight: '1.5' }}>
            Your registration for <strong style={{ color: '#38bdf8' }}>"{shop.name}"</strong> has been received 
            and is awaiting verification by the campus administrator. 
            Once approved, incoming print orders and auto-spooling will be activated.
          </p>

          {/* Submitted Profile Summary */}
          <div style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            fontSize: '0.84rem'
          }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: '#38bdf8', margin: '0 0 0.75rem', textTransform: 'uppercase' }}>
              Registered Counter Specifications
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '0.45rem', marginBottom: '0.35rem' }}>
              <span style={{ color: '#64748b' }}>Shop ID:</span>
              <span style={{ color: '#f8fafc', fontFamily: 'monospace' }}>{shop.shopId}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '0.45rem', marginBottom: '0.35rem' }}>
              <span style={{ color: '#64748b' }}>Shopkeeper:</span>
              <span style={{ color: '#f8fafc' }}>{shop.shopkeeperName || user?.displayName || 'Registered Owner'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '0.45rem', marginBottom: '0.35rem' }}>
              <span style={{ color: '#64748b' }}>Contact Phone:</span>
              <span style={{ color: '#f8fafc' }}>{shop.contactPhone || 'Not provided'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '0.45rem', marginBottom: '0.35rem' }}>
              <span style={{ color: '#64748b' }}>Location:</span>
              <span style={{ color: '#f8fafc' }}>
                {shop.location?.building}, {shop.location?.floor} ({shop.location?.room})
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '0.45rem', marginBottom: '0.35rem' }}>
              <span style={{ color: '#64748b' }}>Services:</span>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {shop.supportedServices?.bw && <span style={pillStyle}>B&W</span>}
                {shop.supportedServices?.color && <span style={pillStyle}>Color</span>}
                {shop.supportedServices?.single && <span style={pillStyle}>Single</span>}
                {shop.supportedServices?.duplex && <span style={pillStyle}>Duplex</span>}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              type="button"
              className="primary-action-btn"
              onClick={loadShopProfile}
              style={{ padding: '0.65rem 1.25rem', fontSize: '0.85rem' }}
            >
              🔄 Check Approval Status
            </button>
            <button
              type="button"
              className="secondary-action-btn"
              onClick={handleSignOut}
              style={{ padding: '0.65rem 1.25rem', fontSize: '0.85rem' }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // STATUS: SUSPENDED VIEW
  if (shop.status === 'SUSPENDED') {
    return (
      <div style={{ maxWidth: '580px', margin: '3rem auto', padding: '0 1rem' }}>
        <div className="panel-card" style={{ padding: '2.5rem 2rem', textAlign: 'center' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>⏸️</span>
          <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#f87171', margin: '0 0 0.5rem' }}>
            Counter Temporarily Suspended
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1.5rem', lineHeight: '1.5' }}>
            Counter <strong style={{ color: '#f8fafc' }}>"{shop.name}"</strong> has been suspended by the campus administrator. 
            Students cannot currently route orders to this desk.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              type="button"
              className="primary-action-btn"
              onClick={loadShopProfile}
              style={{ padding: '0.6rem 1.25rem', fontSize: '0.85rem' }}
            >
              🔄 Refresh Status
            </button>
            <button
              type="button"
              className="secondary-action-btn"
              onClick={handleSignOut}
              style={{ padding: '0.6rem 1.25rem', fontSize: '0.85rem' }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // STATUS: REJECTED VIEW
  if (shop.status === 'REJECTED') {
    return (
      <div style={{ maxWidth: '580px', margin: '3rem auto', padding: '0 1rem' }}>
        <div className="panel-card" style={{ padding: '2.5rem 2rem', textAlign: 'center' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>❌</span>
          <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#f87171', margin: '0 0 0.5rem' }}>
            Registration Not Approved
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1.25rem', lineHeight: '1.5' }}>
            The application for <strong style={{ color: '#f8fafc' }}>"{shop.name}"</strong> was reviewed and not approved for the campus print directory.
          </p>
          {shop.rejectionReason && (
            <div style={{
              background: '#0f172a',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              padding: '0.85rem',
              color: '#fca5a5',
              fontSize: '0.82rem',
              marginBottom: '1.5rem',
              textAlign: 'left'
            }}>
              <strong>Administrator Remarks:</strong> {shop.rejectionReason}
            </div>
          )}
          <button
            type="button"
            className="secondary-action-btn"
            onClick={handleSignOut}
            style={{ padding: '0.6rem 1.25rem', fontSize: '0.85rem' }}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // STATUS: APPROVED VIEW (Full Active Dashboard)

  return (
    <div style={{ maxWidth: '1050px', margin: '0 auto', padding: '0 0.5rem' }}>
      {/* Top Banner & Control Bar */}
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
            <h2 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#f8fafc', margin: 0 }}>
              {shop?.name || 'Campus Counter Station'}
            </h2>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: '700',
              padding: '0.2rem 0.6rem',
              borderRadius: '999px',
              background: shop?.isAcceptingOrders !== false ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              color: shop?.isAcceptingOrders !== false ? '#34d399' : '#f87171'
            }}>
              {shop?.isAcceptingOrders !== false ? '🟢 ONLINE' : '🔴 OFFLINE'}
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0.25rem 0 0' }}>
            📍 {shop?.location?.building}, {shop?.location?.floor} &bull; Signed in as <strong>{user?.email}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Toggle Online/Offline */}
          <button
            type="button"
            onClick={handleToggleAccepting}
            disabled={updatingStatus}
            style={{
              background: shop?.isAcceptingOrders !== false ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              border: shop?.isAcceptingOrders !== false ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
              color: shop?.isAcceptingOrders !== false ? '#f87171' : '#34d399',
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {shop?.isAcceptingOrders !== false ? 'Pause Incoming Queue' : 'Resume Accepting Orders'}
          </button>

          {/* QR Standee Modal Trigger */}
          <button
            type="button"
            className="secondary-action-btn"
            onClick={() => setIsStandeeOpen(true)}
            style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
          >
            📱 Counter QR Standee
          </button>

          {/* Logout */}
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              background: 'transparent',
              border: '1px solid #475569',
              color: '#94a3b8',
              padding: '0.45rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #334155', paddingBottom: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setActiveTab('incoming')}
          style={{
            background: activeTab === 'incoming' ? '#334155' : 'transparent',
            border: 'none',
            color: activeTab === 'incoming' ? '#38bdf8' : '#94a3b8',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            fontSize: '0.86rem',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Incoming Queue ({queue.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          style={{
            background: activeTab === 'completed' ? '#334155' : 'transparent',
            border: 'none',
            color: activeTab === 'completed' ? '#38bdf8' : '#94a3b8',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            fontSize: '0.86rem',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Completed Today ({completedJobs.length})
        </button>
      </div>

      {/* TAB 1: Incoming Live Queue */}
      {activeTab === 'incoming' && (
        <div className="panel-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
              Real-Time Print Spooler ({queue.length} orders waiting)
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              📡 Auto-refreshing via Firebase onSnapshot
            </span>
          </div>

          {queue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#94a3b8' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✨</div>
              <div style={{ fontWeight: '600', color: '#f8fafc' }}>All caught up! No pending print jobs.</div>
              <p style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>
                Incoming student orders will automatically appear here the second they complete payment.
              </p>
            </div>
          ) : (
            <div className="orders-table-wrapper">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Documents & Config</th>
                    <th>Sheets</th>
                    <th>Paid</th>
                    <th>Time</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((job) => {
                    const files = job.files || [];
                    return (
                      <tr key={job.orderId}>
                        <td>
                          <div style={{ fontSize: '1.15rem', fontWeight: '800', fontFamily: 'monospace', color: '#38bdf8' }}>
                            #{job.token || job.orderId}
                          </div>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{job.orderId}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            {files.map((f, i) => (
                              <div key={i} style={{ fontSize: '0.82rem' }}>
                                <span style={{ fontWeight: '600', color: '#e2e8f0' }}>📄 {f.fileName}</span>{' '}
                                <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                                  ({f.copies}x &bull; {f.colorMode.toUpperCase()} &bull; {f.sides})
                                </span>
                                {f.fileUrl && (
                                  <a
                                    href={f.fileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ marginLeft: '0.4rem', color: '#60a5fa', fontSize: '0.72rem', textDecoration: 'none' }}
                                  >
                                    [PDF]
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td>
                          <strong style={{ fontSize: '0.9rem', color: '#f8fafc' }}>
                            ~{job.pricingSnapshot?.totalSheets || 1}
                          </strong>
                        </td>
                        <td>
                          <span style={{ fontWeight: '700', color: '#34d399' }}>
                            {formatCurrency(job.totalAmount || 0)}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                          {new Date(job.createdAt || Date.now()).toLocaleTimeString()}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="primary-action-btn"
                            onClick={() => handleMarkPrinted(job.orderId)}
                            style={{
                              padding: '0.4rem 0.75rem',
                              fontSize: '0.78rem',
                              background: '#10b981',
                              borderColor: '#059669'
                            }}
                          >
                            ✓ Mark Printed
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
      )}

      {/* TAB 2: Completed Orders */}
      {activeTab === 'completed' && (
        <div className="panel-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#f8fafc', marginBottom: '1rem' }}>
            Completed History ({completedJobs.length} orders)
          </h3>
          {completedJobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
              No completed jobs recorded yet today.
            </div>
          ) : (
            <div className="orders-table-wrapper">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Documents</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {completedJobs.map((job) => (
                    <tr key={job.orderId}>
                      <td>
                        <strong style={{ fontFamily: 'monospace', color: '#94a3b8' }}>#{job.token || job.orderId}</strong>
                      </td>
                      <td>
                        {job.files?.[0]?.fileName || job.fileName || 'document.pdf'}
                        {job.files?.length > 1 && ` (+${job.files.length - 1} more)`}
                      </td>
                      <td>{formatCurrency(job.totalAmount || 0)}</td>
                      <td>
                        <span className="status-badge printed">
                          <span className="status-dot"></span> PRINTED
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Standee Modal */}
      {isStandeeOpen && shop && (
        <QRStandeeModal
          shop={shop}
          isOpen={isStandeeOpen}
          onClose={() => setIsStandeeOpen(false)}
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
  background: 'rgba(56, 189, 248, 0.15)',
  color: '#38bdf8',
  border: '1px solid rgba(56, 189, 248, 0.3)',
};

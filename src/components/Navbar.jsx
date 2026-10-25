/**
 * ============================================================================
 * PRINT-SATHI COMPONENT: Navbar with Routing
 * ============================================================================
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { isFirebaseConfigured } from '../services/firebase';

export default function Navbar({ ordersCount = 0 }) {
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  const statusBadge = isFirebaseConfigured ? (
    <div 
      className="campus-pill firebase-active" 
      title="Connected to Firebase Cloud Firestore"
    >
      <span className="status-dot"></span>
      <span className="status-text-full"><a href="/">🏠 Home</a></span>
      <span className="status-text-mobile"><a href="/">🏠 Home</a></span>
    </div>
  ) : (
    <div 
      className="campus-pill demo-active" 
      title="Running in local simulation mode"
    >
      
    </div>
  );

  return (
    <header className="navbar">
      <div className="navbar-inner">
        {/* Row 1 on Mobile: Brand on Left, Status Badge on Right */}
        <div className="navbar-brand-section">
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="brand-wrapper" role="button" tabIndex={0}>
              <div className="brand-icon">
                <svg 
                  width="22" 
                  height="22" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2.2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
              </div>
              <div className="brand-text-container">
                <h1 className="brand-title">
                  Print<span>Sathi</span>
                </h1>
                <p className="brand-subtitle">Campus Smart Print</p>
              </div>
            </div>
          </Link>

          {/* Status Badge in Header Row on Mobile */}
          <div className="navbar-status-mobile">
            {statusBadge}
          </div>
        </div>

        {/* Desktop Controls (Status + Nav) / Mobile Row 2 (Full-width Nav Tabs) */}
        <div className="navbar-controls">
          <div className="navbar-status-desktop">
            {statusBadge}
          </div>

          <nav className="navbar-nav-group" aria-label="Campus navigation">
            <Link
              to="/"
              className={`nav-tab-btn ${isActive('/') ? 'active' : ''}`}
            >
              Counters
            </Link>

            <Link
              to="/orders"
              className={`nav-tab-btn ${isActive('/orders') ? 'active' : ''}`}
            >
              📋 Orders {ordersCount > 0 && <span className="nav-orders-count">({ordersCount})</span>}
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}

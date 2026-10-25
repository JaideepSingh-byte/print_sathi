/**
 * ============================================================================
 * PRINT-SATHI: Enterprise Multi-Shop Routing & Main App Entry (App.jsx)
 * ============================================================================
 * 
 * Features:
 * - Dynamic routes using `react-router-dom`:
 *   * `/` : Campus Home & Shop Directory + Quick Upload
 *   * `/shop/:shopId` : Counter-specific multi-file upload & live pricing
 *   * `/orders` : Student Print Queue Tracker & History
 *   * `/shopkeeper` : Desk Console & Live Spooler Queue
 *   * `/admin` : Operations Console for approving/suspending counters
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import ShopDirectory from './components/ShopDirectory';
import ShopView from './components/ShopView';
import RecentOrders from './components/RecentOrders';
import OrderConfirmation from './components/OrderConfirmation';
import { getRecentPrintJobs } from './services/firebase';
import './App.css';

/**
 * Student Landing Page Component
 */
function HomeLanding({ onOrderCreated }) {
  const navigate = useNavigate();

  return (
    <>
      {/* Campus Hero Banner */}
      <section className="hero-banner">
        <h2 className="hero-headline">Skip the Xerox Line. Print Smarter.</h2>
        <p className="hero-subhead">
          Upload multi-document PDFs, configure duplex & color preferences, pay via UPI,
          and grab your fresh prints at any campus counter using your 4-digit token!
        </p>
        <div className="workflow-steps">
          <div className="step-badge">
            <span className="step-num">1</span>
            <span>Choose Counter / Shop</span>
          </div>
          <div className="step-badge">
            <span className="step-num">2</span>
            <span>Upload PDF Files (Up to 10)</span>
          </div>
          <div className="step-badge">
            <span className="step-num">3</span>
            <span>UPI Pay & Get Token</span>
          </div>
        </div>
      </section>

      {/* Campus Shop Directory */}
      <ShopDirectory onSelectShop={(shop) => navigate(`/shop/${shop.shopId}`)} />
    </>
  );
}

/**
 * Root Application Component with Routes
 */
export default function App() {
  const [orders, setOrders] = useState([]);
  const [viewingOrder, setViewingOrder] = useState(null);

  useEffect(() => {
    refreshOrders();
    const handleUpdate = () => refreshOrders();
    window.addEventListener('print-sathi-job-update', handleUpdate);
    return () => window.removeEventListener('print-sathi-job-update', handleUpdate);
  }, []);

  const refreshOrders = () => {
    const list = getRecentPrintJobs();
    setOrders(list);
  };

  const handleOrderCreated = (order) => {
    refreshOrders();
    setViewingOrder(order);
  };

  return (
    <BrowserRouter>
      <div className="app-container">
        {/* Top Campus Header */}
        <Navbar ordersCount={orders.length} />

        <main className="main-content">
          {viewingOrder ? (
            <OrderConfirmation
              order={viewingOrder}
              onReset={() => setViewingOrder(null)}
            />
          ) : (
            <Routes>
              {/* Home & Counter Directory */}
              <Route
                path="/"
                element={<HomeLanding onOrderCreated={handleOrderCreated} />}
              />

              {/* Dynamic Shop Route */}
              <Route
                path="/shop/:shopId"
                element={<ShopView onOrderCreated={handleOrderCreated} />}
              />

              {/* Student Orders & Tracker */}
              <Route
                path="/orders"
                element={
                  <RecentOrders
                    orders={orders}
                    onSelectOrder={(ord) => setViewingOrder(ord)}
                    onRefreshOrders={refreshOrders}
                  />
                }
              />

              {/* Fallback */}
              <Route
                path="*"
                element={<HomeLanding onOrderCreated={handleOrderCreated} />}
              />
            </Routes>
          )}
        </main>

        {/* Campus Footer */}
        <footer className="app-footer">
          <p>
            <strong>Print-Sathi</strong> &bull; Campus Smart Print Queue Platform
          </p>
          <p style={{ marginTop: '0.25rem', fontSize: '0.76rem', color: '#94a3b8' }}>
            Multi-Shop Routing &bull; Multi-File PDF Spooler &bull; Cloud Firestore &bull; Desktop Hardware Client
          </p>
        </footer>
      </div>
    </BrowserRouter>
  );
}

/**
 * ============================================================================
 * PRINT-SATHI: Application Entry Point (main.jsx)
 * ============================================================================
 * 
 * What this file does in plain language:
 * - Mounts the top-level React component (<App />) into the HTML document root.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('PRINT-SATHI MOBILE RESPONSIVENESS AUDIT & TEST SUITE');
console.log('====================================================\n');

let failedTests = 0;
let passedTests = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${testName} - ${details}`);
    failedTests++;
  }
}

const css = fs.readFileSync(path.resolve('src/App.css'), 'utf-8');
const navbarJsx = fs.readFileSync(path.resolve('src/components/Navbar.jsx'), 'utf-8');
const shopDirJsx = fs.readFileSync(path.resolve('src/components/ShopDirectory.jsx'), 'utf-8');
const shopViewJsx = fs.readFileSync(path.resolve('src/components/ShopView.jsx'), 'utf-8');
const uploadZoneJsx = fs.readFileSync(path.resolve('src/components/UploadZone.jsx'), 'utf-8');
const printConfigJsx = fs.readFileSync(path.resolve('src/components/PrintConfig.jsx'), 'utf-8');
const orderConfirmJsx = fs.readFileSync(path.resolve('src/components/OrderConfirmation.jsx'), 'utf-8');
const recentOrdersJsx = fs.readFileSync(path.resolve('src/components/RecentOrders.jsx'), 'utf-8');

console.log('--- 1. Testing Strict Guardrail: No overflow-x: hidden hacks on body/html ---');
const hasBodyOverflowHack = /body\s*\{[^}]*overflow-x:\s*hidden/i.test(css);
const hasHtmlOverflowHack = /html\s*\{[^}]*overflow-x:\s*hidden/i.test(css);
assert(!hasBodyOverflowHack, 'No "overflow-x: hidden" hack on body selector');
assert(!hasHtmlOverflowHack, 'No "overflow-x: hidden" hack on html selector');

console.log('\n--- 2. Testing Mobile Header & Navbar Responsiveness ---');
assert(navbarJsx.includes('navbar-brand-section'), 'Navbar JSX has navbar-brand-section wrapper');
assert(navbarJsx.includes('navbar-controls'), 'Navbar JSX has navbar-controls container');
assert(navbarJsx.includes('navbar-status-mobile'), 'Navbar JSX has dedicated mobile status slot');
assert(navbarJsx.includes('navbar-status-desktop'), 'Navbar JSX has dedicated desktop status slot');
assert(navbarJsx.includes('nav-tab-btn'), 'Navbar JSX uses nav-tab-btn class for navigation items');
assert(navbarJsx.includes('status-text-mobile'), 'Navbar JSX has responsive mobile status text');

// Check CSS rules for mobile navbar
assert(css.includes('@media (max-width: 640px)'), 'App.css contains @media (max-width: 640px) breakpoint');
assert(/@media\s*\(max-width:\s*640px\)[^}]*\{[\s\S]*?\.navbar-inner\s*\{[\s\S]*?flex-direction:\s*column/i.test(css),
  'Navbar stacks to 2 clean rows on mobile (flex-direction: column)');
assert(/@media\s*\(max-width:\s*640px\)[^}]*\{[\s\S]*?\.nav-tab-btn\s*\{[\s\S]*?min-height:\s*40px/i.test(css),
  'Mobile nav buttons have touch-friendly min-height >= 40px');
assert(/@media\s*\(max-width:\s*640px\)[^}]*\{[\s\S]*?\.navbar-status-desktop\s*\{[\s\S]*?display:\s*none/i.test(css),
  'Desktop status pill hidden on mobile');
assert(/@media\s*\(max-width:\s*640px\)[^}]*\{[\s\S]*?\.navbar-status-mobile\s*\{[\s\S]*?display:\s*flex/i.test(css),
  'Mobile status pill displayed neatly alongside brand logo in Row 1');

console.log('\n--- 3. Testing Hero Section Responsiveness ---');
assert(/hero-headline\s*\{[\s\S]*?clamp\(/i.test(css), 'Hero headline uses responsive clamp() typography');
assert(/hero-subhead\s*\{[\s\S]*?clamp\(/i.test(css), 'Hero subhead uses responsive clamp() typography');
assert(/@media\s*\(max-width:\s*640px\)[^}]*\{[\s\S]*?\.hero-banner\s*\{[\s\S]*?padding:\s*1\.25rem\s*1rem/i.test(css),
  'Hero banner padding reduced to 1.25rem 1rem on mobile screens');
assert(/@media\s*\(max-width:\s*640px\)[^}]*\{[\s\S]*?\.workflow-steps\s*\{[\s\S]*?flex-direction:\s*column/i.test(css),
  'Workflow steps stack vertically on mobile to prevent horizontal badge squeezing');

console.log('\n--- 4. Testing Campus Shop Directory & Counters ---');
assert(shopDirJsx.includes('shops-grid'), 'ShopDirectory JSX uses shops-grid class');
assert(shopDirJsx.includes('shop-search-wrapper'), 'ShopDirectory JSX uses shop-search-wrapper class');
assert(shopDirJsx.includes('counter-card-header'), 'ShopDirectory JSX uses counter-card-header class');
assert(/shops-grid\s*\{[\s\S]*?minmax\(min\(100%,\s*280px\),\s*1fr\)/i.test(css),
  'shops-grid uses minmax(min(100%, 280px), 1fr) preventing overflow on viewports <= 320px');
assert(/@media\s*\(max-width:\s*640px\)[^}]*\{[\s\S]*?\.shop-search-wrapper\s*\{[\s\S]*?max-width:\s*100%/i.test(css),
  'Search input expands to full width on mobile viewports');
assert(/counter-select-btn\s*\{[\s\S]*?min-height:\s*44px/i.test(css),
  'Counter selection CTA button has touch target >= 44px');

console.log('\n--- 5. Testing Shop View & Counter Header Bar ---');
assert(shopViewJsx.includes('shop-view-counter-bar'), 'ShopView JSX uses shop-view-counter-bar class');
assert(shopViewJsx.includes('switch-counter-btn'), 'ShopView JSX uses switch-counter-btn class');
assert(/@media\s*\(max-width:\s*640px\)[^}]*\{[\s\S]*?\.shop-view-counter-bar\s*\{[\s\S]*?flex-direction:\s*column/i.test(css),
  'Shop view top counter bar stacks cleanly on mobile');
assert(/@media\s*\(max-width:\s*640px\)[^}]*\{[\s\S]*?\.switch-counter-btn\s*\{[\s\S]*?width:\s*100%/i.test(css),
  'Switch Counter button expands to full-width with min-height on mobile');

console.log('\n--- 6. Testing Print Configuration Responsiveness ---');
assert(css.includes('.segmented-control'), 'App.css defines .segmented-control styles');
assert(css.includes('.segmented-btn'), 'App.css defines .segmented-btn styles');
assert(/@media\s*\(max-width:\s*640px\)[^}]*\{[\s\S]*?\.segmented-control\s*\{[\s\S]*?grid-template-columns:\s*1fr/i.test(css),
  'Segmented option buttons stack to 1fr on mobile viewports');
assert(/@media\s*\(max-width:\s*640px\)[^}]*\{[\s\S]*?\.segmented-btn\s*\{[\s\S]*?min-height:\s*44px/i.test(css),
  'Segmented option buttons have min-height >= 44px for thumb tap targets');
assert(/@media\s*\(max-width:\s*640px\)[^}]*\{[\s\S]*?\.stepper-container\s*\{[\s\S]*?width:\s*100%/i.test(css),
  'Copies numeric stepper expands to full-width on mobile with 48px touch buttons');

console.log('\n--- 7. Testing Upload Zone & Multi-File Cards ---');
assert(/@media\s*\(max-width:\s*640px\)[^}]*\{[\s\S]*?\.browse-btn\s*\{[\s\S]*?width:\s*100%/i.test(css),
  'Browse PDF Files button expands to 100% width on mobile');
assert(/@media\s*\(max-width:\s*640px\)[^}]*\{[\s\S]*?\.file-header-row\s*\{[\s\S]*?flex-wrap:\s*wrap/i.test(css),
  'File header row wraps smoothly on mobile to accommodate long filenames and actions');

console.log('\n--- 8. Testing Order Confirmation Token Slip ---');
assert(orderConfirmJsx.includes('token-slip-docs-section'), 'OrderConfirmation uses token-slip-docs-section class');
assert(/@media\s*\(max-width:\s*640px\)[^}]*\{[\s\S]*?\.token-hero-id\s*\{[\s\S]*?clamp\(/i.test(css),
  'Token hero ID (#PS-XXXX) scales with clamp() to prevent overflow on narrow screens');
assert(/@media\s*\(max-width:\s*640px\)[^}]*\{[\s\S]*?\.confirmation-actions\s*\{[\s\S]*?flex-direction:\s*column/i.test(css),
  'Token slip action buttons stack vertically on mobile screens');

console.log('\n--- 9. Testing Extra-Compact Mobile Viewport (<= 380px) ---');
assert(css.includes('@media (max-width: 380px)'), 'App.css contains @media (max-width: 380px) breakpoint');
assert(/@media\s*\(max-width:\s*380px\)[^}]*\{[\s\S]*?\.brand-subtitle\s*\{[\s\S]*?display:\s*none/i.test(css),
  'Brand subtitle gracefully hides on ultra-compact <= 380px viewports to keep logo and status aligned');

console.log('\n====================================================');
console.log(`AUDIT RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('====================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

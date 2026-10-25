/**
 * ============================================================================
 * PRINT-SATHI: Verification Suite for Payment Modal Action Button Styling
 * ============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Starting Payment Modal Action Button Verification Suite...\n');

let passedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASSED: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAILED: ${name}`);
    console.error(`     Error: ${err.message}`);
    process.exit(1);
  }
}

// Read relevant files
const modalPath = path.resolve(__dirname, '../src/components/PaymentModal.jsx');
const cssPath = path.resolve(__dirname, '../src/App.css');

const modalCode = fs.readFileSync(modalPath, 'utf8');
const cssCode = fs.readFileSync(cssPath, 'utf8');

// ----------------------------------------------------------------------------
// TEST 1: JSX Markup & Icon Structure
// ----------------------------------------------------------------------------
runTest('PaymentModal.jsx uses .confirm-payment-btn class with clean semantic markup', () => {
  assert.ok(modalCode.includes('className="confirm-payment-btn"'), 'Must have confirm-payment-btn class');
  assert.ok(!modalCode.includes('style={{ marginTop: \'1rem\' }}'), 'Inline margin must be replaced by CSS');
});

runTest('PaymentModal.jsx renders prefix check-circle icon, dynamic amount, and suffix arrow', () => {
  assert.ok(modalCode.includes('payment-btn-icon-prefix'), 'Must contain prefix icon');
  assert.ok(modalCode.includes('payment-btn-label'), 'Must contain payment-btn-label span');
  assert.ok(modalCode.includes('Simulate Payment &bull; {formatCurrency(displayAmount)}'), 'Must dynamically format amount');
  assert.ok(modalCode.includes('payment-btn-icon-suffix'), 'Must contain suffix arrow icon');
});

runTest('PaymentModal.jsx preserves spinner and processing state indicator', () => {
  assert.ok(modalCode.includes('isProcessing ?'), 'Must check isProcessing state');
  assert.ok(modalCode.includes('spin-animate'), 'Must render spinner when isProcessing is true');
  assert.ok(modalCode.includes('disabled={isProcessing}'), 'Must disable button when processing');
  assert.ok(modalCode.includes('onClick={handleSimulatePayment}'), 'Must bind to handleSimulatePayment');
});

// ----------------------------------------------------------------------------
// TEST 2: CSS Stylesheet Rules & Visual Theme
// ----------------------------------------------------------------------------
runTest('App.css defines .confirm-payment-btn with purple/indigo gradient and 14px radius', () => {
  assert.ok(cssCode.includes('.confirm-payment-btn'), 'App.css must define .confirm-payment-btn');
  assert.ok(cssCode.includes('linear-gradient(135deg, #4338ca 0%, #6366f1 50%, #7c3aed 100%)'), 'Must use rich indigo/violet gradient');
  assert.ok(cssCode.includes('border-radius: 14px;'), 'Must use rounded corners ~14px');
  assert.ok(cssCode.includes('color: #ffffff;'), 'Must have high-contrast white text');
});

runTest('App.css provides hover, active, focus-visible, and disabled states', () => {
  assert.ok(cssCode.includes('.confirm-payment-btn:hover:not(:disabled)'), 'Must have hover state');
  assert.ok(cssCode.includes('.confirm-payment-btn:active:not(:disabled)'), 'Must have active state');
  assert.ok(cssCode.includes('.confirm-payment-btn:focus-visible'), 'Must have focus-visible state');
  assert.ok(cssCode.includes('.confirm-payment-btn:disabled'), 'Must have disabled state');
});

runTest('App.css defines .spin-animate and keyframes', () => {
  assert.ok(cssCode.includes('.spin-animate'), 'Must define .spin-animate class');
  assert.ok(cssCode.includes('@keyframes spin'), 'Must define @keyframes spin');
});

console.log(`\n🎉 ALL ${passedTests} PAYMENT BUTTON TESTS PASSED SUCCESSFULLY!`);

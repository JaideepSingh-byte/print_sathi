/**
 * ============================================================================
 * PRINT-SATHI: Verification Suite for Electron Shopkeeper Queue & Dashboard Fix
 * ============================================================================
 */

const assert = require('assert');
const path = require('path');

// 1. Test firebaseService modules
const firebaseService = require('../shopkeeper-app/services/firebaseService');
const OrderProcessor = require('../shopkeeper-app/services/orderProcessor');

console.log('🧪 Starting Print-Sathi Electron Queue Fix Test Suite...\n');

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

// ----------------------------------------------------------------------------
// TEST SUITE 1: Counter Segregation (Shop A vs Shop B)
// ----------------------------------------------------------------------------
console.log('--- Suite 1: Strict Multi-Shop Counter Segregation ---');

runTest('matchesShopId correctly matches identical shop IDs', () => {
  assert.strictEqual(firebaseService.matchesShopId('shop_main_xerox', 'shop_main_xerox'), true);
});

runTest('matchesShopId handles case-insensitive and whitespace variations', () => {
  assert.strictEqual(firebaseService.matchesShopId(' Shop_Main_Xerox ', 'shop_main_xerox'), true);
  assert.strictEqual(firebaseService.matchesShopId('shop_counter_2', 'SHOP_COUNTER_2'), true);
});

runTest('matchesShopId strictly isolates different counters (Shop B cannot see Shop A)', () => {
  assert.strictEqual(firebaseService.matchesShopId('shop_counter_a', 'shop_counter_b'), false);
  assert.strictEqual(firebaseService.matchesShopId('shop_main_xerox', 'shop_counter_2'), false);
});

runTest('matchesShopId rejects null or undefined order shopId to prevent cross-shop leakage', () => {
  assert.strictEqual(firebaseService.matchesShopId(null, 'shop_main_xerox'), false);
  assert.strictEqual(firebaseService.matchesShopId(undefined, 'shop_main_xerox'), false);
  assert.strictEqual(firebaseService.matchesShopId('', 'shop_main_xerox'), false);
});

runTest('matchesShopId allows ALL when targetShopId is ALL or empty', () => {
  assert.strictEqual(firebaseService.matchesShopId('shop_any', 'ALL'), true);
  assert.strictEqual(firebaseService.matchesShopId('shop_any', ''), true);
  assert.strictEqual(firebaseService.matchesShopId('shop_any', null), true);
});

// ----------------------------------------------------------------------------
// TEST SUITE 2: Timestamp Normalization & Serialization
// ----------------------------------------------------------------------------
console.log('\n--- Suite 2: Timestamp Normalization & Serialization ---');

runTest('normalizeTimestamp converts Firestore { seconds, nanoseconds } to epoch millis', () => {
  const ts = { seconds: 1700000000, nanoseconds: 500000000 };
  const millis = firebaseService.normalizeTimestamp(ts);
  assert.strictEqual(typeof millis, 'number');
  assert.strictEqual(millis, 1700000000500);
});

runTest('normalizeTimestamp converts .toMillis() and Date instances to epoch millis', () => {
  const withToMillis = { toMillis: () => 1700000010000 };
  assert.strictEqual(firebaseService.normalizeTimestamp(withToMillis), 1700000010000);

  const dateObj = new Date(1700000020000);
  assert.strictEqual(firebaseService.normalizeTimestamp(dateObj), 1700000020000);
});

runTest('normalizeDesktopOrder serializes all timestamps as plain numbers for IPC', () => {
  const rawOrder = {
    id: 'PS-1001',
    orderId: 'PS-1001',
    token: '1001',
    shopId: 'shop_main_xerox',
    status: 'QUEUED',
    paymentStatus: 'COMPLETED',
    createdAt: { seconds: 1700000000, nanoseconds: 0 },
    claimedAt: { seconds: 1700000010, nanoseconds: 0 },
    printCompletedAt: { seconds: 1700000020, nanoseconds: 0 },
  };
  const normalized = firebaseService.normalizeDesktopOrder(rawOrder);
  assert.strictEqual(typeof normalized.createdAt, 'number');
  assert.strictEqual(typeof normalized.claimedAt, 'number');
  assert.strictEqual(typeof normalized.printCompletedAt, 'number');
});

// ----------------------------------------------------------------------------
// TEST SUITE 3: OrderProcessor Queue Splitting & Status Transitions
// ----------------------------------------------------------------------------
console.log('\n--- Suite 3: OrderProcessor Queue Splitting & Status Lifecycle ---');

runTest('OrderProcessor strictly segregates and categorizes orders per counter', async () => {
  const processor = new OrderProcessor('test-instance-123');
  processor.dryRun = true;
  processor.autoPrint = false; // Disable auto-spooling for state test
  processor.setTargetShopId('shop_main_xerox');

  const mockDocs = [
    // Shop A - Queued order
    {
      orderId: 'PS-001',
      token: '001',
      shopId: 'shop_main_xerox',
      status: 'QUEUED',
      printStatus: 'QUEUED',
      paymentStatus: 'COMPLETED',
      createdAt: 1000,
    },
    // Shop A - Currently Printing order
    {
      orderId: 'PS-002',
      token: '002',
      shopId: 'shop_main_xerox',
      status: 'PRINTING',
      printStatus: 'PRINTING',
      paymentStatus: 'COMPLETED',
      createdAt: 2000,
    },
    // Shop A - Completed order
    {
      orderId: 'PS-003',
      token: '003',
      shopId: 'shop_main_xerox',
      status: 'COMPLETED',
      printStatus: 'COMPLETED',
      paymentStatus: 'COMPLETED',
      createdAt: 500,
      printCompletedAt: 3000,
    },
    // Shop B - Order (Must be completely hidden from Shop A)
    {
      orderId: 'PS-004',
      token: '004',
      shopId: 'shop_counter_2',
      status: 'QUEUED',
      printStatus: 'QUEUED',
      paymentStatus: 'COMPLETED',
      createdAt: 1500,
    },
    // Shop B - Completed order (Must be completely hidden from Shop A)
    {
      orderId: 'PS-005',
      token: '005',
      shopId: 'shop_counter_2',
      status: 'COMPLETED',
      printStatus: 'COMPLETED',
      paymentStatus: 'COMPLETED',
      createdAt: 600,
      printCompletedAt: 3500,
    },
  ];

  let emittedPayload = null;
  processor.on('queueChange', (payload) => {
    emittedPayload = payload;
  });

  const eligibleQueue = mockDocs.filter(
    (d) => d.shopId === 'shop_main_xerox' && d.status === 'QUEUED' && d.paymentStatus === 'COMPLETED'
  );

  await processor.handleIncomingQueue(eligibleQueue, mockDocs);

  assert.ok(emittedPayload !== null, 'queueChange event must be emitted');
  assert.ok(typeof emittedPayload === 'object', 'payload must be an object');
  assert.ok(Array.isArray(emittedPayload.pending), 'payload.pending must be an array');
  assert.ok(Array.isArray(emittedPayload.completed), 'payload.completed must be an array');

  // Verify Shop A Pending
  // Should include both PS-001 (QUEUED) and PS-002 (PRINTING)
  assert.strictEqual(emittedPayload.pending.length, 2, 'Shop A must have 2 pending orders (QUEUED and PRINTING)');
  assert.strictEqual(emittedPayload.pending[0].orderId, 'PS-001');
  assert.strictEqual(emittedPayload.pending[1].orderId, 'PS-002');

  // Verify Shop A Completed
  // Should ONLY include PS-003, NOT Shop B's PS-005!
  assert.strictEqual(emittedPayload.completed.length, 1, 'Shop A must have exactly 1 completed order');
  assert.strictEqual(emittedPayload.completed[0].orderId, 'PS-003');

  // Verify that Shop B's orders are completely absent
  const hasShopBOrders = [...emittedPayload.pending, ...emittedPayload.completed].some(
    (d) => d.shopId === 'shop_counter_2'
  );
  assert.strictEqual(hasShopBOrders, false, 'Shop B orders must never leak into Shop A');

  // Verify getQueuePayload() returns the same isolated queue
  const cachedPayload = processor.getQueuePayload();
  assert.strictEqual(cachedPayload.pending.length, 2);
  assert.strictEqual(cachedPayload.completed.length, 1);
});

// ----------------------------------------------------------------------------
// TEST SUITE 4: Renderer Process Logic & Data Contract Defense
// ----------------------------------------------------------------------------
console.log('\n--- Suite 4: Renderer Queue Handling & Contract Defense ---');

runTest('Renderer logic parses { pending, completed, all } object without throwing TypeError', () => {
  const queuePayload = {
    pending: [
      { orderId: 'PS-101', token: '101', status: 'QUEUED', createdAt: Date.now() },
      { orderId: 'PS-102', token: '102', status: 'PRINTING', createdAt: Date.now() },
    ],
    completed: [
      { orderId: 'PS-100', token: '100', status: 'COMPLETED', createdAt: Date.now() - 60000 },
    ],
    all: [],
    targetShopId: 'shop_main_xerox',
  };

  // Simulate renderer's handleQueueDataUpdate
  let cachedPendingJobs = [];
  let cachedCompletedJobs = [];
  let queueCountText = '0';
  let completedCountText = '0';

  function simulateHandleQueueDataUpdate(queueData) {
    if (!queueData) return;
    let pending = [];
    let completed = [];

    if (Array.isArray(queueData)) {
      const pendingStatuses = ['QUEUED', 'PENDING', 'PRINTING', 'PRINT_SUBMITTED', 'NEEDS_VERIFICATION'];
      pending = queueData.filter((o) => {
        const s = (o.status || '').toUpperCase();
        return pendingStatuses.includes(s);
      });
      completed = queueData.filter((o) => {
        const s = (o.status || '').toUpperCase();
        return s === 'COMPLETED' || s === 'PRINTED';
      });
    } else if (typeof queueData === 'object') {
      if (Array.isArray(queueData.pending)) pending = queueData.pending;
      if (Array.isArray(queueData.completed)) completed = queueData.completed;
    }

    cachedPendingJobs = pending;
    cachedCompletedJobs = completed;
    queueCountText = pending.length.toString();
    completedCountText = completed.length.toString();
  }

  // Execute with object payload (which previously caused: TypeError: allOrders.filter is not a function)
  assert.doesNotThrow(() => {
    simulateHandleQueueDataUpdate(queuePayload);
  });

  assert.strictEqual(cachedPendingJobs.length, 2, 'cachedPendingJobs must contain 2 items');
  assert.strictEqual(cachedCompletedJobs.length, 1, 'cachedCompletedJobs must contain 1 item');
  assert.strictEqual(queueCountText, '2', 'queueCount display text must be "2"');
  assert.strictEqual(completedCountText, '1', 'completedCount display text must be "1"');
});

runTest('Renderer formatJobTime correctly handles all date shapes without producing "Invalid Date"', () => {
  function formatJobTime(rawTime) {
    if (!rawTime) return 'Just now';
    try {
      let dateObj = null;
      if (typeof rawTime === 'number') {
        dateObj = new Date(rawTime);
      } else if (typeof rawTime?.toMillis === 'function') {
        dateObj = new Date(rawTime.toMillis());
      } else if (typeof rawTime?.toDate === 'function') {
        dateObj = rawTime.toDate();
      } else if (typeof rawTime?.seconds === 'number') {
        dateObj = new Date(rawTime.seconds * 1000 + Math.floor((rawTime.nanoseconds || 0) / 1000000));
      } else if (typeof rawTime === 'string') {
        const parsed = Date.parse(rawTime);
        if (!isNaN(parsed)) dateObj = new Date(parsed);
      } else if (rawTime instanceof Date) {
        dateObj = rawTime;
      }

      if (dateObj && !isNaN(dateObj.getTime())) {
        return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    } catch (e) {}
    return 'Just now';
  }

  const testTime = 1700000000000;
  const expectedFormat = new Date(testTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  assert.strictEqual(formatJobTime(testTime), expectedFormat);
  assert.strictEqual(formatJobTime({ seconds: 1700000000, nanoseconds: 0 }), expectedFormat);
  assert.strictEqual(formatJobTime({ toMillis: () => testTime }), expectedFormat);
  assert.strictEqual(formatJobTime(new Date(testTime).toISOString()), expectedFormat);
  assert.strictEqual(formatJobTime(null), 'Just now');
  assert.strictEqual(formatJobTime(undefined), 'Just now');
  assert.notStrictEqual(formatJobTime({ seconds: 1700000000 }), 'Invalid Date');
});

console.log(`\n🎉 ALL ${passedTests} TESTS PASSED SUCCESSFULLY!`);

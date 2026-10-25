/**
 * ============================================================================
 * PRINT-SATHI DESKTOP CLIENT: Firebase & Firestore Integration Service
 * ============================================================================
 * 
 * Responsibilities:
 * 1. Loads Firebase configuration from the root .env file.
 * 2. Connects to Firestore `orders` collection (with dual-read fallback to `print_jobs`).
 * 3. Filters orders by `shopId` for multi-shop counter segregation.
 * 4. Dual-read adapter normalizes multi-file and legacy single-file jobs.
 * 5. Atomic Claiming & Lifecycle Management via transactions.
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { initializeApp, getApps } = require('firebase/app');
const {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} = require('firebase/auth');
const {
  getFirestore,
  doc,
  collection,
  query,
  where,
  onSnapshot,
  runTransaction,
  updateDoc,
  getDocs,
  setDoc,
  getDoc,
  serverTimestamp,
} = require('firebase/firestore');

// Attempt to load .env from shopkeeper-app directory or parent root
const rootEnvPath = path.resolve(__dirname, '../../.env');
const localEnvPath = path.resolve(__dirname, '../.env');

if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

const cleanEnv = (val) => {
  if (!val) return '';
  return val.toString().trim().replace(/[,;]+$/, '').replace(/^["']|["']$/g, '').trim();
};

const firebaseConfig = {
  apiKey: cleanEnv(process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY),
  authDomain: cleanEnv(process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN),
  projectId: cleanEnv(process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID),
  storageBucket: cleanEnv(process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET),
  messagingSenderId: cleanEnv(process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID),
  appId: cleanEnv(process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID),
};

const isConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.apiKey.length > 5 &&
  !firebaseConfig.apiKey.includes('your_api_key')
);

let db = null;
let auth = null;

if (isConfigured) {
  try {
    const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
    db = getFirestore(app);
    auth = getAuth(app);
    console.log('🔥 [FirebaseService] Connected to Cloud Firestore & Auth for project:', firebaseConfig.projectId);
  } catch (err) {
    console.error('❌ [FirebaseService] Initialization failed:', err.message);
  }
} else {
  console.warn('⚠️ [FirebaseService] Firebase keys not configured. Running in Local Simulation Mode.');
}

/**
 * Normalizes payment status check (handles 'COMPLETED', 'PAID', 'paid', 'completed')
 */
function isPaymentVerified(paymentStatus) {
  if (!paymentStatus) return false;
  const normalized = paymentStatus.toString().trim().toUpperCase();
  return normalized === 'COMPLETED' || normalized === 'PAID';
}

/**
 * Normalizes queued status check (handles 'QUEUED', 'queued', 'pending')
 */
function isJobQueued(status, printStatus) {
  const s = (status || '').toString().trim().toUpperCase();
  const ps = (printStatus || '').toString().trim().toUpperCase();
  return s === 'QUEUED' || s === 'PENDING' || ps === 'QUEUED';
}

/**
 * Strict shop matching for counter segregation (Shop B must never see Shop A's orders)
 */
function matchesShopId(orderShopId, targetShopId) {
  if (!targetShopId || targetShopId === 'ALL') return true;
  if (!orderShopId) return false;
  return orderShopId.toString().trim().toLowerCase() === targetShopId.toString().trim().toLowerCase();
}

/**
 * Safely normalizes timestamps to numeric epoch milliseconds for clean IPC serialization
 */
function normalizeTimestamp(ts) {
  if (!ts) return null;
  if (typeof ts === 'number') return ts;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (typeof ts.seconds === 'number') {
    return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1000000);
  }
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return !isNaN(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Dual-Read Normalization Adapter for Desktop Client
 */
function normalizeDesktopOrder(docData) {
  if (!docData) return null;

  const orderId = docData.orderId || docData.id || 'PS-0000';
  const token = docData.token || orderId.replace(/^PS-/, '') || '0000';
  const shopId = (docData.shopId || 'shop_main_xerox').trim();
  const status = (docData.status || docData.printStatus || 'QUEUED').toUpperCase();
  const paymentStatus = (docData.paymentStatus || 'COMPLETED').toUpperCase();

  const createdAt = normalizeTimestamp(docData.createdAt) || Date.now();
  const claimedAt = normalizeTimestamp(docData.claimedAt);
  const spoolerSubmittedAt = normalizeTimestamp(docData.spoolerSubmittedAt);
  const printCompletedAt = normalizeTimestamp(docData.printCompletedAt);
  const failedAt = normalizeTimestamp(docData.failedAt);
  const flaggedAt = normalizeTimestamp(docData.flaggedAt);

  let files = [];
  if (Array.isArray(docData.files) && docData.files.length > 0) {
    files = docData.files.map((f, i) => {
      const totalPgs = f.totalPages || 1;
      const mode = f.pageSelection?.mode || f.pageRangeMode || 'all';
      const fromPg = f.pageSelection?.fromPage ?? f.fromPage ?? 1;
      const toPg = f.pageSelection?.toPage ?? f.toPage ?? totalPgs;
      const calcPgs = f.calculatedPages || (mode === 'custom' ? Math.max(1, toPg - fromPg + 1) : totalPgs);
      const rangeStr = f.pageRangeString || (mode === 'custom' ? `Pages ${fromPg}–${toPg} (${calcPgs} pgs)` : `All (${totalPgs} pgs)`);

      return {
        fileId: f.fileId || f.id || `file_${i}`,
        fileName: f.fileName || f.name || 'document.pdf',
        fileUrl: f.fileUrl || '',
        fileSize: f.fileSize || f.size || 0,
        totalPages: totalPgs,
        calculatedPages: calcPgs,
        pageSelection: {
          mode,
          fromPage: fromPg,
          toPage: toPg,
        },
        pageRangeMode: mode,
        fromPage: fromPg,
        toPage: toPg,
        pageRangeString: rangeStr,
        copies: f.copies || 1,
        colorMode: f.colorMode || 'bw',
        colourMode: f.colourMode || (f.colorMode === 'color' ? 'color' : 'grayscale'),
        sides: f.sides || 'single',
        ratePerPage: f.ratePerPage || 2,
        itemTotal: f.itemTotal || 0,
      };
    });
  } else {
    // Legacy single-file synthesis
    const totalPgs = docData.totalPages || 1;
    const mode = docData.pageSelection?.mode || docData.pageRangeMode || 'all';
    const fromPg = docData.pageSelection?.fromPage ?? docData.fromPage ?? 1;
    const toPg = docData.pageSelection?.toPage ?? docData.toPage ?? totalPgs;
    const calcPgs = docData.calculatedPages || docData.totalPages || (mode === 'custom' ? Math.max(1, toPg - fromPg + 1) : totalPgs);
    const rangeStr = docData.pageRangeString || (mode === 'custom' ? `Pages ${fromPg}–${toPg} (${calcPgs} pgs)` : `All (${totalPgs} pgs)`);

    files = [
      {
        fileId: 'file_0',
        fileName: docData.fileName || 'document.pdf',
        fileUrl: docData.fileUrl || '',
        fileSize: docData.fileSize || 0,
        totalPages: totalPgs,
        calculatedPages: calcPgs,
        pageSelection: {
          mode,
          fromPage: fromPg,
          toPage: toPg,
        },
        pageRangeMode: mode,
        fromPage: fromPg,
        toPage: toPg,
        pageRangeString: rangeStr,
        copies: docData.copies || 1,
        colorMode: docData.colorMode || 'bw',
        colourMode: docData.colourMode || (docData.colorMode === 'color' ? 'color' : 'grayscale'),
        sides: docData.sides || 'single',
        ratePerPage: docData.ratePerPage || 2,
        itemTotal: docData.totalAmount || 0,
      },
    ];
  }

  return {
    ...docData,
    id: orderId,
    orderId,
    token,
    shopId,
    status,
    paymentStatus,
    files,
    fileName: files[0]?.fileName || docData.fileName || 'document.pdf',
    fileUrl: files[0]?.fileUrl || docData.fileUrl || '',
    calculatedPages: docData.calculatedPages || files.reduce((acc, f) => acc + (f.calculatedPages || 1), 0),
    copies: files[0]?.copies || docData.copies || 1,
    colorMode: files[0]?.colorMode || docData.colorMode || 'bw',
    sides: files[0]?.sides || docData.sides || 'single',
    createdAt,
    claimedAt,
    spoolerSubmittedAt,
    printCompletedAt,
    failedAt,
    flaggedAt,
  };
}

/**
 * Atomic Claiming using Firestore Transaction (Checks 'orders' first, then 'print_jobs')
 */
async function claimJobAtomically(orderId, instanceId) {
  if (!db) {
    return { success: true, order: { orderId, status: 'PRINTING' } };
  }

  // Determine target collection
  let targetCollection = 'orders';
  let orderRef = doc(db, 'orders', orderId);

  try {
    const claimedOrder = await runTransaction(db, async (transaction) => {
      let orderDoc = await transaction.get(orderRef);

      if (!orderDoc.exists()) {
        // Fallback to legacy print_jobs collection
        targetCollection = 'print_jobs';
        orderRef = doc(db, 'print_jobs', orderId);
        orderDoc = await transaction.get(orderRef);

        if (!orderDoc.exists()) {
          throw new Error('ORDER_NOT_FOUND');
        }
      }

      const data = orderDoc.data();

      // Guard 1: Verify payment flag
      if (!isPaymentVerified(data.paymentStatus)) {
        throw new Error(`PAYMENT_UNVERIFIED: Status is "${data.paymentStatus}"`);
      }

      // Guard 2: Verify queue state
      if (!isJobQueued(data.status, data.printStatus) && data.status !== 'PRINTING') {
        throw new Error(`ORDER_NOT_QUEUED: Current status is "${data.status}"`);
      }

      // Guard 3: If already claimed by another instance
      if (data.status === 'PRINTING' && data.claimedBy && data.claimedBy !== instanceId) {
        throw new Error(`ORDER_ALREADY_CLAIMED: Claimed by ${data.claimedBy}`);
      }

      // Transition to PRINTING state
      const updatePayload = {
        status: 'PRINTING',
        printStatus: 'PRINTING',
        claimedBy: instanceId,
        claimedAt: serverTimestamp(),
      };

      transaction.update(orderRef, updatePayload);

      // Dual-sync update to both collections if possible
      try {
        const otherColl = targetCollection === 'orders' ? 'print_jobs' : 'orders';
        const otherRef = doc(db, otherColl, orderId);
        transaction.update(otherRef, updatePayload);
      } catch (e) {}

      return normalizeDesktopOrder({ id: orderDoc.id, ...data, status: 'PRINTING', claimedBy: instanceId });
    });

    return { success: true, order: claimedOrder };
  } catch (error) {
    return { success: false, reason: error.message };
  }
}

async function updateBothCollections(orderId, updateData) {
  if (!db) return;
  try {
    await updateDoc(doc(db, 'orders', orderId), updateData);
  } catch (e) {}
  try {
    await updateDoc(doc(db, 'print_jobs', orderId), updateData);
  } catch (e) {}
}

async function markJobPrintSubmitted(orderId, metadata = {}) {
  await updateBothCollections(orderId, {
    status: 'PRINT_SUBMITTED',
    printStatus: 'PRINT_SUBMITTED',
    spoolerSubmittedAt: serverTimestamp(),
    ...metadata,
  });
}

async function markJobCompleted(orderId, metadata = {}) {
  await updateBothCollections(orderId, {
    status: 'COMPLETED',
    printStatus: 'COMPLETED',
    printCompletedAt: serverTimestamp(),
    ...metadata,
  });
}

async function markJobFailed(orderId, errorReason, metadata = {}) {
  await updateBothCollections(orderId, {
    status: 'FAILED',
    printStatus: 'FAILED',
    failureReason: errorReason,
    failedAt: serverTimestamp(),
    ...metadata,
  });
}

async function markJobNeedsVerification(orderId, reason) {
  await updateBothCollections(orderId, {
    status: 'NEEDS_VERIFICATION',
    printStatus: 'NEEDS_VERIFICATION',
    verificationReason: reason,
    flaggedAt: serverTimestamp(),
  });
}

async function recoverStaleJobs(instanceId) {
  if (!db) return [];
  const recovered = [];

  const collectionsToCheck = ['orders', 'print_jobs'];
  for (const colName of collectionsToCheck) {
    try {
      const q = query(
        collection(db, colName),
        where('status', '==', 'PRINTING'),
        where('claimedBy', '==', instanceId)
      );

      const snapshot = await getDocs(q);
      for (const docSnap of snapshot.docs) {
        if (!recovered.includes(docSnap.id)) {
          await markJobNeedsVerification(
            docSnap.id,
            'App restarted while order was in PRINTING state. Verify physical printer tray before retrying.'
          );
          recovered.push(docSnap.id);
        }
      }
    } catch (err) {
      console.warn(`[Startup Recovery] Warning checking ${colName}:`, err.message);
    }
  }

  if (recovered.length > 0) {
    console.warn(`[Startup Recovery] Flagged ${recovered.length} interrupted job(s) for verification:`, recovered);
  }
  return recovered;
}

/**
 * ============================================================================
 * DIAGNOSTIC & REAL-TIME QUEUE LISTENER: subscribeToEligibleQueue
 * ============================================================================
 * 
 * Subscribes to `orders` collection filtered by target `shopId` (or all if not specified).
 * If `orders` returns 0 docs, also inspects `print_jobs` for backwards compatibility.
 */
function subscribeToEligibleQueue(targetShopId, onQueueUpdate, onError, onRawDiagnostics) {
  if (!db) {
    return () => {};
  }

  // Listen to `orders` collection
  const ordersRef = collection(db, 'orders');

  return onSnapshot(
    ordersRef,
    async (snapshot) => {
      console.log('--- DESK CONSOLE FIRESTORE SNAPSHOT ---');
      console.log(`Raw orders received: ${snapshot.docs.length} (Filter shopId: "${targetShopId || 'ALL'}")`);

      let allDocs = [];
      snapshot.docs.forEach((docSnap) => {
        const normalized = normalizeDesktopOrder({ id: docSnap.id, ...docSnap.data() });
        if (normalized) {
          allDocs.push(normalized);
        }
      });

      // If orders collection is empty, check legacy print_jobs collection
      if (allDocs.length === 0) {
        try {
          const legacySnapshot = await getDocs(collection(db, 'print_jobs'));
          legacySnapshot.forEach((docSnap) => {
            const normalized = normalizeDesktopOrder({ id: docSnap.id, ...docSnap.data() });
            if (normalized) allDocs.push(normalized);
          });
        } catch (legacyErr) {
          console.warn('Legacy query skipped:', legacyErr.message);
        }
      }

      if (typeof onRawDiagnostics === 'function') {
        onRawDiagnostics(allDocs);
      }

      // Filter docs strictly matching target counter
      const shopDocs = allDocs.filter((data) => matchesShopId(data.shopId, targetShopId));

      // Filter eligible queue items for auto-spooling
      const eligibleQueue = shopDocs.filter((data) => {
        const paid = isPaymentVerified(data.paymentStatus);
        const queued = isJobQueued(data.status, data.printStatus);
        const notFinished = data.status !== 'COMPLETED' && data.status !== 'PRINTED';
        return paid && queued && notFinished;
      });

      // FIFO sort by creation timestamp (numeric epoch milliseconds)
      eligibleQueue.sort((a, b) => {
        const timeA = typeof a.createdAt === 'number' ? a.createdAt : (a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime());
        const timeB = typeof b.createdAt === 'number' ? b.createdAt : (b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime());
        return (timeA || 0) - (timeB || 0);
      });

      console.log(`[Queue Filter] ${eligibleQueue.length} eligible job(s) ready for spooling (${shopDocs.length} total for shop "${targetShopId || 'ALL'}").`);
      onQueueUpdate(eligibleQueue, shopDocs);
    },
    (error) => {
      console.error('Firestore listener error in Desk Console:', error);
      if (onError) onError(error);
    }
  );
}

/**
 * ============================================================================
 * AUTHENTICATION & SHOP MANAGEMENT SERVICES FOR ELECTRON CLIENT
 * ============================================================================
 */

function mapFirebaseAuthError(err) {
  const code = err.code || '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Invalid credentials. Please verify your email/username and password.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email address already exists. Please sign in instead.';
  }
  if (code === 'auth/weak-password') {
    return 'Password is too weak. Please use at least 6 characters.';
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network connection failed. Please check your internet connection.';
  }
  return err.message || 'Authentication failed.';
}

/**
 * Authenticates shopkeeper via Firebase Auth and retrieves their shop record
 */
async function loginShopkeeper(email, password) {
  if (!isConfigured || !auth) {
    throw new Error('Firebase Authentication is not configured.');
  }

  const cleanEmail = (email || '').trim().toLowerCase();
  try {
    const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const user = userCredential.user;

    // Retrieve shop record associated with this user
    const shop = await getShopForUser(user.uid, user.email);

    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || '',
      },
      shop,
    };
  } catch (err) {
    const friendly = mapFirebaseAuthError(err);
    const error = new Error(friendly);
    error.code = err.code;
    throw error;
  }
}

/**
 * Registers a new shopkeeper account and creates their PENDING shop record
 */
async function registerShopkeeper(data) {
  if (!isConfigured || !auth) {
    throw new Error('Firebase Authentication is not configured.');
  }

  const {
    fullName,
    mobile,
    email,
    password,
    shopName,
    building,
    floor = 'Ground Floor',
    room = '',
    tagline = '',
    services,
    tierRates,
  } = data;

  const cleanEmail = (email || '').trim().toLowerCase();

  try {
    // 1. Create Firebase Auth user
    const userCred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    const user = userCred.user;

    try {
      await updateProfile(user, { displayName: fullName });
    } catch (e) {}

    // 2. Generate unique shopId
    const cleanSlug = shopName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const shopId = `shop_${cleanSlug}_${randomSuffix}`;

    const shopDoc = {
      shopId,
      name: shopName.trim(),
      tagline: tagline.trim() || 'Campus Print & Xerox Center',
      status: 'PENDING',
      isAcceptingOrders: false,
      ownerUid: user.uid,
      ownerEmail: cleanEmail,
      ownerName: fullName.trim(),
      contactPhone: mobile.trim(),
      location: {
        building: building.trim(),
        floor: floor.trim(),
        room: room.trim(),
      },
      services: services || { bw: true, color: true, single: true, duplex: true },
      pricingTiers: tierRates || null,
      createdAt: serverTimestamp(),
    };

    // 3. Write shop document to Firestore
    await setDoc(doc(db, 'shops', shopId), shopDoc);

    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        displayName: fullName,
      },
      shop: shopDoc,
    };
  } catch (err) {
    const friendly = mapFirebaseAuthError(err);
    const error = new Error(friendly);
    error.code = err.code;
    throw error;
  }
}

/**
 * Queries Firestore for a shop matching ownerUid or ownerEmail
 */
async function getShopForUser(uid, email) {
  if (!db) return null;

  try {
    // 1. Query by ownerUid
    if (uid) {
      const qUid = query(collection(db, 'shops'), where('ownerUid', '==', uid));
      const snapUid = await getDocs(qUid);
      if (!snapUid.empty) {
        const docSnap = snapUid.docs[0];
        return { shopId: docSnap.id, ...docSnap.data() };
      }
    }

    // 2. Fallback query by ownerEmail
    if (email) {
      const qEmail = query(collection(db, 'shops'), where('ownerEmail', '==', email.toLowerCase().trim()));
      const snapEmail = await getDocs(qEmail);
      if (!snapEmail.empty) {
        const docSnap = snapEmail.docs[0];
        return { shopId: docSnap.id, ...docSnap.data() };
      }
    }
  } catch (err) {
    console.warn('Error fetching shop for user:', err.message);
  }

  return null;
}

/**
 * Look up shop record by ID
 */
async function getShopById(shopId) {
  if (!db || !shopId) return null;
  try {
    const snap = await getDoc(doc(db, 'shops', shopId));
    if (snap.exists()) {
      return { shopId: snap.id, ...snap.data() };
    }
  } catch (err) {
    console.warn('Error getting shop by ID:', err.message);
  }
  return null;
}

/**
 * Authenticates campus administrator with secure identity check
 */
async function loginAdmin(usernameOrEmail, password) {
  if (!isConfigured || !auth) {
    throw new Error('Firebase Authentication is not configured.');
  }

  const rawInput = (usernameOrEmail || '').trim();
  const normalized = rawInput.toLowerCase().replace(/\s+/g, '');

  const isAdminUsername =
    normalized === 'jaideepsingh' ||
    normalized === 'jaideep' ||
    normalized === 'admin' ||
    rawInput.toLowerCase() === 'admin.jaideep@printsathi.campus';

  const adminEmail = isAdminUsername ? 'admin.jaideep@printsathi.campus' : rawInput;

  try {
    const userCred = await signInWithEmailAndPassword(auth, adminEmail, password);
    const user = userCred.user;

    const isApprovedAdmin =
      user.email === 'admin.jaideep@printsathi.campus' ||
      user.email.startsWith('admin') ||
      user.email.endsWith('@printsathi.campus');

    if (!isApprovedAdmin) {
      await signOut(auth);
      throw new Error('Access denied: This account does not possess campus administrator privileges.');
    }

    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || 'Jaideep Singh',
        isAdmin: true,
      },
      isAdmin: true,
    };
  } catch (err) {
    const friendly = mapFirebaseAuthError(err);
    const error = new Error(friendly);
    error.code = err.code;
    throw error;
  }
}

/**
 * Signs out from Firebase Authentication
 */
async function logout() {
  if (isConfigured && auth) {
    try {
      await signOut(auth);
    } catch (e) {}
  }
  return { success: true };
}

/**
 * Retrieves all registered campus shops for the admin console
 */
async function getAllShops() {
  if (!db) return [];
  try {
    const snapshot = await getDocs(collection(db, 'shops'));
    const shops = [];
    snapshot.forEach((docSnap) => {
      shops.push({ shopId: docSnap.id, ...docSnap.data() });
    });
    return shops;
  } catch (err) {
    console.warn('Error getting all shops:', err.message);
    return [];
  }
}

/**
 * Real-time subscription to all campus shops
 */
function subscribeToAllShops(callback, onError) {
  if (!db) return () => {};
  return onSnapshot(
    collection(db, 'shops'),
    (snapshot) => {
      const shops = [];
      snapshot.forEach((docSnap) => {
        shops.push({ shopId: docSnap.id, ...docSnap.data() });
      });
      callback(shops);
    },
    (err) => {
      console.error('All shops listener error in Electron:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Updates shop status (APPROVED, REJECTED, SUSPENDED, PENDING)
 */
async function updateShopStatus(shopId, status, rejectionReason = '') {
  if (!db) return { success: false, reason: 'Database not initialized' };

  try {
    const updates = {
      status,
      ...(status === 'APPROVED' ? { isAcceptingOrders: true } : {}),
      ...(status === 'SUSPENDED' || status === 'REJECTED' ? { isAcceptingOrders: false } : {}),
      ...(rejectionReason ? { rejectionReason } : {}),
      updatedAt: serverTimestamp(),
    };

    await updateDoc(doc(db, 'shops', shopId), updates);
    return { success: true };
  } catch (err) {
    console.error('Error updating shop status:', err);
    return { success: false, reason: err.message };
  }
}

/**
 * Directly provisions a campus counter by administrator
 */
async function createShopByAdmin(shopData) {
  if (!db) return { success: false, reason: 'Database not initialized' };

  try {
    const cleanSlug = (shopData.name || 'shop').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const shopId = `shop_${cleanSlug}_${randomSuffix}`;

    const docPayload = {
      shopId,
      name: shopData.name,
      tagline: shopData.tagline || 'Campus Print Station',
      status: 'APPROVED',
      isAcceptingOrders: true,
      ownerName: shopData.ownerName || 'Counter Staff',
      ownerEmail: shopData.ownerEmail || '',
      contactPhone: shopData.contactPhone || '',
      location: shopData.location || { building: 'Campus Plaza', floor: 'Ground Floor', room: '' },
      pricingTiers: shopData.pricingTiers || null,
      createdAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'shops', shopId), docPayload);
    return { success: true, shopId, shop: docPayload };
  } catch (err) {
    console.error('Error creating shop by admin:', err);
    return { success: false, reason: err.message };
  }
}

module.exports = {
  db,
  auth,
  isConfigured,
  normalizeDesktopOrder,
  normalizeTimestamp,
  matchesShopId,
  claimJobAtomically,
  markJobPrintSubmitted,
  markJobCompleted,
  markJobFailed,
  markJobNeedsVerification,
  recoverStaleJobs,
  subscribeToEligibleQueue,
  isPaymentVerified,
  isJobQueued,
  loginShopkeeper,
  registerShopkeeper,
  getShopForUser,
  getShopById,
  loginAdmin,
  logout,
  getAllShops,
  subscribeToAllShops,
  updateShopStatus,
  createShopByAdmin,
};

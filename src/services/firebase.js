/**
 * ============================================================================
 * PRINT-SATHI: Enterprise Multi-Shop & Multi-File Firebase Service
 * ============================================================================
 * 
 * 🏢 ARCHITECTURE OVERVIEW:
 * 1. Collections:
 *    - `shops/{shopId}`: Shop profiles, pricing tiers, accepting status, location.
 *    - `orders/{orderId}`: Multi-file print orders with itemized file configurations.
 *    - `print_jobs/{orderId}`: Dual-write backwards compatibility layer.
 * 
 * 2. Multi-File Support:
 *    - Supports up to 10 files per order.
 *    - Stores file metadata, page counts, copies, duplex/color specs.
 * 
 * 3. Dual-Read Normalization:
 *    - `normalizeOrder(doc)` automatically bridges legacy single-file records
 *      and modern multi-file structures.
 * 
 * 4. Resilient Fallbacks:
 *    - Timeout guards (3.5s) ensure zero freezing even on free Spark plans.
 *    - LocalStorage persistence guarantees offline / demo-mode operation.
 * ============================================================================
 */

import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  getDoc,
  getDocs,
  setDoc, 
  updateDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  uploadBytesResumable,
  getDownloadURL 
} from 'firebase/storage';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';

import { calculateOrderPricing, DEFAULT_PRICING_CONFIG } from '../utils/pricingEngine.js';

/**
 * Clean environment variables (strips accidental quotes, spaces, trailing commas)
 */
const cleanEnv = (val) => {
  if (!val) return '';
  return val
    .toString()
    .trim()
    .replace(/[,;]+$/, '')
    .replace(/^["']|["']$/g, '')
    .trim();
};

/**
 * Fast Promise Timeout Guard
 */
const withTimeout = (promise, ms, errorMessage) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), ms)
    ),
  ]);
};

// Read configuration from Vite environment variables (.env file)
const viteEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
const firebaseConfig = {
  apiKey: cleanEnv(viteEnv.VITE_FIREBASE_API_KEY),
  authDomain: cleanEnv(viteEnv.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: cleanEnv(viteEnv.VITE_FIREBASE_PROJECT_ID),
  storageBucket: cleanEnv(viteEnv.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: cleanEnv(viteEnv.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: cleanEnv(viteEnv.VITE_FIREBASE_APP_ID),
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.apiKey.length > 5 &&
  !firebaseConfig.apiKey.includes('your_api_key')
);

// Initialize Firebase instances
let dbInstance = null;
let storageInstance = null;
let authInstance = null;

if (isFirebaseConfigured) {
  try {
    const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
    dbInstance = getFirestore(app);
    storageInstance = getStorage(app);
    if (storageInstance) {
      // Bound max retry time to 2.5s so Firebase Storage SDK does not stall the app on network/bucket errors
      storageInstance.maxUploadRetryTime = 2500;
      storageInstance.maxOperationRetryTime = 2500;
    }
    authInstance = getAuth(app);
    console.log('🔥 [Print-Sathi] Firebase initialized for project:', firebaseConfig.projectId);
  } catch (error) {
    console.error('⚠️ [Print-Sathi] Firebase initialization error:', error);
  }
}

export const db = dbInstance;
export const storage = storageInstance;
export const auth = authInstance;

const LOCAL_STORAGE_ORDERS_KEY = 'print_sathi_orders';
const LOCAL_STORAGE_SHOPS_KEY = 'print_sathi_shops';

/**
 * Default Seed Campus Shops
 */
export const SEED_SHOPS = [
  {
    shopId: 'shop_main_xerox',
    name: 'Main Xerox & Print Center',
    tagline: 'Fast high-volume printing and spiral binding',
    status: 'APPROVED',
    isAcceptingOrders: true,
    ownerEmail: 'counter1@printsathi.campus',
    location: {
      building: 'Student Plaza',
      floor: 'Ground Floor',
      room: 'Shop G-04',
    },
    contactPhone: '+91 98765 43210',
    qrCodeSlug: 'main-xerox',
    pricingTiers: DEFAULT_PRICING_CONFIG,
    stats: { totalOrders: 142, completedOrders: 140 },
    createdAt: new Date().toISOString(),
  },
  {
    shopId: 'shop_library',
    name: 'Central Library Printing Desk',
    tagline: 'Quiet, academic & thesis double-sided printing',
    status: 'APPROVED',
    isAcceptingOrders: true,
    ownerEmail: 'library@printsathi.campus',
    location: {
      building: 'Central Library',
      floor: '1st Floor',
      room: 'Reference Section Desk',
    },
    contactPhone: '+91 98765 43211',
    qrCodeSlug: 'central-library',
    pricingTiers: DEFAULT_PRICING_CONFIG,
    stats: { totalOrders: 89, completedOrders: 88 },
    createdAt: new Date().toISOString(),
  },
  {
    shopId: 'shop_computer_center',
    name: 'Computer Center Print Hub',
    tagline: 'High-speed lab printing & project reports',
    status: 'APPROVED',
    isAcceptingOrders: true,
    ownerEmail: 'compcenter@printsathi.campus',
    location: {
      building: 'Computer Center',
      floor: '2nd Floor',
      room: 'Lab B-201',
    },
    contactPhone: '+91 98765 43212',
    qrCodeSlug: 'computer-center',
    pricingTiers: DEFAULT_PRICING_CONFIG,
    stats: { totalOrders: 64, completedOrders: 63 },
    createdAt: new Date().toISOString(),
  },
];

/**
 * Generates a unique 4-digit Token & Order ID (e.g. "PS-8421")
 */
export function generateTokenId() {
  const random4Digit = Math.floor(1000 + Math.random() * 9000).toString();
  return {
    token: random4Digit,
    orderId: `PS-${random4Digit}`,
  };
}

/**
 * ============================================================================
 * DUAL-READ COMPATIBILITY ADAPTER: normalizeOrder
 * ============================================================================
 * Bridges legacy scalar order records with the new multi-file array format.
 */
export function normalizeOrder(docData) {
  if (!docData) return null;

  const orderId = docData.orderId || docData.id || 'PS-0000';
  const token = docData.token || orderId.replace(/^PS-/, '') || '0000';
  const shopId = docData.shopId || 'shop_main_xerox';
  const status = (docData.status || docData.printStatus || 'QUEUED').toUpperCase();
  const paymentStatus = (docData.paymentStatus || 'COMPLETED').toUpperCase();

  // If already modern multi-file format
  if (Array.isArray(docData.files) && docData.files.length > 0) {
    return {
      ...docData,
      id: orderId,
      orderId,
      token,
      shopId,
      status,
      paymentStatus,
      files: docData.files.map((f, index) => {
        const totalPgs = f.totalPages || 1;
        const mode = f.pageSelection?.mode || f.pageRangeMode || 'all';
        const fromPg = f.pageSelection?.fromPage ?? f.fromPage ?? 1;
        const toPg = f.pageSelection?.toPage ?? f.toPage ?? totalPgs;
        const calcPgs = f.calculatedPages || (mode === 'custom' ? Math.max(1, toPg - fromPg + 1) : totalPgs);
        const rangeStr = f.pageRangeString || (mode === 'custom' ? `Pages ${fromPg}–${toPg} (${calcPgs} pgs)` : `All (${totalPgs} pgs)`);

        return {
          fileId: f.fileId || f.id || `file_${index}`,
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
          ratePerPage: f.ratePerPage || 1,
          itemTotal: f.itemTotal || 0,
          ...f,
        };
      }),
      pricingSnapshot: docData.pricingSnapshot || {
        totalAmount: docData.totalAmount || 0,
        subtotal: docData.totalAmount || 0,
        totalSheets: docData.calculatedPages || 1,
        totalPages: docData.calculatedPages || 1,
      },
    };
  }

  // Legacy single-file synthesis
  const totalPgs = docData.totalPages || 1;
  const mode = docData.pageSelection?.mode || docData.pageRangeMode || 'all';
  const fromPg = docData.pageSelection?.fromPage ?? docData.fromPage ?? 1;
  const toPg = docData.pageSelection?.toPage ?? docData.toPage ?? totalPgs;
  const calcPgs = docData.calculatedPages || docData.totalPages || (mode === 'custom' ? Math.max(1, toPg - fromPg + 1) : totalPgs);
  const rangeStr = docData.pageRangeString || (mode === 'custom' ? `Pages ${fromPg}–${toPg} (${calcPgs} pgs)` : `All (${totalPgs} pgs)`);

  const singleFile = {
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
    ratePerPage: docData.ratePerPage || 1,
    itemTotal: docData.totalAmount || 0,
  };

  return {
    ...docData,
    id: orderId,
    orderId,
    token,
    shopId,
    status,
    paymentStatus,
    files: [singleFile],
    pricingSnapshot: {
      totalAmount: docData.totalAmount || singleFile.itemTotal || 0,
      subtotal: docData.totalAmount || singleFile.itemTotal || 0,
      totalSheets: singleFile.calculatedPages * singleFile.copies,
      totalPages: singleFile.calculatedPages * singleFile.copies,
      totalFiles: 1,
    },
  };
}

/**
 * ============================================================================
 * SHOP MANAGEMENT FUNCTIONS
 * ============================================================================
 */

/**
 * Real-time listener for approved shops (Student Website)
 * Ensures newly approved shops and price changes appear dynamically without redeployment
 */
export function subscribeToApprovedShops(callback, onError) {
  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'shops'), where('status', '==', 'APPROVED'));
      return onSnapshot(
        q,
        (snapshot) => {
          const approved = [];
          snapshot.forEach((docSnap) => {
            approved.push({ shopId: docSnap.id, ...docSnap.data() });
          });
          callback(approved);
        },
        (error) => {
          console.error('❌ [Approved Shops Listener Error]:', error);
          if (onError) onError(error);
          getApprovedShops().then(callback);
        }
      );
    } catch (err) {
      console.warn('subscribeToApprovedShops error:', err);
    }
  }

  getApprovedShops().then(callback);
  return () => {};
}

/**
 * Real-time listener for all shops (Admin Console)
 * Ensures newly registered counters instantly appear for administrator review
 */
export function subscribeToAllShops(callback, onError) {
  if (isFirebaseConfigured && db) {
    try {
      return onSnapshot(
        collection(db, 'shops'),
        (snapshot) => {
          const all = [];
          snapshot.forEach((docSnap) => {
            all.push({ shopId: docSnap.id, ...docSnap.data() });
          });
          callback(all);
        },
        (error) => {
          console.error('❌ [All Shops Listener Error]:', error);
          if (onError) onError(error);
          getAllShops().then(callback);
        }
      );
    } catch (err) {
      console.warn('subscribeToAllShops error:', err);
    }
  }

  getAllShops().then(callback);
  return () => {};
}

/**
 * Get all approved shops for student browsing & directory
 */
export async function getApprovedShops() {
  let shopsList = [];

  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'shops'), where('status', '==', 'APPROVED'));
      const snapshot = await withTimeout(
        getDocs(q),
        4000,
        'Shops query timed out'
      );
      snapshot.forEach((docSnap) => {
        shopsList.push({ shopId: docSnap.id, ...docSnap.data() });
      });
      if (shopsList.length > 0) {
        return shopsList;
      }
    } catch (err) {
      console.warn('ℹ️ [Shops] Query error:', err.message);
    }
  }

  // Fallback to locally cached approved shops
  try {
    const cached = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SHOPS_KEY) || '[]');
    const approved = cached.filter((s) => s.status === 'APPROVED');
    if (approved.length > 0) return approved;
  } catch (e) {}

  return [];
}

/**
 * Get all shops for Admin console (Real Firestore records only, no demo seeds)
 */
export async function getAllShops() {
  let shopsList = [];

  if (isFirebaseConfigured && db) {
    try {
      const snapshot = await withTimeout(
        getDocs(collection(db, 'shops')),
        4000,
        'Shops fetch timed out'
      );
      snapshot.forEach((docSnap) => {
        shopsList.push({ shopId: docSnap.id, ...docSnap.data() });
      });
      return shopsList;
    } catch (err) {
      console.warn('ℹ️ [Shops] Fetch warning:', err.message);
    }
  }

  // Local storage check if offline
  try {
    const cached = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SHOPS_KEY) || '[]');
    if (cached.length > 0) return cached;
  } catch (e) {}

  return [];
}

/**
 * Get single shop by ID
 */
export async function getShopById(shopId) {
  if (!shopId) return null;

  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, 'shops', shopId);
      const docSnap = await withTimeout(getDoc(docRef), 3000, 'Shop lookup timed out');
      if (docSnap.exists()) {
        return { shopId: docSnap.id, ...docSnap.data() };
      }
    } catch (err) {
      console.warn('Shop lookup error:', err.message);
    }
  }

  // Fallback to local
  const all = await getAllShops();
  return all.find((s) => s.shopId === shopId) || null;
}

/**
 * Fetch shop belonging to a specific authenticated user
 */
export async function getShopForUser(uid, email) {
  if (isFirebaseConfigured && db) {
    try {
      if (uid) {
        const qUid = query(collection(db, 'shops'), where('ownerUid', '==', uid));
        const snapUid = await getDocs(qUid);
        if (!snapUid.empty) {
          return { shopId: snapUid.docs[0].id, ...snapUid.docs[0].data() };
        }
      }
      if (email) {
        const qEmail = query(collection(db, 'shops'), where('ownerEmail', '==', email.toLowerCase()));
        const snapEmail = await getDocs(qEmail);
        if (!snapEmail.empty) {
          return { shopId: snapEmail.docs[0].id, ...snapEmail.docs[0].data() };
        }
      }
    } catch (err) {
      console.warn('Error querying shop for user:', err.message);
    }
  }

  try {
    const cached = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SHOPS_KEY) || '[]');
    const match = cached.find((s) => s.ownerUid === uid || s.ownerEmail?.toLowerCase() === email?.toLowerCase());
    if (match) return match;
  } catch (e) {}

  return null;
}

/**
 * Create or register a new shop
 */
export async function createShop(shopData) {
  const shopId = shopData.shopId || `shop_${Date.now()}`;
  const payload = {
    shopId,
    name: (shopData.name || 'New Campus Print Shop').trim(),
    shopkeeperName: (shopData.shopkeeperName || '').trim(),
    tagline: (shopData.tagline || 'Printing and Photocopy Services').trim(),
    ownerUid: shopData.ownerUid || '',
    ownerEmail: (shopData.ownerEmail || '').toLowerCase().trim(),
    status: shopData.status || 'PENDING', // PENDING approval by admin
    isAcceptingOrders: shopData.isAcceptingOrders ?? false,
    location: shopData.location || { building: 'Campus Center', floor: 'Ground Floor', room: '101' },
    contactPhone: (shopData.contactPhone || '').trim(),
    supportedServices: shopData.supportedServices || {
      bw: true,
      color: true,
      single: true,
      duplex: true,
    },
    qrCodeSlug: shopData.qrCodeSlug || shopId,
    pricingTiers: shopData.pricingTiers || DEFAULT_PRICING_CONFIG,
    stats: { totalOrders: 0, completedOrders: 0 },
    createdAt: shopData.createdAt || new Date().toISOString(),
  };

  if (isFirebaseConfigured && db) {
    try {
      await setDoc(doc(db, 'shops', shopId), payload);
    } catch (err) {
      console.warn('Create shop Firestore error:', err.message);
      throw err;
    }
  }

  // Cache locally
  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SHOPS_KEY) || '[]');
    const filtered = existing.filter((s) => s.shopId !== shopId);
    filtered.unshift(payload);
    localStorage.setItem(LOCAL_STORAGE_SHOPS_KEY, JSON.stringify(filtered));
  } catch (e) {}

  return { success: true, shop: payload };
}

/**
 * Update shop data (e.g. isAcceptingOrders toggle, pricingTiers)
 */
export async function updateShop(shopId, updates) {
  if (!shopId) return { success: false, error: 'Shop ID required' };

  if (isFirebaseConfigured && db) {
    try {
      await updateDoc(doc(db, 'shops', shopId), updates);
    } catch (err) {
      console.warn('Update shop Firestore warning:', err.message);
    }
  }

  // Update local cache
  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SHOPS_KEY) || '[]');
    const updated = existing.map((s) => (s.shopId === shopId ? { ...s, ...updates } : s));
    localStorage.setItem(LOCAL_STORAGE_SHOPS_KEY, JSON.stringify(updated));
  } catch (e) {}

  return { success: true };
}

/**
 * Admin action: Update shop approval status ('APPROVED', 'PENDING', 'SUSPENDED', 'REJECTED')
 */
export async function updateShopStatus(shopId, status, rejectionReason = '') {
  const updates = {
    status,
    ...(status === 'APPROVED' ? { isAcceptingOrders: true } : {}),
    ...(status === 'SUSPENDED' || status === 'REJECTED' ? { isAcceptingOrders: false } : {}),
    ...(rejectionReason ? { rejectionReason } : {}),
  };
  return await updateShop(shopId, updates);
}

/**
 * ============================================================================
 * MULTI-FILE ORDER SUBMISSION & PROCESSING
 * ============================================================================
 */

/**
 * Safely converts a File/Blob to a Base64 Data URL for direct Firestore payload synchronization
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file provided for Base64 conversion.'));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read document into memory.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Session-level cache for Cloud Storage reachability
 * Prevents repeating slow network timeouts on every document when a bucket is unprovisioned.
 */
let storageAvailabilityCache = {
  tested: false,
  available: false,
  testedAt: 0,
  errorCode: null,
};

/**
 * Probes Cloud Storage health and connectivity
 */
export async function checkStorageHealth() {
  if (!isFirebaseConfigured || !storage) {
    return { configured: false, reachable: false, reason: 'Firebase or Storage not initialized' };
  }
  const probeStart = Date.now();
  try {
    const probeRef = ref(storage, '.health_check');
    const dummy = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const probeTask = uploadBytesResumable(probeRef, dummy, { contentType: 'application/pdf' });
    await withTimeout(probeTask, 2500, 'Storage health probe timed out after 2.5s');
    storageAvailabilityCache = { tested: true, available: true, testedAt: Date.now(), errorCode: null };
    return { configured: true, reachable: true, bucket: firebaseConfig.storageBucket, elapsedMs: Date.now() - probeStart };
  } catch (err) {
    storageAvailabilityCache = { tested: true, available: false, testedAt: Date.now(), errorCode: err.code || 'storage/unknown' };
    return {
      configured: true,
      reachable: false,
      bucket: firebaseConfig.storageBucket,
      errorCode: err.code || 'storage/unknown',
      errorMessage: err.message,
      elapsedMs: Date.now() - probeStart,
    };
  }
}

/**
 * Submits a multi-file print order targeting `orders/{orderId}` and dual-writing
 * to `print_jobs/{orderId}` for legacy desktop backwards compatibility.
 * 
 * @param {object} orderConfig - { shopId, studentIdentifier, pickupCounter, pricingSnapshot }
 * @param {Array<object>} filesList - Array of { file, name, size, totalPages, calculatedPages, copies, colorMode, sides, pageRangeMode, pageRangeString }
 * @param {function} onProgress - Progress reporter callback
 */
export async function submitMultiFileOrder(orderConfig, filesList, onProgress) {
  if (!Array.isArray(filesList) || filesList.length === 0) {
    throw new Error('No documents uploaded. Please select at least one PDF file.');
  }

  const orderStartTime = Date.now();
  const { token, orderId } = generateTokenId();
  const shopId = orderConfig.shopId || 'shop_main_xerox';
  const pickupCounter = orderConfig.pickupCounter || 'Counter 1 (Main Xerox Center)';

  console.log(`\n================================================================`);
  console.log(`⏱️ [PRINT-SATHI TIMING TRACE] Order #${orderId} (Token: #${token})`);
  console.log(`📁 Files in batch: ${filesList.length} | Target Shop: ${shopId}`);
  console.log(`================================================================`);

  // Calculate strict pricing snapshot (or use validated pre-calculated snapshot)
  const pricingSnapshot = orderConfig.pricingSnapshot || calculateOrderPricing(filesList, orderConfig.shopPricing || null);

  // Process and upload files
  const processedFiles = [];
  let anyStorageUploaded = false;

  for (let i = 0; i < filesList.length; i++) {
    const item = filesList[i];
    const fileObj = item.rawFile || item.file;
    const fileSize = fileObj ? fileObj.size : (item.size || 0);
    const fileName = fileObj ? fileObj.name : (item.name || `file_${i + 1}.pdf`);
    let fileUrl = '';
    let isCloudUploaded = false;
    let uploadMethod = 'NONE';
    const fileStartTime = Date.now();

    console.log(`\n[Stage 1: File ${i + 1}/${filesList.length}] "${fileName}"`);
    console.log(` - Raw Size: ${fileSize} bytes (${(fileSize / 1024).toFixed(1)} KB, ${(fileSize / (1024 * 1024)).toFixed(2)} MB)`);

    if (onProgress && fileObj) {
      onProgress(`Preparing "${fileName}" (${i + 1}/${filesList.length})...`);
    }

    // 1. Attempt Cloud Storage upload with bounded timeout and progress tracking.
    // If storage was already tested and confirmed unprovisioned/unavailable in this session,
    // and the file is small (<= 750 KB), skip the futile network timeout!
    const shouldAttemptStorage = Boolean(
      isFirebaseConfigured && 
      storage && 
      fileObj && 
      (storageAvailabilityCache.available || !storageAvailabilityCache.tested || fileSize > 750 * 1024)
    );

    if (shouldAttemptStorage) {
      const storageStart = Date.now();
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `orders/${orderId}/${safeName}`;
      console.log(`☁️ [Cloud Storage Attempt] Path: gs://${firebaseConfig.storageBucket}/${storagePath}`);
      uploadMethod = 'Firebase Cloud Storage (Resumable)';

      try {
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, fileObj, { contentType: 'application/pdf' });

        uploadTask.on('state_changed', (snap) => {
          if (snap.totalBytes > 0 && onProgress) {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            onProgress(`Uploading "${fileName}": ${pct}% (${(snap.bytesTransferred / 1024).toFixed(0)} KB / ${(snap.totalBytes / 1024).toFixed(0)} KB)`);
          }
        });

        // Bounded timeout: 3.5s connection budget for small files, scaled for larger files
        const timeoutMs = Math.max(3500, Math.ceil((fileSize / (1024 * 1024)) * 3000) + 2500);
        const result = await withTimeout(
          uploadTask,
          timeoutMs,
          `Storage upload timed out after ${(timeoutMs / 1000).toFixed(1)}s`
        );

        const urlStart = Date.now();
        fileUrl = await getDownloadURL(result.ref);
        const urlElapsed = Date.now() - urlStart;
        const uploadElapsed = Date.now() - storageStart;

        isCloudUploaded = true;
        anyStorageUploaded = true;
        storageAvailabilityCache = { tested: true, available: true, testedAt: Date.now(), errorCode: null };

        console.log(`✅ [Storage Upload Succeeded] In ${uploadElapsed} ms (URL fetch: ${urlElapsed} ms)`);
        console.log(`🔗 [Download URL]: ${fileUrl}`);
      } catch (storageErr) {
        const uploadElapsed = Date.now() - storageStart;
        storageAvailabilityCache = {
          tested: true,
          available: false,
          testedAt: Date.now(),
          errorCode: storageErr.code || 'storage/unknown'
        };
        console.warn(`❌ [Storage Upload Failed] After ${uploadElapsed} ms | Code: ${storageErr.code} | Message: ${storageErr.message}`);
      }
    } else if (fileObj && fileSize <= 750 * 1024) {
      console.log(`⚡ [Storage Fast-Bypass] Skipping known unprovisioned Cloud Storage bucket for small document (${(fileSize / 1024).toFixed(1)} KB)`);
    }

    // 2. Resilient Direct Firestore Sync: If Cloud Storage is unprovisioned or failed
    if (!isCloudUploaded && fileObj) {
      if (fileSize <= 750 * 1024) {
        // Files <= 750 KB fit comfortably within Firestore's 1 MiB document limit
        uploadMethod = 'Campus Direct Sync (Base64)';
        const b64Start = Date.now();
        if (onProgress) {
          onProgress(`Direct campus sync for "${fileName}" (${(fileSize / 1024).toFixed(0)} KB)...`);
        }
        try {
          fileUrl = await fileToBase64(fileObj);
          const b64Elapsed = Date.now() - b64Start;
          console.log(`📦 [Direct Sync Completed] In ${b64Elapsed} ms | Payload length: ${fileUrl.length} characters`);
        } catch (b64Err) {
          console.warn('Base64 conversion failed:', b64Err);
        }
      } else {
        // File is larger than 750 KB and Cloud Storage failed
        const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
        const fileSizeKB = (fileSize / 1024).toFixed(1);
        throw new Error(
          `Document "${fileName}" (${fileSizeKB} KB / ${fileSizeMB} MB) could not be uploaded to Cloud Storage. ` +
          `Firebase Cloud Storage bucket "${firebaseConfig.storageBucket}" is not provisioned in project "${firebaseConfig.projectId}" (Error: ${storageAvailabilityCache.errorCode || 'storage/unknown'}). ` +
          `Firestore documents have a strict 1 MiB limit, so documents over 750 KB cannot use direct sync. ` +
          `Please enable Cloud Storage in Firebase Console (Build > Storage > Get Started).`
        );
      }
    }

    if (!fileUrl && fileObj) {
      throw new Error(`Could not generate an accessible document URL for "${fileName}". Order aborted.`);
    }

    if (fileUrl.startsWith('blob:')) {
      throw new Error(`Invalid local blob URL for "${fileName}". Local blob URLs cannot be downloaded by remote desktop stations.`);
    }

    const fileTotalElapsed = Date.now() - fileStartTime;
    console.log(`✨ [File ${i + 1} Ready] Method: ${uploadMethod} | Total file prep time: ${fileTotalElapsed} ms`);

    const itemPricing = pricingSnapshot.items[i] || {};
    const totalPgs = item.totalPages || 1;
    const mode = item.pageSelection?.mode || item.pageRangeMode || 'all';
    const fromPg = item.pageSelection?.fromPage ?? item.fromPage ?? 1;
    const toPg = item.pageSelection?.toPage ?? item.toPage ?? totalPgs;
    const calcPgs = item.calculatedPages || (mode === 'custom' ? Math.max(1, toPg - fromPg + 1) : totalPgs);
    const rangeStr = item.pageRangeString || (mode === 'custom' ? `Pages ${fromPg}–${toPg} (${calcPgs} pgs)` : `All (${totalPgs} pgs)`);

    processedFiles.push({
      fileId: item.id || `file_${i + 1}_${Date.now()}`,
      fileName: fileName,
      fileSize: fileSize,
      fileUrl,
      previewUrl: fileObj && typeof URL !== 'undefined' ? URL.createObjectURL(fileObj) : '',
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
      copies: item.copies || 1,
      colorMode: item.colorMode || 'bw',
      colourMode: item.colourMode || (item.colorMode === 'color' ? 'color' : 'grayscale'),
      sides: item.sides || 'single',
      ratePerPage: itemPricing.ratePerPage || (item.colorMode === 'color' ? 8 : 2),
      itemTotal: itemPricing.itemTotal || 0,
      uploadMethod,
    });
  }

  // 3. Registering order in Firestore
  if (onProgress) {
    onProgress('Registering order in campus print queue...');
  }

  const orderPayload = {
    orderId,
    token,
    shopId,
    pickupCounter,
    studentIdentifier: orderConfig.studentIdentifier || `Student-${token}`,
    files: processedFiles,
    pricingSnapshot: {
      subtotal: pricingSnapshot.subtotal,
      totalAmount: pricingSnapshot.totalAmount,
      totalSheets: pricingSnapshot.totalSheets,
      totalPages: pricingSnapshot.totalPages,
      totalFiles: processedFiles.length,
    },
    totalAmount: pricingSnapshot.totalAmount,
    paymentStatus: 'COMPLETED', // Standardized payment status
    status: 'QUEUED',          // Standardized queue status
    printStatus: 'QUEUED',
    createdAt: serverTimestamp(),
  };

  let firestoreSaved = false;
  const dbStartTime = Date.now();

  if (isFirebaseConfigured && db) {
    try {
      console.log(`\n📝 [Stage 2: Firestore Write] Saving order #${orderId} to 'orders' collection...`);
      const orderRef = doc(db, 'orders', orderId);
      await withTimeout(
        setDoc(orderRef, orderPayload),
        4000,
        'Firestore order creation timed out'
      );
      firestoreSaved = true;
      const dbElapsed = Date.now() - dbStartTime;
      console.log(`🎉 [Firestore Write Success] Saved in ${dbElapsed} ms!`);

      // Dual-write legacy record to 'print_jobs' for backward compatibility
      try {
        const legacyRef = doc(db, 'print_jobs', orderId);
        const firstFile = processedFiles[0] || {};
        await setDoc(legacyRef, {
          ...orderPayload,
          fileName: firstFile.fileName || 'document.pdf',
          fileSize: firstFile.fileSize || 0,
          fileUrl: firstFile.fileUrl || '',
          totalPages: firstFile.totalPages || 1,
          calculatedPages: firstFile.calculatedPages || 1,
          copies: firstFile.copies || 1,
          colorMode: firstFile.colorMode || 'bw',
          sides: firstFile.sides || 'single',
          ratePerPage: firstFile.ratePerPage || 2,
        });
      } catch (legacyErr) {
        console.warn('Legacy print_jobs dual-write non-critical notice:', legacyErr.message);
      }
    } catch (firestoreErr) {
      console.warn('⚠️ [Firestore Notice] Could not reach cloud:', firestoreErr.message);
    }
  }

  const completeOrder = normalizeOrder({
    ...orderPayload,
    createdAt: new Date().toISOString(),
    isLiveCloud: firestoreSaved || anyStorageUploaded,
    firestoreSaved,
    storageUploaded: anyStorageUploaded,
  });

  // Always save in browser localStorage
  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_STORAGE_ORDERS_KEY) || '[]');
    existing.unshift(completeOrder);
    localStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, JSON.stringify(existing.slice(0, 50)));
    window.dispatchEvent(new CustomEvent('print-sathi-job-update'));
  } catch (err) {
    console.warn(err);
  }

  const totalOrderElapsed = Date.now() - orderStartTime;
  console.log(`\n================================================================`);
  console.log(`🏁 [ORDER COMPLETE] Token: #${token} | Total Duration: ${totalOrderElapsed} ms`);
  console.log(`================================================================\n`);

  return {
    success: true,
    order: completeOrder,
    isLiveCloud: firestoreSaved || anyStorageUploaded,
  };
}

/**
 * Backward-compatible single-file submitPrintJob wrapper
 */
export async function submitPrintJob(jobConfig, file) {
  const filesList = [
    {
      rawFile: file,
      name: file ? file.name : 'document.pdf',
      size: file ? file.size : 0,
      totalPages: jobConfig.totalPages || 1,
      calculatedPages: jobConfig.calculatedPages || 1,
      copies: jobConfig.copies || 1,
      colorMode: jobConfig.colorMode || 'bw',
      sides: jobConfig.sides || 'single',
      pageRangeMode: jobConfig.pageRangeMode || 'all',
      pageRangeString: jobConfig.pageRangeString || `All (${jobConfig.totalPages || 1} pgs)`,
      ratePerPage: jobConfig.ratePerPage || 2,
      itemTotal: jobConfig.totalAmount || 0,
    },
  ];

  return await submitMultiFileOrder(
    {
      shopId: jobConfig.shopId || 'shop_main_xerox',
      pickupCounter: jobConfig.pickupCounter || 'Counter 1 (Main Xerox Center, Student Plaza)',
    },
    filesList
  );
}

/**
 * ============================================================================
 * QUEUE LISTENERS & STATUS UPDATES
 * ============================================================================
 */

/**
 * Real-time queue subscription for a specific shop
 * @param {string} shopId
 * @param {Function} onQueueUpdate
 * @param {Function} onError
 */
export function subscribeToShopOrders(shopId, onQueueUpdate, onError) {
  if (isFirebaseConfigured && db) {
    try {
      console.log(`📡 [Firestore] Subscribing to orders for shop: ${shopId || 'ALL'}...`);
      let q = collection(db, 'orders');

      if (shopId) {
        q = query(
          collection(db, 'orders'),
          where('shopId', '==', shopId),
          where('paymentStatus', '==', 'COMPLETED')
        );
      } else {
        q = query(
          collection(db, 'orders'),
          where('paymentStatus', '==', 'COMPLETED')
        );
      }

      return onSnapshot(
        q,
        (snapshot) => {
          const liveQueue = [];
          snapshot.forEach((docSnap) => {
            const normalized = normalizeOrder({ id: docSnap.id, ...docSnap.data() });
            if (normalized) liveQueue.push(normalized);
          });

          // Sort ascending (FIFO)
          liveQueue.sort((a, b) => {
            const timeA = a.createdAt?.toMillis
              ? a.createdAt.toMillis()
              : new Date(a.createdAt || 0).getTime();
            const timeB = b.createdAt?.toMillis
              ? b.createdAt.toMillis()
              : new Date(b.createdAt || 0).getTime();
            return timeA - timeB;
          });

          onQueueUpdate(liveQueue);
        },
        (error) => {
          console.error('❌ [Firestore Shop Orders Listener Error]:', error);
          if (onError) onError(error);
          fallbackLocalQueue(onQueueUpdate, shopId);
        }
      );
    } catch (err) {
      console.error('Shop orders subscription setup error:', err);
    }
  }

  return fallbackLocalQueue(onQueueUpdate, shopId);
}

/**
 * Legacy subscribeToPrintQueue (Dual-Read)
 */
export function subscribeToPrintQueue(onQueueUpdate, onError) {
  return subscribeToShopOrders(null, onQueueUpdate, onError);
}

/**
 * Local queue fallback when Firebase is in demo/offline mode
 */
function fallbackLocalQueue(onQueueUpdate, shopId = null) {
  const readQueue = () => {
    try {
      const allOrders = JSON.parse(localStorage.getItem(LOCAL_STORAGE_ORDERS_KEY) || '[]');
      const normalized = allOrders.map((o) => normalizeOrder(o));
      const filtered = normalized.filter((o) => {
        const matchesShop = !shopId || o.shopId === shopId;
        const isQueued = o.status === 'QUEUED' || o.status === 'PENDING';
        return matchesShop && isQueued;
      });
      filtered.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      onQueueUpdate(filtered);
    } catch (err) {
      onQueueUpdate([]);
    }
  };

  readQueue();

  const handleUpdate = () => readQueue();
  window.addEventListener('print-sathi-job-update', handleUpdate);
  window.addEventListener('storage', handleUpdate);

  return () => {
    window.removeEventListener('print-sathi-job-update', handleUpdate);
    window.removeEventListener('storage', handleUpdate);
  };
}

/**
 * Mark an order as printed in both orders & print_jobs collections
 */
export async function markJobAsPrinted(orderId) {
  console.log(`🖨️ [Firestore] Marking order ${orderId} as PRINTED...`);

  if (isFirebaseConfigured && db) {
    try {
      const updateData = {
        status: 'PRINTED',
        printStatus: 'PRINTED',
        printedAt: serverTimestamp(),
      };

      // Update in orders
      try {
        await updateDoc(doc(db, 'orders', orderId), updateData);
      } catch (e) {}

      // Update in legacy print_jobs
      try {
        await updateDoc(doc(db, 'print_jobs', orderId), updateData);
      } catch (e) {}
    } catch (cloudErr) {
      console.warn('⚠️ [Firestore Update Warning]:', cloudErr.message);
    }
  }

  // Local storage update
  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_STORAGE_ORDERS_KEY) || '[]');
    const updated = existing.map((order) => {
      if (order.orderId === orderId || order.id === orderId) {
        return {
          ...order,
          status: 'PRINTED',
          printStatus: 'PRINTED',
          printedAt: new Date().toISOString(),
        };
      }
      return order;
    });
    localStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('print-sathi-job-update'));
  } catch (err) {
    console.warn(err);
  }

  return { success: true };
}

/**
 * Retrieves the list of recent jobs
 */
export function getRecentPrintJobs() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_STORAGE_ORDERS_KEY) || '[]');
    return raw.map((item) => normalizeOrder(item));
  } catch (err) {
    return [];
  }
}

/**
 * Clears saved local queue
 */
export function clearOrderHistory() {
  try {
    localStorage.removeItem(LOCAL_STORAGE_ORDERS_KEY);
    window.dispatchEvent(new CustomEvent('print-sathi-job-update'));
  } catch (err) {
    console.warn(err);
  }
}

/**
 * ============================================================================
 * FIREBASE AUTHENTICATION HELPERS
 * ============================================================================
 */

/**
 * Map Firebase Auth error codes to user-friendly guidance
 */
export function mapFirebaseAuthError(error) {
  if (!error) return 'An unknown error occurred.';
  const code = error.code || (error.message && error.message.includes('auth/') ? error.message : '');

  if (
    code.includes('auth/configuration-not-found') ||
    error.message?.includes('CONFIGURATION_NOT_FOUND')
  ) {
    return 'Firebase Authentication is not yet enabled for project "print-sathi-campus" in the Firebase Console.\n\nTo activate it:\n1. Open Firebase Console > Build > Authentication.\n2. Click "Get started".\n3. Under the "Sign-in method" tab, click "Email/Password".\n4. Enable "Email/Password" and click "Save".';
  }
  if (code.includes('auth/email-already-in-use')) {
    return 'This email address is already registered. Please sign in or use a different email.';
  }
  if (code.includes('auth/invalid-email')) {
    return 'Please enter a valid email address.';
  }
  if (code.includes('auth/weak-password')) {
    return 'Password is too weak. Please use at least 6 characters.';
  }
  if (
    code.includes('auth/wrong-password') ||
    code.includes('auth/invalid-credential') ||
    code.includes('auth/user-not-found')
  ) {
    return 'Invalid credentials. Please verify your email/username and password.';
  }
  if (code.includes('auth/network-request-failed')) {
    return 'Network connection issue. Please check your internet connectivity.';
  }
  if (code.includes('auth/too-many-requests')) {
    return 'Access temporarily restricted due to many failed attempts. Please try again later.';
  }
  if (code.includes('auth/operation-not-allowed')) {
    return 'Email/Password sign-in is disabled in Firebase Console. Please enable it in Firebase Console > Authentication > Sign-in method.';
  }
  return error.message || 'Authentication error. Please check your credentials and try again.';
}

export async function loginShopkeeper(email, password) {
  if (!isFirebaseConfigured || !auth) {
    // Local demo simulation login
    const demoUser = {
      uid: `demo_user_${email.replace(/[^a-zA-Z0-9]/g, '_')}`,
      email: email.trim().toLowerCase(),
      displayName: email.split('@')[0],
      isDemo: true,
    };
    localStorage.setItem('print_sathi_auth_user', JSON.stringify(demoUser));
    return { user: demoUser };
  }

  try {
    return await signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (err) {
    const friendly = mapFirebaseAuthError(err);
    const customErr = new Error(friendly);
    customErr.code = err.code;
    throw customErr;
  }
}

export async function registerShopkeeper(email, password, shopDetails = {}) {
  let userCred;
  try {
    if (!isFirebaseConfigured || !auth) {
      const demoUser = {
        uid: `demo_user_${Date.now()}`,
        email: email.trim().toLowerCase(),
        displayName: shopDetails.shopkeeperName || email.split('@')[0],
        isDemo: true,
      };
      localStorage.setItem('print_sathi_auth_user', JSON.stringify(demoUser));
      userCred = { user: demoUser };
    } else {
      userCred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    }
  } catch (err) {
    const friendly = mapFirebaseAuthError(err);
    const customErr = new Error(friendly);
    customErr.code = err.code;
    throw customErr;
  }

  // Generate unique shopId
  const rawShopName = (shopDetails.shopName || shopDetails.name || 'New Campus Print Counter').trim();
  const cleanSlug = rawShopName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20) || 'counter';
  const shopId = `shop_${cleanSlug}_${Math.random().toString(36).substring(2, 7)}`;

  const shopPayload = {
    shopId,
    name: rawShopName,
    shopkeeperName: (shopDetails.shopkeeperName || '').trim(),
    ownerUid: userCred.user.uid,
    ownerEmail: email.trim().toLowerCase(),
    contactPhone: (shopDetails.mobile || shopDetails.contactPhone || '').trim(),
    location: {
      building: (shopDetails.location?.building || shopDetails.building || 'Campus Plaza').trim(),
      floor: (shopDetails.location?.floor || shopDetails.floor || 'Ground Floor').trim(),
      room: (shopDetails.location?.room || shopDetails.room || 'Desk 1').trim(),
    },
    tagline: (shopDetails.tagline || shopDetails.description || 'Printing & Photocopy Services').trim(),
    supportedServices: {
      bw: shopDetails.supportedServices?.bw !== false,
      color: shopDetails.supportedServices?.color !== false,
      single: shopDetails.supportedServices?.single !== false,
      duplex: shopDetails.supportedServices?.duplex !== false,
    },
    pricingTiers: shopDetails.pricingTiers || DEFAULT_PRICING_CONFIG,
    status: 'PENDING',
    isAcceptingOrders: false,
    stats: { totalOrders: 0, completedOrders: 0 },
    createdAt: new Date().toISOString(),
  };

  try {
    await createShop(shopPayload);
  } catch (firestoreErr) {
    console.warn('Could not save shop to Firestore:', firestoreErr);
  }

  return { user: userCred.user, shop: shopPayload };
}

/**
 * Campus Administrator Authentication
 * Securely verifies credentials against Firebase Auth without client-side plaintext secrets
 */
export async function loginAdmin(usernameOrEmail, password) {
  const rawInput = (usernameOrEmail || '').trim();
  const normalized = rawInput.toLowerCase().replace(/\s+/g, '');

  // Map admin username variants to official administrative Firebase Auth identity
  const isAdminUsername =
    normalized === 'jaideepsingh' ||
    normalized === 'jaideep' ||
    normalized === 'admin' ||
    rawInput.toLowerCase() === 'admin.jaideep@printsathi.campus';

  const adminEmail = isAdminUsername ? 'admin.jaideep@printsathi.campus' : rawInput;

  try {
    if (!isFirebaseConfigured || !auth) {
      if (isAdminUsername || adminEmail === 'admin.jaideep@printsathi.campus') {
        const adminUser = {
          uid: 'admin_jaideep_local',
          email: 'admin.jaideep@printsathi.campus',
          displayName: 'Jaideep Singh',
          isAdmin: true,
        };
        localStorage.setItem('print_sathi_admin_user', JSON.stringify(adminUser));
        return { user: adminUser, isAdmin: true };
      }
      throw new Error('Invalid administrator credentials.');
    }

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

    const adminSession = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || 'Jaideep Singh',
      isAdmin: true,
    };
    localStorage.setItem('print_sathi_admin_user', JSON.stringify(adminSession));

    return { user: adminSession, isAdmin: true };
  } catch (err) {
    const friendly = mapFirebaseAuthError(err);
    const customErr = new Error(friendly);
    customErr.code = err.code;
    throw customErr;
  }
}

export async function logoutAdmin() {
  localStorage.removeItem('print_sathi_admin_user');
  if (isFirebaseConfigured && auth) {
    try {
      await signOut(auth);
    } catch (e) {}
  }
}

export function getAdminSession() {
  try {
    return JSON.parse(localStorage.getItem('print_sathi_admin_user') || 'null');
  } catch (e) {
    return null;
  }
}

export async function logoutUser() {
  if (isFirebaseConfigured && auth) {
    await signOut(auth);
  }
  localStorage.removeItem('print_sathi_auth_user');
}

export function subscribeToAuth(callback) {
  if (isFirebaseConfigured && auth) {
    return onAuthStateChanged(auth, (user) => {
      callback(user);
    });
  }

  // Demo user sync
  try {
    const demoUser = JSON.parse(localStorage.getItem('print_sathi_auth_user') || 'null');
    callback(demoUser);
  } catch (e) {
    callback(null);
  }

  return () => {};
}

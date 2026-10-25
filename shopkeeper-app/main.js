/**
 * ============================================================================
 * PRINT-SATHI DESKTOP CLIENT: Electron Main Process (main.js)
 * ============================================================================
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const firebaseService = require('./services/firebaseService');
const printerService = require('./services/printerService');
const OrderProcessor = require('./services/orderProcessor');

// Unique instance ID for atomic claiming & startup recovery
const instanceId = `${os.hostname()}-${crypto.randomBytes(4).toString('hex')}`;
const processor = new OrderProcessor(instanceId);

let mainWindow = null;
let queueUnsubscribe = null;
let adminShopsUnsubscribe = null;
let currentTargetShopId = null;
let currentSession = null; // { role: 'shopkeeper' | 'admin', user: {...}, shop: {...} }

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 840,
    minWidth: 960,
    minHeight: 700,
    title: 'Print-Sathi | Unattended Station & Management Console',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startQueueSubscription() {
  if (typeof queueUnsubscribe === 'function') {
    queueUnsubscribe();
  }

  queueUnsubscribe = firebaseService.subscribeToEligibleQueue(
    currentTargetShopId,
    (queue, allDocs) => {
      processor.handleIncomingQueue(queue, allDocs);
    },
    (err) => {
      processor.log('error', `Firestore subscription error: ${err.message}`);
    },
    (rawDocs) => {
      processor.log(
        'info',
        `📡 Firestore Diagnostics: ${rawDocs.length} total orders found (Station Counter: "${currentTargetShopId}").`
      );
    }
  );
}

function startAdminSubscription() {
  if (typeof adminShopsUnsubscribe === 'function') {
    adminShopsUnsubscribe();
  }

  adminShopsUnsubscribe = firebaseService.subscribeToAllShops(
    (shops) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('admin-shops-update', shops);
      }
    },
    (err) => {
      processor.log('error', `Admin shops subscription error: ${err.message}`);
    }
  );
}

// IPC Handlers
ipcMain.handle('get-printers', async () => {
  return await printerService.getAvailablePrinters();
});

ipcMain.handle('get-status', () => {
  return {
    instanceId,
    autoPrint: processor.autoPrint,
    dryRun: processor.dryRun,
    isPaused: processor.isPaused,
    selectedPrinter: processor.selectedPrinter,
    targetShopId: currentTargetShopId,
    isProcessing: processor.isProcessing,
    activeJob: processor.activeJob,
    isConfigured: firebaseService.isConfigured,
  };
});

ipcMain.handle('set-auto-print', (_event, enabled) => {
  processor.setAutoPrint(enabled);
  return true;
});

ipcMain.handle('set-dry-run', (_event, enabled) => {
  processor.setDryRun(enabled);
  return true;
});

ipcMain.handle('set-printer', (_event, printerName) => {
  processor.setPrinter(printerName);
  return true;
});

ipcMain.handle('set-paused', (_event, paused) => {
  processor.setPaused(paused);
  return true;
});

ipcMain.handle('set-target-shop', (_event, shopId) => {
  currentTargetShopId = shopId;
  processor.setTargetShopId(shopId);
  startQueueSubscription();
  return true;
});

ipcMain.handle('get-target-shop', () => {
  return currentTargetShopId;
});

ipcMain.handle('get-queue', () => {
  return processor.getQueuePayload();
});

ipcMain.handle('open-spool-folder', async () => {
  await shell.openPath(processor.spoolDir);
  return true;
});

ipcMain.handle('retry-job', async (_event, orderId) => {
  processor.log('info', `Manually retrying Order #${orderId}...`);
  return true;
});

// ============================================================================
// AUTHENTICATION & SESSION MANAGEMENT IPC HANDLERS
// ============================================================================

ipcMain.handle('auth-login-shopkeeper', async (_event, { email, password }) => {
  try {
    const result = await firebaseService.loginShopkeeper(email, password);
    const shop = result.shop;

    if (!shop) {
      currentSession = { role: 'shopkeeper', user: result.user, shop: null };
      return { success: true, role: 'shopkeeper', user: result.user, shop: null, status: 'NO_SHOP' };
    }

    currentSession = { role: 'shopkeeper', user: result.user, shop };

    if (shop.status === 'APPROVED') {
      currentTargetShopId = shop.shopId;
      processor.setTargetShopId(shop.shopId);
      startQueueSubscription();
      processor.log('success', `Counter "${shop.name}" (${shop.shopId}) activated. Spooler listening.`);
    } else {
      processor.log('info', `Counter "${shop.name}" logged in with status: ${shop.status}.`);
    }

    return { success: true, role: 'shopkeeper', user: result.user, shop, status: shop.status };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth-register-shopkeeper', async (_event, registrationData) => {
  try {
    const result = await firebaseService.registerShopkeeper(registrationData);
    currentSession = { role: 'shopkeeper', user: result.user, shop: result.shop };
    processor.log('info', `New counter registered: "${result.shop.name}". Status: PENDING.`);
    return { success: true, role: 'shopkeeper', user: result.user, shop: result.shop, status: 'PENDING' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth-check-shop-status', async (_event, shopId) => {
  try {
    const shop = await firebaseService.getShopById(shopId);
    if (shop) {
      if (currentSession && currentSession.role === 'shopkeeper') {
        currentSession.shop = shop;
      }
      if (shop.status === 'APPROVED' && (!currentTargetShopId || currentTargetShopId !== shop.shopId)) {
        currentTargetShopId = shop.shopId;
        processor.setTargetShopId(shop.shopId);
        startQueueSubscription();
        processor.log('success', `Counter "${shop.name}" approved! Spooler queue activated.`);
      }
      return { success: true, shop };
    }
    return { success: false, error: 'Shop not found' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth-login-admin', async (_event, { usernameOrEmail, password }) => {
  try {
    const result = await firebaseService.loginAdmin(usernameOrEmail, password);
    currentSession = { role: 'admin', user: result.user };
    startAdminSubscription();
    processor.log('success', `Administrator ${result.user.displayName} signed in.`);
    return { success: true, role: 'admin', user: result.user };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth-logout', async () => {
  if (typeof queueUnsubscribe === 'function') {
    queueUnsubscribe();
    queueUnsubscribe = null;
  }
  if (typeof adminShopsUnsubscribe === 'function') {
    adminShopsUnsubscribe();
    adminShopsUnsubscribe = null;
  }
  currentSession = null;
  currentTargetShopId = null;
  await firebaseService.logout();
  processor.log('info', 'Active session signed out.');
  return { success: true };
});

ipcMain.handle('auth-get-session', () => {
  return currentSession;
});

// ============================================================================
// ADMINISTRATOR OPERATIONS IPC HANDLERS
// ============================================================================

ipcMain.handle('admin-get-shops', async () => {
  return await firebaseService.getAllShops();
});

ipcMain.handle('admin-update-shop-status', async (_event, { shopId, status, rejectionReason }) => {
  return await firebaseService.updateShopStatus(shopId, status, rejectionReason);
});

ipcMain.handle('admin-create-shop', async (_event, shopData) => {
  return await firebaseService.createShopByAdmin(shopData);
});

app.whenReady().then(async () => {
  createWindow();

  // Forward processor events to UI
  processor.on('log', (logItem) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('log-message', logItem);
    }
  });

  processor.on('statusChange', (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('status-update', status);
    }
  });

  processor.on('queueChange', (queue) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('queue-update', queue);
    }
  });

  // Initialize processor (recovers interrupted jobs, detects Windows printers)
  await processor.init();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (typeof queueUnsubscribe === 'function') {
    queueUnsubscribe();
    queueUnsubscribe = null;
  }
  if (typeof adminShopsUnsubscribe === 'function') {
    adminShopsUnsubscribe();
    adminShopsUnsubscribe = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

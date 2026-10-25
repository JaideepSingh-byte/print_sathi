/**
 * ============================================================================
 * PRINT-SATHI DESKTOP CLIENT: Unified Renderer Controller (renderer.js)
 * ============================================================================
 * 
 * Integrated Interfaces inside Electron:
 * 1. Authentication & Role Selection (Shopkeeper vs Administrator)
 * 2. Counter Pending Approval / Verification View
 * 3. Shopkeeper Desk Console & Live Spooler Queue
 * 4. Campus Administrator Audit & Operations Portal
 */

// ----------------------------------------------------------------------------
// VIEW DOM CONTAINERS
// ----------------------------------------------------------------------------
const authView = document.getElementById('authView');
const pendingView = document.getElementById('pendingView');
const deskConsoleView = document.getElementById('deskConsoleView');
const adminPortalView = document.getElementById('adminPortalView');

// ----------------------------------------------------------------------------
// AUTHENTICATION DOM ELEMENTS
// ----------------------------------------------------------------------------
const tabRoleShopkeeper = document.getElementById('tabRoleShopkeeper');
const tabRoleAdmin = document.getElementById('tabRoleAdmin');
const shopkeeperLoginPanel = document.getElementById('shopkeeperLoginPanel');
const adminLoginPanel = document.getElementById('adminLoginPanel');
const shopkeeperRegisterPanel = document.getElementById('shopkeeperRegisterPanel');
const authAlert = document.getElementById('authAlert');

const shopkeeperLoginForm = document.getElementById('shopkeeperLoginForm');
const shopkeeperEmail = document.getElementById('shopkeeperEmail');
const shopkeeperPassword = document.getElementById('shopkeeperPassword');
const toggleShopkeeperPw = document.getElementById('toggleShopkeeperPw');
const btnShopkeeperLogin = document.getElementById('btnShopkeeperLogin');
const btnShowRegister = document.getElementById('btnShowRegister');
const btnCancelRegister = document.getElementById('btnCancelRegister');

const adminLoginForm = document.getElementById('adminLoginForm');
const adminUsername = document.getElementById('adminUsername');
const adminPassword = document.getElementById('adminPassword');
const toggleAdminPw = document.getElementById('toggleAdminPw');
const btnAdminLogin = document.getElementById('btnAdminLogin');

const shopkeeperRegisterForm = document.getElementById('shopkeeperRegisterForm');

// ----------------------------------------------------------------------------
// PENDING APPROVAL DOM ELEMENTS
// ----------------------------------------------------------------------------
const pendingStatusIcon = document.getElementById('pendingStatusIcon');
const pendingStatusBadge = document.getElementById('pendingStatusBadge');
const pendingShopTitle = document.getElementById('pendingShopTitle');
const pendingShopMsg = document.getElementById('pendingShopMsg');
const pendingDetailsName = document.getElementById('pendingDetailsName');
const pendingDetailsLocation = document.getElementById('pendingDetailsLocation');
const pendingDetailsOwner = document.getElementById('pendingDetailsOwner');
const pendingDetailsStatus = document.getElementById('pendingDetailsStatus');
const btnCheckShopStatus = document.getElementById('btnCheckShopStatus');
const btnPendingLogout = document.getElementById('btnPendingLogout');

// ----------------------------------------------------------------------------
// DESK CONSOLE DOM ELEMENTS
// ----------------------------------------------------------------------------
const deskShopBadgeName = document.getElementById('deskShopBadgeName');
const deskShopLocationPill = document.getElementById('deskShopLocationPill');
const deskVerifiedShopSub = document.getElementById('deskVerifiedShopSub');
const btnDeskLogout = document.getElementById('btnDeskLogout');

const shopSelect = document.getElementById('shopSelect');
const printerSelect = document.getElementById('printerSelect');
const toggleAutoPrintBtn = document.getElementById('toggleAutoPrintBtn');
const autoPrintText = document.getElementById('autoPrintText');
const toggleDryRunBtn = document.getElementById('toggleDryRunBtn');
const dryRunText = document.getElementById('dryRunText');
const pauseQueueBtn = document.getElementById('pauseQueueBtn');
const openFolderBtn = document.getElementById('openFolderBtn');
const clearLogsBtn = document.getElementById('clearLogsBtn');

const tabPendingBtn = document.getElementById('tabPendingBtn');
const tabCompletedBtn = document.getElementById('tabCompletedBtn');
const queueSubtext = document.getElementById('queueSubtext');

const activeJobSection = document.getElementById('activeJobSection');
const activeJobTitle = document.getElementById('activeJobTitle');
const activeJobFile = document.getElementById('activeJobFile');
const activeJobCopies = document.getElementById('activeJobCopies');
const activeJobColor = document.getElementById('activeJobColor');
const activeJobSides = document.getElementById('activeJobSides');
const activeJobPages = document.getElementById('activeJobPages');

const queueTableBody = document.getElementById('queueTableBody');
const queueCount = document.getElementById('queueCount');
const completedCount = document.getElementById('completedCount');
const logFeed = document.getElementById('logFeed');

const firebaseBadge = document.getElementById('firebaseBadge');
const firebaseStatusText = document.getElementById('firebaseStatusText');
const modeBadge = document.getElementById('modeBadge');

// ----------------------------------------------------------------------------
// ADMINISTRATOR PORTAL DOM ELEMENTS
// ----------------------------------------------------------------------------
const adminDisplayName = document.getElementById('adminDisplayName');
const btnAdminLogout = document.getElementById('btnAdminLogout');
const adminTabPending = document.getElementById('adminTabPending');
const adminTabApproved = document.getElementById('adminTabApproved');
const adminTabSuspended = document.getElementById('adminTabSuspended');
const adminTabRejected = document.getElementById('adminTabRejected');
const adminTabAll = document.getElementById('adminTabAll');
const adminTabProvision = document.getElementById('adminTabProvision');
const countPending = document.getElementById('countPending');
const countApproved = document.getElementById('countApproved');
const countSuspended = document.getElementById('countSuspended');
const countRejected = document.getElementById('countRejected');
const countAll = document.getElementById('countAll');
const adminSearchInput = document.getElementById('adminSearchInput');

const adminShopsSection = document.getElementById('adminShopsSection');
const adminShopsList = document.getElementById('adminShopsList');
const adminProvisionSection = document.getElementById('adminProvisionSection');
const adminProvisionForm = document.getElementById('adminProvisionForm');
const btnCancelProvision = document.getElementById('btnCancelProvision');

const rejectionModal = document.getElementById('rejectionModal');
const rejectionModalShopName = document.getElementById('rejectionModalShopName');
const rejectionReasonInput = document.getElementById('rejectionReasonInput');
const btnConfirmReject = document.getElementById('btnConfirmReject');
const btnCancelRejectModal = document.getElementById('btnCancelRejectModal');

// ----------------------------------------------------------------------------
// CLIENT STATE
// ----------------------------------------------------------------------------
let currentSession = null;
let currentShop = null;
let currentAdminTab = 'pending';
let adminAllShops = [];
let pendingRejectShopId = null;

let currentDeskStatus = {
  autoPrint: true,
  dryRun: true,
  isPaused: false,
  selectedPrinter: '',
  targetShopId: '',
  isProcessing: false,
  activeJob: null,
};
let currentDeskTab = 'pending';
let cachedPendingJobs = [];
let cachedCompletedJobs = [];

// ============================================================================
// 1. VIEW SWITCHER
// ============================================================================
function switchView(target) {
  authView.classList.toggle('hidden', target !== 'auth');
  pendingView.classList.toggle('hidden', target !== 'pending');
  deskConsoleView.classList.toggle('hidden', target !== 'desk');
  adminPortalView.classList.toggle('hidden', target !== 'admin');

  // Strict modal isolation: always close administrative dialogs when views change
  if (rejectionModal) {
    rejectionModal.classList.add('hidden');
    pendingRejectShopId = null;
    if (rejectionReasonInput) rejectionReasonInput.value = '';
  }
}

function showAuthAlert(msg, type = 'error') {
  authAlert.className = `auth-alert ${type}`;
  authAlert.textContent = msg;
  authAlert.classList.remove('hidden');
}

function hideAuthAlert() {
  authAlert.classList.add('hidden');
  authAlert.textContent = '';
}

// ============================================================================
// 2. AUTHENTICATION & ROLE SWITCHER
// ============================================================================
tabRoleShopkeeper.addEventListener('click', () => {
  tabRoleShopkeeper.classList.add('active');
  tabRoleAdmin.classList.remove('active');
  shopkeeperLoginPanel.classList.remove('hidden');
  adminLoginPanel.classList.add('hidden');
  shopkeeperRegisterPanel.classList.add('hidden');
  hideAuthAlert();
});

tabRoleAdmin.addEventListener('click', () => {
  tabRoleAdmin.classList.add('active');
  tabRoleShopkeeper.classList.remove('active');
  adminLoginPanel.classList.remove('hidden');
  shopkeeperLoginPanel.classList.add('hidden');
  shopkeeperRegisterPanel.classList.add('hidden');
  hideAuthAlert();
});

btnShowRegister.addEventListener('click', () => {
  shopkeeperLoginPanel.classList.add('hidden');
  shopkeeperRegisterPanel.classList.remove('hidden');
  hideAuthAlert();
});

btnCancelRegister.addEventListener('click', () => {
  shopkeeperRegisterPanel.classList.add('hidden');
  shopkeeperLoginPanel.classList.remove('hidden');
  hideAuthAlert();
});

// Password toggles
toggleShopkeeperPw.addEventListener('click', () => {
  const isPw = shopkeeperPassword.type === 'password';
  shopkeeperPassword.type = isPw ? 'text' : 'password';
  toggleShopkeeperPw.textContent = isPw ? '🙈' : '👁️';
});

toggleAdminPw.addEventListener('click', () => {
  const isPw = adminPassword.type === 'password';
  adminPassword.type = isPw ? 'text' : 'password';
  toggleAdminPw.textContent = isPw ? '🙈' : '👁️';
});

// Shopkeeper Login Handler
shopkeeperLoginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAuthAlert();

  const email = shopkeeperEmail.value.trim();
  const password = shopkeeperPassword.value;

  btnShopkeeperLogin.disabled = true;
  btnShopkeeperLogin.innerHTML = '<span>Verifying Credentials...</span>';

  try {
    const res = await window.desktopAPI.loginShopkeeper(email, password);

    if (!res.success) {
      showAuthAlert(res.error || 'Authentication failed. Please verify email and password.', 'error');
      return;
    }

    currentSession = { role: 'shopkeeper', user: res.user, shop: res.shop };
    currentShop = res.shop;

    if (!res.shop) {
      showAuthAlert('Account verified, but no campus counter was found. Please register your counter.', 'info');
      shopkeeperLoginPanel.classList.add('hidden');
      shopkeeperRegisterPanel.classList.remove('hidden');
      document.getElementById('regEmail').value = res.user.email;
      return;
    }

    if (res.shop.status === 'APPROVED') {
      activateDeskConsole(res.shop, res.user);
    } else {
      activatePendingView(res.shop);
    }
  } catch (err) {
    showAuthAlert(err.message || 'Error communicating with desktop authentication service.', 'error');
  } finally {
    btnShopkeeperLogin.disabled = false;
    btnShopkeeperLogin.innerHTML = '<span>Sign In to Desk Console</span>';
  }
});

// Shopkeeper Registration Handler
shopkeeperRegisterForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAuthAlert();

  const fullName = document.getElementById('regFullName').value.trim();
  const mobile = document.getElementById('regMobile').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirmPassword = document.getElementById('regConfirmPassword').value;

  if (password !== confirmPassword) {
    showAuthAlert('Passwords do not match. Please verify both password fields.', 'error');
    return;
  }

  const shopName = document.getElementById('regShopName').value.trim();
  const building = document.getElementById('regBuilding').value.trim();
  const floor = document.getElementById('regFloor').value;
  const room = document.getElementById('regRoom').value.trim();

  const tierRates = {
    bw_single_t1: parseFloat(document.getElementById('rate_bw_s_t1').value) || 2.0,
    bw_duplex_t1: parseFloat(document.getElementById('rate_bw_d_t1').value) || 1.5,
    col_single_t1: parseFloat(document.getElementById('rate_col_s_t1').value) || 10.0,
    col_duplex_t1: parseFloat(document.getElementById('rate_col_d_t1').value) || 8.0,
    bw_single_t2: parseFloat(document.getElementById('rate_bw_s_t2').value) || 1.75,
    bw_duplex_t2: parseFloat(document.getElementById('rate_bw_d_t2').value) || 1.25,
    col_single_t2: parseFloat(document.getElementById('rate_col_s_t2').value) || 8.0,
    col_duplex_t2: parseFloat(document.getElementById('rate_col_d_t2').value) || 6.0,
    bw_single_t3: parseFloat(document.getElementById('rate_bw_s_t3').value) || 1.5,
    bw_duplex_t3: parseFloat(document.getElementById('rate_bw_d_t3').value) || 1.0,
    col_single_t3: parseFloat(document.getElementById('rate_col_s_t3').value) || 6.0,
    col_duplex_t3: parseFloat(document.getElementById('rate_col_d_t3').value) || 5.0,
  };

  const payload = {
    fullName,
    mobile,
    email,
    password,
    shopName,
    building,
    floor,
    room,
    tierRates,
    services: { bw: true, color: true, single: true, duplex: true },
  };

  const btnSubmit = document.getElementById('btnSubmitRegistration');
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = '<span>Submitting Registration...</span>';

  try {
    const res = await window.desktopAPI.registerShopkeeper(payload);
    if (!res.success) {
      showAuthAlert(res.error || 'Failed to submit registration.', 'error');
      return;
    }

    currentSession = { role: 'shopkeeper', user: res.user, shop: res.shop };
    currentShop = res.shop;
    activatePendingView(res.shop);
  } catch (err) {
    showAuthAlert(err.message || 'Registration error occurred.', 'error');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = '<span>Submit Counter Registration</span>';
  }
});

// Administrator Login Handler
adminLoginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAuthAlert();

  const username = adminUsername.value.trim();
  const password = adminPassword.value;

  btnAdminLogin.disabled = true;
  btnAdminLogin.innerHTML = '<span>Verifying Administrator Identity...</span>';

  try {
    const res = await window.desktopAPI.loginAdmin(username, password);

    if (!res.success) {
      showAuthAlert(res.error || 'Administrator authentication failed.', 'error');
      return;
    }

    currentSession = { role: 'admin', user: res.user };
    activateAdminPortal(res.user);
  } catch (err) {
    showAuthAlert(err.message || 'Administrator sign-in error.', 'error');
  } finally {
    btnAdminLogin.disabled = false;
    btnAdminLogin.innerHTML = '<span>Sign In as Campus Administrator</span>';
  }
});

// ============================================================================
// 3. PENDING APPROVAL VIEW LOGIC
// ============================================================================
function activatePendingView(shop) {
  currentShop = shop;
  pendingDetailsName.textContent = shop.name || 'Unnamed Counter';
  pendingDetailsLocation.textContent = `${shop.location?.building || 'Campus Plaza'}, ${shop.location?.floor || 'Ground'}`;
  pendingDetailsOwner.textContent = `${shop.ownerName || 'Staff'} (${shop.contactPhone || shop.ownerEmail || ''})`;
  pendingDetailsStatus.textContent = (shop.status || 'PENDING').toUpperCase();

  if (shop.status === 'REJECTED') {
    pendingStatusIcon.textContent = '❌';
    pendingStatusBadge.className = 'badge badge-danger';
    pendingStatusBadge.textContent = 'Registration Rejected';
    pendingShopTitle.textContent = 'Registration Rejected';
    pendingShopMsg.textContent = shop.rejectionReason
      ? `Reason: ${shop.rejectionReason}`
      : 'This counter registration was rejected by the campus administrator.';
  } else if (shop.status === 'SUSPENDED') {
    pendingStatusIcon.textContent = '⏸️';
    pendingStatusBadge.className = 'badge badge-warning';
    pendingStatusBadge.textContent = 'Counter Suspended';
    pendingShopTitle.textContent = 'Station Suspended';
    pendingShopMsg.textContent = 'This print counter has been temporarily suspended by campus operations.';
  } else {
    pendingStatusIcon.textContent = '⏳';
    pendingStatusBadge.className = 'badge badge-warning';
    pendingStatusBadge.textContent = 'Awaiting Administrator Review';
    pendingShopTitle.textContent = 'Registration Submitted';
    pendingShopMsg.textContent =
      'Your campus print counter has been registered and submitted. Campus administrator Jaideep Singh will review your location and custom rates.';
  }

  switchView('pending');
}

btnCheckShopStatus.addEventListener('click', async () => {
  if (!currentShop?.shopId) return;

  btnCheckShopStatus.disabled = true;
  btnCheckShopStatus.textContent = 'Checking Status...';

  try {
    const res = await window.desktopAPI.checkShopStatus(currentShop.shopId);
    if (res.success && res.shop) {
      currentShop = res.shop;
      if (res.shop.status === 'APPROVED') {
        activateDeskConsole(res.shop, currentSession?.user);
      } else {
        activatePendingView(res.shop);
        alert(`Current status is: ${res.shop.status}`);
      }
    }
  } catch (err) {
    alert(`Could not verify status: ${err.message}`);
  } finally {
    btnCheckShopStatus.disabled = false;
    btnCheckShopStatus.textContent = '🔄 Refresh Approval Status';
  }
});

btnPendingLogout.addEventListener('click', handleLogout);

// ============================================================================
// 4. DESK CONSOLE & SPOOLER LOGIC
// ============================================================================
async function activateDeskConsole(shop, user) {
  currentShop = shop;
  deskShopBadgeName.textContent = `🏪 ${shop.name}`;
  deskShopLocationPill.textContent = `${shop.location?.building || 'Plaza'}, ${shop.location?.floor || 'Ground'}`;
  deskVerifiedShopSub.textContent = `Counter Operator: ${user?.displayName || shop.ownerName} (${user?.email || shop.ownerEmail})`;

  shopSelect.innerHTML = `<option value="${shop.shopId}">Counter: ${shop.name} (${shop.location?.building || ''})</option>`;
  shopSelect.value = shop.shopId;

  // Initialize hardware printer discovery, queue & spooler status
  try {
    const status = await window.desktopAPI.getStatus();
    updateDeskStatusUI(status);

    const { printers, defaultPrinter } = await window.desktopAPI.getPrinters();
    populatePrinters(printers, status.selectedPrinter || defaultPrinter);

    // Immediately fetch initial queue snapshot on console activation
    if (typeof window.desktopAPI.getQueue === 'function') {
      try {
        const initialQueue = await window.desktopAPI.getQueue();
        if (initialQueue) {
          handleQueueDataUpdate(initialQueue);
        }
      } catch (queueErr) {
        console.warn('Initial queue fetch error:', queueErr);
      }
    }

    if (status.isConfigured) {
      firebaseBadge.className = 'badge badge-success';
      firebaseStatusText.textContent = 'Firebase: Connected';
    } else {
      firebaseBadge.className = 'badge badge-warning';
      firebaseStatusText.textContent = 'Demo Mode (Offline)';
    }
  } catch (err) {
    console.warn('Init Desk error:', err);
  }

  switchView('desk');
}

btnDeskLogout.addEventListener('click', handleLogout);

function populatePrinters(printers, selected) {
  printerSelect.innerHTML = '';
  if (!printers || printers.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No Windows printers detected';
    printerSelect.appendChild(opt);
    return;
  }

  printers.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === selected) opt.selected = true;
    printerSelect.appendChild(opt);
  });
}

function updateDeskStatusUI(status) {
  currentDeskStatus = { ...currentDeskStatus, ...status };

  if (currentDeskStatus.autoPrint) {
    toggleAutoPrintBtn.className = 'toggle-btn active';
    autoPrintText.textContent = 'Auto-Print: ON';
  } else {
    toggleAutoPrintBtn.className = 'toggle-btn';
    autoPrintText.textContent = 'Auto-Print: OFF (Manual)';
  }

  if (currentDeskStatus.dryRun) {
    toggleDryRunBtn.className = 'toggle-btn dryrun-active';
    dryRunText.textContent = 'Dry-Run: ON (Safe)';
    modeBadge.className = 'badge badge-warning';
    modeBadge.innerHTML = '<span>🛡️ DRY-RUN: Virtual Spooling</span>';
  } else {
    toggleDryRunBtn.className = 'toggle-btn';
    dryRunText.textContent = 'Dry-Run: OFF (Live Hardware)';
    modeBadge.className = 'badge badge-danger';
    modeBadge.innerHTML = '<span>🖨️ LIVE: Hardware Paper Spooler</span>';
  }

  if (currentDeskStatus.isPaused) {
    pauseQueueBtn.innerHTML = '▶️ Resume';
    pauseQueueBtn.className = 'action-btn active';
  } else {
    pauseQueueBtn.innerHTML = '⏸️ Pause';
    pauseQueueBtn.className = 'action-btn warning-btn';
  }

  if (currentDeskStatus.activeJob) {
    activeJobSection.classList.remove('hidden');
    const job = currentDeskStatus.activeJob;
    activeJobTitle.textContent = `Printing Order #${job.orderId || 'PS-0000'} (Token: ${job.token || '0000'})`;
    activeJobFile.textContent = `📄 ${job.fileName || 'document.pdf'}`;
    activeJobCopies.textContent = `📑 ${job.copies || 1} Copy`;
    activeJobColor.textContent = job.colorMode === 'color' ? '🎨 Full Color' : '🎨 B&W Grayscale';
    activeJobSides.textContent = job.sides === 'double' ? '🔄 Double-Sided' : '🔄 Single-Sided';
    activeJobPages.textContent = `📊 ${job.calculatedPages || 1} Sheets`;
  } else {
    activeJobSection.classList.add('hidden');
  }
}

// Spooler Action Controls
toggleAutoPrintBtn.addEventListener('click', async () => {
  const next = !currentDeskStatus.autoPrint;
  await window.desktopAPI.setAutoPrint(next);
  currentDeskStatus.autoPrint = next;
  updateDeskStatusUI(currentDeskStatus);
});

toggleDryRunBtn.addEventListener('click', async () => {
  const next = !currentDeskStatus.dryRun;
  if (!next) {
    const confirmLive = confirm(
      '⚠️ WARNING: Disabling Dry-Run Mode!\n\nPrint jobs will be sent directly to your Windows physical printer tray and consume actual paper and ink.\n\nProceed?'
    );
    if (!confirmLive) return;
  }
  await window.desktopAPI.setDryRun(next);
  currentDeskStatus.dryRun = next;
  updateDeskStatusUI(currentDeskStatus);
});

printerSelect.addEventListener('change', async (e) => {
  const selected = e.target.value;
  await window.desktopAPI.setPrinter(selected);
  currentDeskStatus.selectedPrinter = selected;
});

pauseQueueBtn.addEventListener('click', async () => {
  const next = !currentDeskStatus.isPaused;
  await window.desktopAPI.setPaused(next);
  currentDeskStatus.isPaused = next;
  updateDeskStatusUI(currentDeskStatus);
});

openFolderBtn.addEventListener('click', async () => {
  await window.desktopAPI.openSpoolFolder();
});

clearLogsBtn.addEventListener('click', () => {
  logFeed.innerHTML = '';
});

tabPendingBtn.addEventListener('click', () => {
  currentDeskTab = 'pending';
  tabPendingBtn.classList.add('active');
  tabCompletedBtn.classList.remove('active');
  queueSubtext.textContent = 'Auto-processed in FIFO order';
  renderQueueTable(cachedPendingJobs);
});

tabCompletedBtn.addEventListener('click', () => {
  currentDeskTab = 'completed';
  tabCompletedBtn.classList.add('active');
  tabPendingBtn.classList.remove('active');
  queueSubtext.textContent = 'Archived print history for this session';
  renderQueueTable(cachedCompletedJobs);
});

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

function renderQueueTable(jobs) {
  queueTableBody.innerHTML = '';

  if (!jobs || jobs.length === 0) {
    const emptyMsg =
      currentDeskTab === 'pending'
        ? 'Queue is empty. Waiting for student paid print jobs...'
        : 'No completed print jobs yet in this session.';
    queueTableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">
          <div class="empty-state">
            <span class="empty-icon">☕</span>
            <p>${emptyMsg}</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  jobs.forEach((job) => {
    const tr = document.createElement('tr');
    const token = job.token || (job.orderId || '').replace(/^PS-/, '') || '0000';
    const isCompleted = job.status === 'COMPLETED' || job.status === 'PRINTED';

    let filesSummary = job.fileName || 'document.pdf';
    let filesTooltip = filesSummary;
    if (Array.isArray(job.files) && job.files.length > 0) {
      if (job.files.length === 1) {
        const singleF = job.files[0];
        filesSummary = `${singleF.fileName} [${singleF.pageRangeString || 'All'}]`;
        filesTooltip = `${singleF.fileName} (${singleF.pageRangeString || 'All'}, ${singleF.copies || 1}x, ${singleF.colorMode === 'color' ? 'Color' : 'B&W'}, ${singleF.sides === 'double' ? 'Duplex' : 'Single'})`;
      } else {
        filesSummary = `${job.files.length} PDFs: ${job.files.map((f) => `${f.fileName} [${f.pageRangeString || 'All'}]`).join(', ')}`;
        filesTooltip = job.files
          .map(
            (f, i) =>
              `${i + 1}. ${f.fileName} (${f.pageRangeString || 'All'}, ${f.copies || 1}x, ${f.colorMode === 'color' ? 'Color' : 'B&W'}, ${f.sides === 'double' ? 'Duplex' : 'Single'})`
          )
          .join('\n');
      }
    }

    const modeSummary = `${job.copies || 1}x • ${job.colorMode === 'color' ? '🎨 Color' : 'B&W'} • ${job.sides === 'double' ? 'Duplex' : '1-side'}`;
    const sheets = job.calculatedPages || job.pricingSnapshot?.totalSheets || 1;
    const timeString = formatJobTime(job.createdAt || job.claimedAt || job.printCompletedAt);

    tr.innerHTML = `
      <td class="token-cell">${escapeHtml(token)}</td>
      <td title="${escapeHtml(filesTooltip)}" style="max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        📄 ${escapeHtml(filesSummary)}
      </td>
      <td>${escapeHtml(modeSummary)}</td>
      <td style="font-family: var(--font-mono); font-weight: 700;">${sheets}</td>
      <td style="color: var(--text-muted); font-size: 0.78rem;">${timeString}</td>
    `;
    queueTableBody.appendChild(tr);
  });
}

function addLogEntry(item) {
  const el = document.createElement('div');
  el.className = `log-entry ${item.level}`;
  el.innerHTML = `
    <span class="log-time">[${item.timestamp}]</span>
    <span class="log-msg">${escapeHtml(item.message)}</span>
  `;
  logFeed.appendChild(el);
  logFeed.scrollTop = logFeed.scrollHeight;
}

function handleQueueDataUpdate(queueData) {
  if (!queueData) return;

  let pending = [];
  let completed = [];

  if (Array.isArray(queueData)) {
    const pendingStatuses = ['QUEUED', 'PENDING', 'PRINTING', 'PRINT_SUBMITTED', 'NEEDS_VERIFICATION'];
    pending = queueData.filter((o) => {
      const s = (o.status || '').toUpperCase();
      const ps = (o.printStatus || '').toUpperCase();
      return pendingStatuses.includes(s) || pendingStatuses.includes(ps);
    });
    completed = queueData.filter((o) => {
      const s = (o.status || '').toUpperCase();
      const ps = (o.printStatus || '').toUpperCase();
      return s === 'COMPLETED' || s === 'PRINTED' || ps === 'COMPLETED';
    });
  } else if (typeof queueData === 'object') {
    if (Array.isArray(queueData.pending)) {
      pending = queueData.pending;
    }
    if (Array.isArray(queueData.completed)) {
      completed = queueData.completed;
    }
    if (!Array.isArray(queueData.pending) && Array.isArray(queueData.all)) {
      const pendingStatuses = ['QUEUED', 'PENDING', 'PRINTING', 'PRINT_SUBMITTED', 'NEEDS_VERIFICATION'];
      pending = queueData.all.filter((o) => {
        const s = (o.status || '').toUpperCase();
        const ps = (o.printStatus || '').toUpperCase();
        return pendingStatuses.includes(s) || pendingStatuses.includes(ps);
      });
      completed = queueData.all.filter((o) => {
        const s = (o.status || '').toUpperCase();
        const ps = (o.printStatus || '').toUpperCase();
        return s === 'COMPLETED' || s === 'PRINTED' || ps === 'COMPLETED';
      });
    }
  }

  cachedPendingJobs = pending;
  cachedCompletedJobs = completed;

  queueCount.textContent = pending.length.toString();
  completedCount.textContent = completed.length.toString();

  if (currentDeskTab === 'pending') {
    renderQueueTable(pending);
  } else {
    renderQueueTable(completed);
  }
}

// Spooler Event Subscriptions from main process
window.desktopAPI.onQueueUpdate((queueData) => {
  handleQueueDataUpdate(queueData);
});

window.desktopAPI.onStatusUpdate((status) => {
  updateDeskStatusUI(status);
});

window.desktopAPI.onLog((logItem) => {
  addLogEntry(logItem);
});

// ============================================================================
// 5. ADMINISTRATOR PORTAL LOGIC
// ============================================================================
async function activateAdminPortal(user) {
  adminDisplayName.textContent = user?.displayName || 'Jaideep Singh';

  try {
    const shops = await window.desktopAPI.adminGetShops();
    adminAllShops = shops;
    updateAdminTabCounts(shops);
    renderAdminShops(shops);
  } catch (err) {
    console.warn('Error fetching admin shops:', err);
  }

  switchView('admin');
}

btnAdminLogout.addEventListener('click', handleLogout);

// Listen to real-time shop updates from Electron main process
window.desktopAPI.onAdminShopsUpdate((shops) => {
  adminAllShops = shops;
  updateAdminTabCounts(shops);
  renderAdminShops(shops);
});

function updateAdminTabCounts(shops) {
  const pending = shops.filter((s) => s.status === 'PENDING').length;
  const approved = shops.filter((s) => s.status === 'APPROVED').length;
  const suspended = shops.filter((s) => s.status === 'SUSPENDED').length;
  const rejected = shops.filter((s) => s.status === 'REJECTED').length;

  countPending.textContent = pending;
  countApproved.textContent = approved;
  countSuspended.textContent = suspended;
  countRejected.textContent = rejected;
  countAll.textContent = shops.length;
}

// Admin Tab Filters
const adminTabs = [
  { el: adminTabPending, tab: 'pending' },
  { el: adminTabApproved, tab: 'approved' },
  { el: adminTabSuspended, tab: 'suspended' },
  { el: adminTabRejected, tab: 'rejected' },
  { el: adminTabAll, tab: 'all' },
  { el: adminTabProvision, tab: 'provision' },
];

adminTabs.forEach(({ el, tab }) => {
  el.addEventListener('click', () => {
    adminTabs.forEach((t) => t.el.classList.remove('active'));
    el.classList.add('active');
    currentAdminTab = tab;

    if (tab === 'provision') {
      adminShopsSection.classList.add('hidden');
      adminProvisionSection.classList.remove('hidden');
    } else {
      adminShopsSection.classList.remove('hidden');
      adminProvisionSection.classList.add('hidden');
      renderAdminShops(adminAllShops);
    }
  });
});

btnCancelProvision.addEventListener('click', () => {
  adminTabApproved.click();
});

adminSearchInput.addEventListener('input', () => {
  renderAdminShops(adminAllShops);
});

function renderAdminShops(shops) {
  if (currentAdminTab === 'provision') return;

  const query = adminSearchInput.value.toLowerCase().trim();

  let filtered = shops.filter((s) => {
    if (currentAdminTab === 'pending') return s.status === 'PENDING';
    if (currentAdminTab === 'approved') return s.status === 'APPROVED';
    if (currentAdminTab === 'suspended') return s.status === 'SUSPENDED';
    if (currentAdminTab === 'rejected') return s.status === 'REJECTED';
    return true; // 'all'
  });

  if (query) {
    filtered = filtered.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(query) ||
        (s.location?.building || '').toLowerCase().includes(query) ||
        (s.ownerName || '').toLowerCase().includes(query)
    );
  }

  adminShopsList.innerHTML = '';

  if (filtered.length === 0) {
    adminShopsList.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg);">
        <span style="font-size: 2.2rem;">🔍</span>
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-top: 0.5rem;">No counters found</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem;">No counters match the "${currentAdminTab}" filter.</p>
      </div>
    `;
    return;
  }

  filtered.forEach((shop) => {
    const card = document.createElement('div');
    card.className = 'shop-audit-card';

    const statusBadgeClass =
      shop.status === 'APPROVED' ? 'badge-success' : shop.status === 'PENDING' ? 'badge-warning' : 'badge-danger';

    let actionButtons = '';
    if (shop.status === 'PENDING') {
      actionButtons = `
        <button class="btn-approve" onclick="handleAdminApprove('${shop.shopId}', '${escapeHtml(shop.name)}')">
          ✅ Approve & Activate
        </button>
        <button class="btn-reject" onclick="openRejectModal('${shop.shopId}', '${escapeHtml(shop.name)}')">
          ❌ Reject with Reason
        </button>
      `;
    } else if (shop.status === 'APPROVED') {
      actionButtons = `
        <button class="btn-suspend" onclick="handleAdminSuspend('${shop.shopId}', '${escapeHtml(shop.name)}')">
          ⏸️ Suspend Counter
        </button>
      `;
    } else if (shop.status === 'SUSPENDED' || shop.status === 'REJECTED') {
      actionButtons = `
        <button class="btn-approve" onclick="handleAdminApprove('${shop.shopId}', '${escapeHtml(shop.name)}')">
          ▶️ Reactivate Counter
        </button>
      `;
    }

    const rates = shop.pricingTiers || {};
    const ratePreview = `B&W: ₹${rates.bw_single_t1 || '2.0'} / Color: ₹${rates.col_single_t1 || '10.0'}`;

    card.innerHTML = `
      <div>
        <div class="card-header-row">
          <div>
            <h4 class="card-shop-name">${escapeHtml(shop.name)}</h4>
            <p class="card-loc">📍 ${escapeHtml(shop.location?.building || 'Campus Plaza')}, ${escapeHtml(shop.location?.floor || 'Ground')}</p>
          </div>
          <span class="badge ${statusBadgeClass}">${shop.status || 'PENDING'}</span>
        </div>

        <div class="card-meta-box" style="margin-top: 0.75rem;">
          <div><strong>Operator:</strong> ${escapeHtml(shop.ownerName || 'Staff')}</div>
          <div><strong>Contact:</strong> ${escapeHtml(shop.contactPhone || '—')} • ${escapeHtml(shop.ownerEmail || '—')}</div>
          <div><strong>Rates:</strong> ${ratePreview}</div>
          ${shop.rejectionReason ? `<div style="color: #fca5a5;"><strong>Rejection Note:</strong> ${escapeHtml(shop.rejectionReason)}</div>` : ''}
        </div>
      </div>

      <div class="card-actions-row">
        ${actionButtons}
      </div>
    `;

    adminShopsList.appendChild(card);
  });
}

// Admin Action Functions
window.handleAdminApprove = async (shopId, shopName) => {
  const confirmed = confirm(`Authorize & Approve Counter?\n\nShop: "${shopName}"\n\nThis counter will be activated and immediately visible to students.`);
  if (!confirmed) return;

  try {
    await window.desktopAPI.adminUpdateShopStatus(shopId, 'APPROVED');
    // Real-time listener will automatically re-render
  } catch (e) {
    alert(`Could not approve counter: ${e.message}`);
  }
};

window.handleAdminSuspend = async (shopId, shopName) => {
  const confirmed = confirm(`Suspend Counter?\n\nShop: "${shopName}"\n\nStudents will not be able to send new print orders until reactivated.`);
  if (!confirmed) return;

  try {
    await window.desktopAPI.adminUpdateShopStatus(shopId, 'SUSPENDED');
  } catch (e) {
    alert(`Could not suspend counter: ${e.message}`);
  }
};

window.openRejectModal = (shopId, shopName) => {
  // Authorization check: Only authenticated administrators can open rejection dialog
  if (currentSession?.role !== 'admin') {
    alert('Access restricted: Only campus administrators can reject counter registrations.');
    return;
  }

  // Validate counter selection
  if (!shopId) {
    alert('Invalid operation: No counter registration was selected.');
    return;
  }

  const targetShop = adminAllShops.find((s) => s.shopId === shopId);
  const displayName = targetShop?.name || shopName || 'Selected Counter';
  const displayLocation = targetShop?.location?.building ? ` (${targetShop.location.building})` : '';

  pendingRejectShopId = shopId;
  rejectionModalShopName.textContent = `Counter: ${displayName}${displayLocation}`;
  rejectionReasonInput.value = '';
  rejectionModal.classList.remove('hidden');
  rejectionReasonInput.focus();
};

btnCancelRejectModal.addEventListener('click', () => {
  pendingRejectShopId = null;
  rejectionReasonInput.value = '';
  rejectionModal.classList.add('hidden');
});

btnConfirmReject.addEventListener('click', async () => {
  if (!pendingRejectShopId) {
    alert('No counter registration selected for rejection.');
    rejectionModal.classList.add('hidden');
    return;
  }

  const reason = rejectionReasonInput.value.trim();
  if (!reason) {
    alert('A rejection reason is required so the shopkeeper understands what needs correction.');
    rejectionReasonInput.focus();
    return;
  }

  btnConfirmReject.disabled = true;
  btnConfirmReject.textContent = 'Submitting Rejection...';

  try {
    const res = await window.desktopAPI.adminUpdateShopStatus(pendingRejectShopId, 'REJECTED', reason);
    if (res && res.success === false) {
      throw new Error(res.reason || 'Failed to update counter status.');
    }
    rejectionModal.classList.add('hidden');
    pendingRejectShopId = null;
    rejectionReasonInput.value = '';
  } catch (e) {
    alert(`Could not reject counter: ${e.message}`);
  } finally {
    btnConfirmReject.disabled = false;
    btnConfirmReject.textContent = 'Confirm Rejection';
  }
});

// Admin Direct Provision Form
adminProvisionForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('provShopName').value.trim();
  const building = document.getElementById('provBuilding').value.trim();
  const floor = document.getElementById('provFloor').value;
  const room = document.getElementById('provRoom').value.trim();
  const ownerName = document.getElementById('provOwnerName').value.trim();
  const ownerEmail = document.getElementById('provOwnerEmail').value.trim();
  const contactPhone = document.getElementById('provPhone').value.trim();

  const shopData = {
    name,
    ownerName,
    ownerEmail,
    contactPhone,
    location: { building, floor, room },
  };

  try {
    const res = await window.desktopAPI.adminCreateShop(shopData);
    if (res.success) {
      alert(`Counter "${name}" provisioned and activated successfully!`);
      adminProvisionForm.reset();
      adminTabApproved.click();
    }
  } catch (err) {
    alert(`Provisioning failed: ${err.message}`);
  }
});

// ============================================================================
// 6. GLOBAL LOGOUT & SESSION RESTORATION
// ============================================================================
async function handleLogout() {
  await window.desktopAPI.logout();
  currentSession = null;
  currentShop = null;
  pendingRejectShopId = null;
  cachedPendingJobs = [];
  cachedCompletedJobs = [];
  if (queueCount) queueCount.textContent = '0';
  if (completedCount) completedCount.textContent = '0';
  renderQueueTable([]);
  if (rejectionModal) {
    rejectionModal.classList.add('hidden');
  }
  if (rejectionReasonInput) {
    rejectionReasonInput.value = '';
  }
  switchView('auth');
  shopkeeperLoginForm.reset();
  adminLoginForm.reset();
  hideAuthAlert();
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ----------------------------------------------------------------------------
// INITIAL BOOTSTRAP: CHECK SESSION ON STARTUP
// ----------------------------------------------------------------------------
async function bootstrap() {
  // Ensure all modals and alerts are strictly hidden upon window boot
  if (rejectionModal) {
    rejectionModal.classList.add('hidden');
  }
  pendingRejectShopId = null;
  if (rejectionReasonInput) {
    rejectionReasonInput.value = '';
  }
  hideAuthAlert();

  try {
    const session = await window.desktopAPI.getCurrentSession();
    if (session) {
      currentSession = session;
      if (session.role === 'admin') {
        activateAdminPortal(session.user);
      } else if (session.role === 'shopkeeper') {
        if (session.shop?.status === 'APPROVED') {
          activateDeskConsole(session.shop, session.user);
        } else if (session.shop) {
          activatePendingView(session.shop);
        } else {
          switchView('auth');
        }
      }
    } else {
      switchView('auth');
    }
  } catch (e) {
    switchView('auth');
  }
}

// Run bootstrap when DOM is ready
document.addEventListener('DOMContentLoaded', bootstrap);

/**
 * ============================================================================
 * PRINT-SATHI DESKTOP CLIENT: Automated Multi-File Order Processor
 * ============================================================================
 * 
 * Capabilities:
 * - Sequentially processes multi-file orders (up to 10 files per order).
 * - Downloads, verifies (%PDF- signature), and spools each file with its specific
 *   copies, color mode, and single/duplex configuration.
 * - Atomic claiming per terminal instance.
 * - Dry-Run Mode & Auto-Print Toggle.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const firebaseService = require('./firebaseService');
const printerService = require('./printerService');

class OrderProcessor {
  constructor(instanceId) {
    this.instanceId = instanceId;
    this.autoPrint = true;
    this.dryRun = true; // Safe dry-run enabled by default
    this.isPaused = false;
    this.selectedPrinter = '';
    this.targetShopId = 'shop_main_xerox'; // Default counter: Main Xerox Center
    this.isProcessing = false;
    this.activeJob = null;
    this.recentHistory = [];
    this.currentQueuePayload = {
      pending: [],
      completed: [],
      all: [],
      targetShopId: this.targetShopId,
    };
    this.listeners = {
      log: [],
      queueChange: [],
      statusChange: [],
    };

    // Ensure spool directory exists in OS temp
    this.spoolDir = path.join(os.tmpdir(), 'print-sathi-spool');
    if (!fs.existsSync(this.spoolDir)) {
      try {
        fs.mkdirSync(this.spoolDir, { recursive: true });
      } catch (err) {
        console.warn('Could not create spool dir:', err);
      }
    }
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  log(level, message, details = null) {
    const logItem = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString(),
      level, // 'info' | 'success' | 'warn' | 'error'
      message,
      details,
    };
    console.log(`[${logItem.timestamp}] [${level.toUpperCase()}] ${message}`);
    this.listeners.log.forEach((cb) => cb(logItem));
  }

  notifyStatus() {
    const status = {
      autoPrint: this.autoPrint,
      dryRun: this.dryRun,
      isPaused: this.isPaused,
      selectedPrinter: this.selectedPrinter,
      targetShopId: this.targetShopId,
      isProcessing: this.isProcessing,
      activeJob: this.activeJob,
    };
    this.listeners.statusChange.forEach((cb) => cb(status));
  }

  async init() {
    this.log('info', `Initializing Desktop Station (Instance: ${this.instanceId.slice(0, 8)}, Counter: ${this.targetShopId})...`);

    // 1. Recover stale jobs from crashes
    const recovered = await firebaseService.recoverStaleJobs(this.instanceId);
    if (recovered.length > 0) {
      this.log('warn', `Recovered ${recovered.length} stale job(s) into verification state.`);
    }

    // 2. Discover Windows printers
    const { printers, defaultPrinter } = await printerService.getAvailablePrinters();
    this.selectedPrinter = defaultPrinter || printers[0] || 'Microsoft Print to PDF';
    this.log('success', `Physical printer selected: "${this.selectedPrinter}" (${printers.length} detected).`);

    if (this.dryRun) {
      this.log('info', '🛡️ Safe Dry-Run Mode is ACTIVE (Virtual execution without hardware paper spooling).');
    }

    this.notifyStatus();
    return { printers, defaultPrinter: this.selectedPrinter };
  }

  setTargetShopId(shopId) {
    this.targetShopId = shopId || 'ALL';
    if (this.currentQueuePayload) {
      this.currentQueuePayload.targetShopId = this.targetShopId;
    }
    this.log('info', `Target counter changed to: "${this.targetShopId}".`);
    this.notifyStatus();
  }

  getQueuePayload() {
    return (
      this.currentQueuePayload || {
        pending: [],
        completed: [],
        all: [],
        targetShopId: this.targetShopId,
      }
    );
  }

  async handleIncomingQueue(queue, allDocs = []) {
    // Strict counter segregation: only process & show orders for this counter
    const matchesTargetShop = (d) => firebaseService.matchesShopId(d?.shopId, this.targetShopId);
    const shopDocs = allDocs.filter(matchesTargetShop);

    // Pending orders include active queue states: QUEUED, PENDING, PRINTING, PRINT_SUBMITTED, NEEDS_VERIFICATION
    const pendingStatuses = ['QUEUED', 'PENDING', 'PRINTING', 'PRINT_SUBMITTED', 'NEEDS_VERIFICATION'];
    const pending = shopDocs.filter((d) => {
      const s = (d.status || '').toUpperCase();
      const ps = (d.printStatus || '').toUpperCase();
      return pendingStatuses.includes(s) || pendingStatuses.includes(ps);
    });

    // FIFO sort pending jobs by creation timestamp
    pending.sort((a, b) => {
      const timeA = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt || 0).getTime();
      const timeB = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt || 0).getTime();
      return (timeA || 0) - (timeB || 0);
    });

    // Completed orders include COMPLETED and PRINTED states
    const completedStatuses = ['COMPLETED', 'PRINTED'];
    const completed = shopDocs.filter((d) => {
      const s = (d.status || '').toUpperCase();
      const ps = (d.printStatus || '').toUpperCase();
      return completedStatuses.includes(s) || completedStatuses.includes(ps);
    });

    // Sort completed jobs LIFO (most recently completed or created first)
    completed.sort((a, b) => {
      const timeA = typeof a.printCompletedAt === 'number' ? a.printCompletedAt : (typeof a.createdAt === 'number' ? a.createdAt : 0);
      const timeB = typeof b.printCompletedAt === 'number' ? b.printCompletedAt : (typeof b.createdAt === 'number' ? b.createdAt : 0);
      return (timeB || 0) - (timeA || 0);
    });

    const payload = {
      pending,
      completed,
      all: shopDocs,
      targetShopId: this.targetShopId,
    };
    this.currentQueuePayload = payload;
    this.listeners.queueChange.forEach((cb) => cb(payload));

    if (this.isProcessing || this.isPaused || !this.autoPrint) {
      return;
    }

    // Auto-print candidates: queued and paid jobs waiting to be spooled
    const eligibleJobs = queue.filter((j) => {
      const s = (j.status || '').toUpperCase();
      const ps = (j.printStatus || '').toUpperCase();
      return (s === 'QUEUED' || s === 'PENDING' || ps === 'QUEUED') && s !== 'PRINTING' && s !== 'COMPLETED';
    });

    if (eligibleJobs.length === 0) return;

    // Pick next FIFO job
    const nextJob = eligibleJobs[0];
    await this.processJob(nextJob);
  }

  /**
   * End-to-end multi-file atomic job execution
   */
  async processJob(job) {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.activeJob = job;
    this.notifyStatus();

    const { orderId, token } = job;
    const files = Array.isArray(job.files) && job.files.length > 0
      ? job.files
      : [
          {
            fileName: job.fileName || 'document.pdf',
            fileUrl: job.fileUrl || '',
            copies: job.copies || 1,
            colorMode: job.colorMode || 'bw',
            sides: job.sides || 'single',
            calculatedPages: job.calculatedPages || 1,
          },
        ];

    this.log('info', `Claiming Order #${token} (${orderId}) with ${files.length} document(s)...`);

    try {
      // 1. ATOMIC CLAIMING
      const claimResult = await firebaseService.claimJobAtomically(orderId, this.instanceId);
      if (!claimResult.success) {
        this.log('warn', `Could not claim Order #${token}: ${claimResult.reason}. Skipping.`);
        this.finishJob(orderId, 'SKIPPED');
        return;
      }

      this.log('info', `Order #${token} claimed. Processing ${files.length} file(s)...`);

      // 2. MARK PRINT SUBMITTED
      await firebaseService.markJobPrintSubmitted(orderId, {
        printerName: this.selectedPrinter,
        isDryRun: this.dryRun,
        totalFiles: files.length,
      });

      // 3. SEQUENTIALLY DOWNLOAD, VALIDATE & SPOOL EVERY FILE
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        this.log('info', `[${i + 1}/${files.length}] Downloading "${file.fileName}"...`);

        const tempPdfPath = await this.downloadDocument(orderId, `${i}_${file.fileName}`, file.fileUrl);
        this.validateDocumentAndSpecs(tempPdfPath, file);

        const rangeDesc = file.pageRangeString || 
          (file.pageRangeMode === 'custom' 
            ? `Pages ${file.fromPage || file.pageSelection?.fromPage}-${file.toPage || file.pageSelection?.toPage}` 
            : `All (${file.totalPages || file.calculatedPages || 1} pgs)`);

        this.log(
          'info',
          `[${i + 1}/${files.length}] Spooling "${file.fileName}" (${file.copies} copies, ${file.colorMode.toUpperCase()}, ${file.sides}, ${rangeDesc})...`
        );

        await printerService.printPdf(tempPdfPath, file, {
          printerName: this.selectedPrinter,
          isDryRun: this.dryRun,
        });
      }

      // 4. MARK ORDER COMPLETED
      await firebaseService.markJobCompleted(orderId, {
        printerName: this.selectedPrinter,
        isDryRun: this.dryRun,
        completedFilesCount: files.length,
      });

      const modeTag = this.dryRun ? '[DRY-RUN]' : '[PRINTED]';
      this.log('success', `🎉 ${modeTag} Order #${token} (${files.length} files) completed successfully!`);
      this.finishJob(orderId, 'COMPLETED');
    } catch (err) {
      this.log('error', `❌ Processing failed for Order #${token}: ${err.message}`);
      await firebaseService.markJobFailed(orderId, err.message);
      this.finishJob(orderId, 'FAILED', err.message);
    }
  }

  finishJob(orderId, status, error = null) {
    if (this.activeJob) {
      this.recentHistory.unshift({
        ...this.activeJob,
        processedAt: new Date().toLocaleTimeString(),
        finalStatus: status,
        error,
      });
      if (this.recentHistory.length > 30) this.recentHistory.pop();
    }
    this.isProcessing = false;
    this.activeJob = null;
    this.notifyStatus();
  }

  /**
   * Downloads remote or local PDF to temp spool directory
   */
  async downloadDocument(orderId, fileName, fileUrl) {
    const safeName = (fileName || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    const localPath = path.join(this.spoolDir, `${orderId}_${safeName}`);

    if (!fileUrl) {
      throw new Error(`FILE_NOT_SPECIFIED: Order #${orderId} document "${fileName}" has no download URL or file data.`);
    }

    // 1. Direct Base64 Data URI (synced via Firestore document payload)
    if (fileUrl.startsWith('data:')) {
      try {
        const commaIndex = fileUrl.indexOf(',');
        if (commaIndex === -1) {
          throw new Error('Malformed data URI (missing comma separator).');
        }
        const base64Data = fileUrl.slice(commaIndex + 1);
        const buffer = Buffer.from(base64Data, 'base64');
        if (buffer.length === 0) {
          throw new Error('Base64 payload is 0 bytes.');
        }
        fs.writeFileSync(localPath, buffer);
        this.validateDocumentAndSpecs(localPath, { copies: 1 });
        this.log('info', `✅ Successfully extracted Base64 PDF (${buffer.length} bytes) for "${fileName}".`);
        return localPath;
      } catch (err) {
        throw new Error(`BASE64_DECODE_FAILED: Could not decode document "${fileName}": ${err.message}`);
      }
    }

    // 2. Direct local file path
    if (fs.existsSync(fileUrl)) {
      fs.copyFileSync(fileUrl, localPath);
      this.validateDocumentAndSpecs(localPath, { copies: 1 });
      return localPath;
    }

    // 3. Browser-local Blob URL (Strictly Rejected - Inaccessible to Desktop Station)
    if (fileUrl.startsWith('blob:')) {
      throw new Error(
        `BLOB_URL_INACCESSIBLE: Order #${orderId} document "${fileName}" points to a browser-local blob URL (${fileUrl.slice(0, 45)}...). ` +
        `This file was never uploaded to accessible cloud storage and cannot be downloaded by this desktop station. ` +
        `Ensure Cloud Storage is provisioned or file is under 750KB for direct sync.`
      );
    }

    // 4. Remote HTTP / HTTPS URL (e.g. Firebase Cloud Storage download URL)
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      return await this.downloadRemoteFileWithRedirects(fileUrl, localPath);
    }

    throw new Error(`UNSUPPORTED_PROTOCOL: File URL protocol is not supported: "${fileUrl.slice(0, 30)}..."`);
  }

  /**
   * Downloads remote HTTP/HTTPS PDF stream, following 3xx redirects and validating %PDF-
   */
  downloadRemoteFileWithRedirects(fileUrl, localPath, redirectCount = 0) {
    if (redirectCount > 5) {
      return Promise.reject(new Error('Too many HTTP redirects (exceeded 5).'));
    }

    return new Promise((resolve, reject) => {
      const isHttps = fileUrl.startsWith('https://');
      const client = isHttps ? https : http;
      let parsedUrl;
      try {
        parsedUrl = new URL(fileUrl);
      } catch (err) {
        return reject(new Error(`Malformed download URL: ${err.message}`));
      }

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': 'PrintSathi-DesktopClient/1.0',
          'Accept': 'application/pdf, application/octet-stream, */*',
        },
      };

      const req = client.request(options, (response) => {
        // Handle HTTP 3xx Redirects (301, 302, 303, 307, 308)
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          const redirectUrl = new URL(response.headers.location, fileUrl).href;
          response.resume(); // Drain and discard redirect body
          return resolve(this.downloadRemoteFileWithRedirects(redirectUrl, localPath, redirectCount + 1));
        }

        // Verify HTTP 200 Success
        if (response.statusCode !== 200) {
          let errBody = '';
          response.on('data', (c) => (errBody += c));
          response.on('end', () => {
            reject(
              new Error(`Server returned HTTP ${response.statusCode} (${response.statusMessage || 'Download error'}): ${errBody.slice(0, 150)}`)
            );
          });
          return;
        }

        // Verify Content-Type if present (reject HTML/JSON error responses)
        const contentType = (response.headers['content-type'] || '').toLowerCase();
        if (contentType.includes('text/html') || contentType.includes('application/json')) {
          let errBody = '';
          response.on('data', (c) => (errBody += c));
          response.on('end', () => {
            reject(new Error(`Server returned non-PDF content type "${contentType}": ${errBody.slice(0, 150)}`));
          });
          return;
        }

        const fileStream = fs.createWriteStream(localPath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => {
            try {
              this.validateDocumentAndSpecs(localPath, { copies: 1 });
              resolve(localPath);
            } catch (valErr) {
              try { fs.unlinkSync(localPath); } catch (_) {}
              reject(valErr);
            }
          });
        });

        fileStream.on('error', (err) => {
          try { fs.unlinkSync(localPath); } catch (_) {}
          reject(err);
        });
      });

      req.on('error', (err) => {
        try { fs.unlinkSync(localPath); } catch (_) {}
        reject(err);
      });

      req.setTimeout(30000, () => {
        req.destroy(new Error('PDF download timed out after 30 seconds.'));
      });

      req.end();
    });
  }

  /**
   * Validates %PDF- signature and configuration limits
   */
  validateDocumentAndSpecs(filePath, fileSpec) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist on disk: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      throw new Error('PDF file is 0 bytes.');
    }
    if (stats.size > 80 * 1024 * 1024) {
      throw new Error(`File exceeds 80MB safety limit.`);
    }

    // Inspect %PDF- signature
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(5);
    fs.readSync(fd, buffer, 0, 5, 0);
    fs.closeSync(fd);

    const header = buffer.toString('utf-8');
    if (!header.startsWith('%PDF-')) {
      throw new Error(`Invalid PDF signature (Found: "${header}").`);
    }

    const copies = parseInt(fileSpec.copies, 10);
    if (isNaN(copies) || copies < 1 || copies > 100) {
      throw new Error(`Invalid copies count: ${fileSpec.copies}.`);
    }
  }

  setAutoPrint(enabled) {
    this.autoPrint = Boolean(enabled);
    this.log('info', `Auto-Print turned ${this.autoPrint ? 'ON' : 'OFF'}.`);
    this.notifyStatus();
  }

  setDryRun(enabled) {
    this.dryRun = Boolean(enabled);
    this.log('warn', `Dry-Run Mode is now ${this.dryRun ? 'ENABLED (Virtual Simulation)' : 'DISABLED (Hardware Printing)'}.`);
    this.notifyStatus();
  }

  setPrinter(printerName) {
    this.selectedPrinter = printerName;
    this.log('info', `Printer changed to: "${printerName}".`);
    this.notifyStatus();
  }

  setPaused(paused) {
    this.isPaused = Boolean(paused);
    this.log(this.isPaused ? 'warn' : 'info', `Queue ${this.isPaused ? 'PAUSED' : 'RESUMED'}.`);
    this.notifyStatus();
  }
}

module.exports = OrderProcessor;

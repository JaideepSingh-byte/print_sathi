/**
 * ============================================================================
 * PRINT-SATHI: PDF Accessibility, Retrieval & Spooling Verification Suite
 * ============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const OrderProcessor = require('../shopkeeper-app/services/orderProcessor');

console.log('🧪 Starting Print-Sathi PDF Accessibility & Spooling Test Suite...\n');

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

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASSED: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAILED: ${name}`);
    console.error(`     Error: ${err.message}`);
    process.exit(1);
  }
}

// Minimal valid PDF binary with unique marker
const createTestPdf = (markerText) => {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n` +
    `3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\n` +
    `% MARKER: ${markerText}\n` +
    `xref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000117 00000 n\n` +
    `trailer<</Size 4/Root 1 0 R>>\nstartxref\n250\n%%EOF`
  );
};

(async () => {
  const processor = new OrderProcessor('test-station-verify');
  processor.dryRun = true;
  processor.autoPrint = false;

  // --------------------------------------------------------------------------
  // TEST SUITE 1: Rejection of Inaccessible Browser-Local Blob URLs
  // --------------------------------------------------------------------------
  console.log('--- Suite 1: Blob URL Rejection & Silent Fallback Elimination ---');

  await runAsyncTest('downloadDocument strictly rejects browser-local blob: URLs', async () => {
    const deadBlobUrl = 'blob:http://10.61.104.234:3000/69ecfc1e-b630-4863-aaee-5c19540e398d';
    let caughtError = null;

    try {
      await processor.downloadDocument('PS-BLOB-TEST', 'Student_Assignment.pdf', deadBlobUrl);
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError !== null, 'downloadDocument must throw an error when given a blob URL');
    assert.ok(
      caughtError.message.includes('BLOB_URL_INACCESSIBLE'),
      `Error must indicate BLOB_URL_INACCESSIBLE, got: ${caughtError.message}`
    );
  });

  await runAsyncTest('downloadDocument never falls back to sample lecture notes on blob URLs', async () => {
    const deadBlobUrl = 'blob:http://localhost:3000/e69336de-7560-4a4d-a2d6-d75b50a0c26d';
    const spoolFile = path.join(processor.spoolDir, 'PS-BLOB-TEST2_Student_Doc.pdf');
    if (fs.existsSync(spoolFile)) fs.unlinkSync(spoolFile);

    try {
      await processor.downloadDocument('PS-BLOB-TEST2', 'Student_Doc.pdf', deadBlobUrl);
    } catch (_) {}

    assert.strictEqual(
      fs.existsSync(spoolFile),
      false,
      'Spool file must NOT be created with sample notes when a blob URL fails'
    );
  });

  // --------------------------------------------------------------------------
  // TEST SUITE 2: Direct Base64 PDF Data URI Decoding
  // --------------------------------------------------------------------------
  console.log('\n--- Suite 2: Base64 Data URI Decoding & %PDF- Verification ---');

  await runAsyncTest('downloadDocument decodes Base64 data URI and validates exact PDF bytes', async () => {
    const marker = 'STUDENT_CHEMISTRY_REPORT_2026';
    const testPdfBuffer = createTestPdf(marker);
    const dataUri = `data:application/pdf;base64,${testPdfBuffer.toString('base64')}`;

    const downloadedPath = await processor.downloadDocument(
      'PS-B64-001',
      'Chemistry_Report.pdf',
      dataUri
    );

    assert.ok(fs.existsSync(downloadedPath), 'Downloaded spool file must exist');

    const fileContent = fs.readFileSync(downloadedPath);
    assert.ok(fileContent.toString().startsWith('%PDF-'), 'File must begin with %PDF- header');
    assert.ok(fileContent.toString().includes(marker), 'File must contain the exact student marker bytes');

    // Clean up
    fs.unlinkSync(downloadedPath);
  });

  await runAsyncTest('downloadDocument rejects corrupted Base64 payloads', async () => {
    const corruptedDataUri = 'data:application/pdf;base64,NOT_A_VALID_PDF_HEADER_AT_ALL';
    let caught = null;
    try {
      await processor.downloadDocument('PS-CORRUPT-B64', 'bad.pdf', corruptedDataUri);
    } catch (err) {
      caught = err;
    }

    assert.ok(caught !== null, 'Corrupted Base64 must throw validation error');
    assert.ok(caught.message.includes('Invalid PDF signature'));
  });

  // --------------------------------------------------------------------------
  // TEST SUITE 3: Remote HTTP/HTTPS Download & Redirect Following
  // --------------------------------------------------------------------------
  console.log('\n--- Suite 3: Remote HTTP/HTTPS Download & Redirect Resolution ---');

  await runAsyncTest('downloadDocument follows 302 redirects and streams valid PDF bytes', async () => {
    const redirectMarker = 'REMOTE_REDIRECTED_PDF_MARKER';
    const targetPdf = createTestPdf(redirectMarker);

    // Setup local mock HTTP server that simulates Cloud Storage redirect
    const server = http.createServer((req, res) => {
      if (req.url === '/download-link') {
        // Redirect 302 to final storage destination
        res.writeHead(302, { Location: '/storage-final.pdf' });
        res.end();
      } else if (req.url === '/storage-final.pdf') {
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Length': targetPdf.length,
        });
        res.end(targetPdf);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const downloadUrl = `http://127.0.0.1:${port}/download-link`;

    try {
      const spoolPath = await processor.downloadDocument('PS-REMOTE-001', 'Final_Report.pdf', downloadUrl);
      assert.ok(fs.existsSync(spoolPath));
      const downloadedBytes = fs.readFileSync(spoolPath);
      assert.ok(downloadedBytes.toString().includes(redirectMarker), 'Must follow redirect and download original PDF');
      fs.unlinkSync(spoolPath);
    } finally {
      server.close();
    }
  });

  await runAsyncTest('downloadDocument rejects HTTP error pages (404 / 500)', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<html><body>404 Not Found in Cloud Storage</body></html>');
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const downloadUrl = `http://127.0.0.1:${port}/missing.pdf`;

    let caught = null;
    try {
      await processor.downloadDocument('PS-404-TEST', 'missing.pdf', downloadUrl);
    } catch (err) {
      caught = err;
    } finally {
      server.close();
    }

    assert.ok(caught !== null, 'Must reject HTTP 404 response');
    assert.ok(caught.message.includes('HTTP 404'));
  });

  // --------------------------------------------------------------------------
  // TEST SUITE 4: End-to-End Spooler Processing Pipeline
  // --------------------------------------------------------------------------
  console.log('\n--- Suite 4: End-to-End Spooler Order Processing & Execution ---');

  await runAsyncTest('processJob successfully processes authentic Base64 student job in Dry-Run mode', async () => {
    const studentMarker = 'REAL_STUDENT_MATH_HOMEWORK';
    const mathPdf = createTestPdf(studentMarker);
    const dataUri = `data:application/pdf;base64,${mathPdf.toString('base64')}`;

    const order = {
      orderId: 'PS-E2E-001',
      token: '9901',
      shopId: 'shop_main_xerox',
      status: 'QUEUED',
      printStatus: 'QUEUED',
      paymentStatus: 'COMPLETED',
      createdAt: Date.now(),
      files: [
        {
          fileId: 'file_math_1',
          fileName: 'Math_Homework.pdf',
          fileUrl: dataUri,
          copies: 1,
          colorMode: 'bw',
          sides: 'single',
          calculatedPages: 1,
        },
      ],
    };

    const firebaseService = require('../shopkeeper-app/services/firebaseService');
    const origClaim = firebaseService.claimJobAtomically;
    const origSubmitted = firebaseService.markJobPrintSubmitted;
    const origCompleted = firebaseService.markJobCompleted;

    firebaseService.claimJobAtomically = async () => ({ success: true });
    firebaseService.markJobPrintSubmitted = async () => {};
    firebaseService.markJobCompleted = async () => {};

    try {
      processor.dryRun = true;
      processor.autoPrint = true;

      // Process the job
      await processor.processJob(order);

      assert.ok(processor.recentHistory.length > 0, 'Recent history must record the processed job');
      const recorded = processor.recentHistory[0];
      assert.strictEqual(recorded.orderId, 'PS-E2E-001');
      assert.strictEqual(recorded.finalStatus, 'COMPLETED');
    } finally {
      firebaseService.claimJobAtomically = origClaim;
      firebaseService.markJobPrintSubmitted = origSubmitted;
      firebaseService.markJobCompleted = origCompleted;
    }
  });

  await runAsyncTest('processJob marks job FAILED if PDF URL is a dead blob: URL', async () => {
    const brokenOrder = {
      orderId: 'PS-E2E-BROKEN',
      token: '9902',
      shopId: 'shop_main_xerox',
      status: 'QUEUED',
      printStatus: 'QUEUED',
      paymentStatus: 'COMPLETED',
      createdAt: Date.now(),
      files: [
        {
          fileId: 'file_broken_1',
          fileName: 'Inaccessible.pdf',
          fileUrl: 'blob:http://10.61.104.234:3000/dead-blob-uuid',
          copies: 1,
          colorMode: 'bw',
          sides: 'single',
          calculatedPages: 1,
        },
      ],
    };

    const firebaseService = require('../shopkeeper-app/services/firebaseService');
    const origClaim = firebaseService.claimJobAtomically;
    const origSubmitted = firebaseService.markJobPrintSubmitted;
    const origFailed = firebaseService.markJobFailed;

    firebaseService.claimJobAtomically = async () => ({ success: true });
    firebaseService.markJobPrintSubmitted = async () => {};
    firebaseService.markJobFailed = async () => {};

    try {
      // Process the job
      await processor.processJob(brokenOrder);

      assert.ok(processor.recentHistory.length > 0);
      const recorded = processor.recentHistory[0];
      assert.strictEqual(recorded.orderId, 'PS-E2E-BROKEN');
      assert.strictEqual(recorded.finalStatus, 'FAILED');
      assert.ok(recorded.error.includes('BLOB_URL_INACCESSIBLE'));
    } finally {
      firebaseService.claimJobAtomically = origClaim;
      firebaseService.markJobPrintSubmitted = origSubmitted;
      firebaseService.markJobFailed = origFailed;
    }
  });

  console.log(`\n🎉 ALL ${passedTests} ACCESSIBILITY & SPOOLING TESTS PASSED!`);
})();

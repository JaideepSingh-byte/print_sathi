/**
 * ============================================================================
 * PRINT-SATHI COMPONENT: Multi-File Document Upload Zone
 * ============================================================================
 * 
 * Capabilities:
 * 1. Supports multi-file selection (up to 10 files per order).
 * 2. Enforces enterprise size guardrails:
 *    - Max 20 MB per file
 *    - Max 50 MB total order payload
 * 3. Inspects and validates PDF MIME and binary header magic bytes (%PDF-).
 * 4. Automatically computes page counts for every uploaded document.
 * 5. Provides individual file removal, progress tracking, and "Add More Files".
 * 6. Full backwards-compatibility with single-file parent handlers.
 */

import React, { useState, useRef } from 'react';
import { 
  formatFileSize, 
  getPdfPageCount, 
  validatePdfFile,
  MAX_FILES_COUNT,
  MAX_TOTAL_SIZE_BYTES
} from '../utils/pdfHelper';
import { calculateFilePrice } from '../utils/pricingEngine';

export default function UploadZone({ 
  filesList = [], 
  setFilesList,
  activeFile, 
  setActiveFile, 
  totalPages, 
  setTotalPages,
  shopPricing = null,
}) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  // Compute total aggregate size
  const totalSizeBytes = filesList.reduce((acc, f) => acc + (f.size || 0), 0);
  const isLimitReached = filesList.length >= MAX_FILES_COUNT;

  /**
   * Validates and processes a batch of dropped or selected files
   */
  const processFilesBatch = async (incomingFiles) => {
    setErrorMessage(null);
    if (!incomingFiles || incomingFiles.length === 0) return;

    const fileArray = Array.from(incomingFiles);
    setIsProcessing(true);

    const newlyAdded = [];
    let currentCombined = [...filesList];

    for (const file of fileArray) {
      const validation = await validatePdfFile(file, currentCombined);
      if (!validation.isValid) {
        setErrorMessage(validation.error);
        break; // Stop on first error to give clear user feedback
      }

      // Fast client-side page detection
      let detectedPages = 1;
      try {
        detectedPages = await getPdfPageCount(file);
      } catch (e) {
        detectedPages = 1;
      }

      const initialPrice = calculateFilePrice({
        calculatedPages: detectedPages,
        copies: 1,
        colorMode: 'bw',
        sides: 'single',
      }, shopPricing);

      const fileItem = {
        id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        rawFile: file,
        file: file,
        name: file.name,
        fileName: file.name,
        fileType: 'PDF',
        size: file.size,
        fileSize: file.size,
        totalPages: detectedPages,
        calculatedPages: detectedPages,
        pageSelection: {
          mode: 'all',
          fromPage: 1,
          toPage: detectedPages,
        },
        pageRangeMode: 'all',
        fromPage: 1,
        toPage: detectedPages,
        pageRangeString: `All (${detectedPages} pgs)`,
        rangeValidation: {
          isValid: true,
          error: null,
        },
        copies: 1,
        colorMode: 'bw',
        colourMode: 'grayscale',
        sides: 'single',
        ratePerPage: initialPrice.ratePerPage,
        itemTotal: initialPrice.itemTotal,
      };

      newlyAdded.push(fileItem);
      currentCombined.push(fileItem);
    }

    if (newlyAdded.length > 0) {
      if (setFilesList) {
        setFilesList(currentCombined);
      }
      // Single-file backwards compatibility
      if (setActiveFile && newlyAdded[0]) {
        setActiveFile(newlyAdded[0].rawFile);
        if (setTotalPages) {
          setTotalPages(newlyAdded[0].totalPages);
        }
      }
    }

    setIsProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFilesBatch(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processFilesBatch(e.target.files);
    }
  };

  const handleRemoveItem = (id) => {
    const updated = filesList.filter((f) => f.id !== id);
    if (setFilesList) {
      setFilesList(updated);
    }
    if (updated.length === 0) {
      if (setActiveFile) setActiveFile(null);
      if (setTotalPages) setTotalPages(1);
    } else {
      if (setActiveFile) setActiveFile(updated[0].rawFile);
      if (setTotalPages) setTotalPages(updated[0].totalPages);
    }
    setErrorMessage(null);
  };

  const handleClearAll = () => {
    if (setFilesList) setFilesList([]);
    if (setActiveFile) setActiveFile(null);
    if (setTotalPages) setTotalPages(1);
    setErrorMessage(null);
  };

  const triggerBrowse = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="panel-card">
      <div className="panel-header">
        <h2 className="panel-title">
          <span className="panel-title-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </span>
          1. Upload Documents
        </h2>
        <span className="step-tag">Step 1 of 3</span>
      </div>

      {/* Aggregate Status Indicator if files are uploaded */}
      {filesList.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.6rem 0.85rem',
          marginBottom: '0.9rem',
          background: 'rgba(30, 41, 59, 0.6)',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '0.82rem',
          color: '#94a3b8',
          gap: '0.4rem'
        }}>
          <div>
            <strong style={{ color: '#38bdf8' }}>{filesList.length}</strong> of {MAX_FILES_COUNT} files &bull;{' '}
            <strong style={{ color: '#e2e8f0' }}>{formatFileSize(totalSizeBytes)}</strong> / 50 MB
          </div>
          <button
            type="button"
            onClick={handleClearAll}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontWeight: '600'
            }}
          >
            Clear All
          </button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        onChange={handleFileInputChange}
        className="hidden-file-input"
        style={{ display: 'none' }}
      />

      {/* Drag & Drop Area */}
      {filesList.length === 0 ? (
        <div
          className={`upload-dropzone ${isDragActive ? 'drag-active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={triggerBrowse}
          role="button"
          tabIndex={0}
        >
          <div className="upload-icon-bubble">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>

          <p className="upload-instruction">
            {isDragActive ? 'Release to drop PDF files here' : 'Drag & drop PDF files here (Up to 10 files)'}
          </p>
          <p className="upload-subtext">Supports multi-file select &bull; Max 20 MB/file &bull; Max 50 MB total</p>

          <button
            type="button"
            className="browse-btn"
            onClick={(e) => {
              e.stopPropagation();
              triggerBrowse();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            Browse PDF Files
          </button>

          <div>
            <span className="format-notice-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Strictly PDF (.pdf) with %PDF- signature validation
            </span>
          </div>
        </div>
      ) : (
        /* Multi-File List */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {filesList.map((item, idx) => (
            <div 
              key={item.id || idx} 
              className="active-file-card"
              style={{ padding: '0.8rem 1rem', margin: 0 }}
            >
              <div className="file-header-row">
                <div className="pdf-icon-box">
                  <span>PDF</span>
                </div>
                <div className="file-details">
                  <h4 className="file-name-text" title={item.name}>
                    {idx + 1}. {item.name}
                  </h4>
                  <div className="file-meta-row">
                    <span className="meta-pill">
                      📊 {formatFileSize(item.size)}
                    </span>
                    <span className="meta-pill">
                      📄 {item.totalPages} Page{item.totalPages > 1 ? 's' : ''}
                    </span>
                    <span className="verified-badge">
                      ✓ Verified
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="remove-btn"
                  onClick={() => handleRemoveItem(item.id)}
                  title="Remove file"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  Remove
                </button>
              </div>
            </div>
          ))}

          {/* Add more files row if under limit */}
          {!isLimitReached && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="secondary-action-btn"
                onClick={triggerBrowse}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.5rem 1rem',
                  fontSize: '0.84rem'
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Another Document (+{MAX_FILES_COUNT - filesList.length} left)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Processing Spinner */}
      {isProcessing && (
        <div style={{ textAlign: 'center', padding: '0.5rem', color: '#38bdf8', fontSize: '0.82rem' }}>
          ⏳ Inspecting PDF signature and calculating pages...
        </div>
      )}

      {/* Inline Error Message */}
      {errorMessage && (
        <div className="inline-error-alert" role="alert" style={{ marginTop: '0.75rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}

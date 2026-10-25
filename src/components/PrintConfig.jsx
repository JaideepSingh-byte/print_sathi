/**
 * ============================================================================
 * PRINT-SATHI COMPONENT: Independent Per-File Print Configuration Form
 * ============================================================================
 * 
 * Features:
 * 1. Independent Page Ranges per File:
 *    - "All Pages" option.
 *    - "Custom Range" option with dedicated "From page" & "To page" inputs.
 *    - Clear display of selected page count.
 *    - File-specific inline validation with immediate error feedback.
 * 2. Independent Printing Preferences per File:
 *    - Copies stepper (1-100).
 *    - Color Mode (Black & White vs Full Color).
 *    - Paper Layout (Single-Sided vs Double-Sided Duplex).
 * 3. Individual File Card Layout:
 *    - File name, file type (PDF), file size, total document pages.
 *    - Independent remove button per card.
 * 4. Backward Compatibility:
 *    - Preserves compatibility with existing order schemas and legacy single-file handlers.
 */

import React, { useEffect } from 'react';
import { formatFileSize, evaluatePageSelection } from '../utils/pdfHelper';
import { calculateFilePrice, formatCurrency } from '../utils/pricingEngine';

export default function PrintConfig({
  filesList = [],
  setFilesList,
  // Backwards compatibility props:
  totalPages = 1,
  copies = 1,
  setCopies,
  colorMode = 'bw',
  setColorMode,
  pageRangeMode = 'all',
  setPageRangeMode,
  customRangeString = '',
  setCustomRangeString,
  sides = 'single',
  setSides,
  setCalculatedPages,
  isFileActive = true,
  supportedServices = null,
  shopPricing = null,
}) {
  const allowsBw = supportedServices ? supportedServices.bw !== false : true;
  const allowsColor = supportedServices ? supportedServices.color !== false : true;
  const allowsSingle = supportedServices ? supportedServices.single !== false : true;
  const allowsDuplex = supportedServices ? supportedServices.duplex !== false : true;

  // Auto-correct mode across files if counter does not support active option
  useEffect(() => {
    if (!setFilesList || !filesList.length) return;
    let changed = false;

    const sanitized = filesList.map((item) => {
      let updatedColor = item.colorMode;
      let updatedSides = item.sides;

      if (!allowsColor && item.colorMode === 'color') {
        updatedColor = 'bw';
        changed = true;
      } else if (!allowsBw && item.colorMode === 'bw') {
        updatedColor = 'color';
        changed = true;
      }

      if (!allowsDuplex && item.sides === 'double') {
        updatedSides = 'single';
        changed = true;
      } else if (!allowsSingle && item.sides === 'single') {
        updatedSides = 'double';
        changed = true;
      }

      if (updatedColor !== item.colorMode || updatedSides !== item.sides) {
        const pricing = calculateFilePrice({
          calculatedPages: item.calculatedPages || item.totalPages || 1,
          copies: item.copies || 1,
          colorMode: updatedColor,
          sides: updatedSides,
        }, shopPricing);

        return {
          ...item,
          colorMode: updatedColor,
          colourMode: updatedColor === 'color' ? 'color' : 'grayscale',
          sides: updatedSides,
          ratePerPage: pricing.ratePerPage,
          itemTotal: pricing.itemTotal,
        };
      }
      return item;
    });

    if (changed) {
      setFilesList(sanitized);
    }
  }, [supportedServices, allowsBw, allowsColor, allowsSingle, allowsDuplex]);

  // Synchronize file prices if shop pricing configuration updates dynamically
  useEffect(() => {
    if (!setFilesList || !filesList.length) return;
    let changed = false;

    const updated = filesList.map((item) => {
      const pricing = calculateFilePrice({
        calculatedPages: item.calculatedPages,
        copies: item.copies || 1,
        colorMode: item.colorMode || 'bw',
        sides: item.sides || 'single',
        rangeValidation: item.rangeValidation,
      }, shopPricing);

      if (item.ratePerPage !== pricing.ratePerPage || item.itemTotal !== pricing.itemTotal) {
        changed = true;
        return {
          ...item,
          ratePerPage: pricing.ratePerPage,
          itemTotal: pricing.itemTotal,
        };
      }
      return item;
    });

    if (changed) {
      setFilesList(updated);
    }
  }, [shopPricing]);

  /**
   * Updates an individual file's printing preferences without modifying any other file.
   * Maintains complete state isolation.
   */
  const updateFileConfig = (fileId, fieldUpdates) => {
    if (!setFilesList) return;

    setFilesList((prevList) => {
      return prevList.map((item) => {
        if (item.id !== fileId) {
          // Strict isolation: Other files remain completely untouched
          return item;
        }

        const merged = { ...item, ...fieldUpdates };

        // Determine current mode and range values
        const currentMode = merged.pageSelection?.mode || merged.pageRangeMode || 'all';
        const fromVal = merged.pageSelection?.fromPage ?? merged.fromPage ?? 1;
        const toVal = merged.pageSelection?.toPage ?? merged.toPage ?? (item.totalPages || 1);

        // Evaluate range validity and computed page count
        const rangeResult = evaluatePageSelection(currentMode, fromVal, toVal, item.totalPages || 1);

        // Recalculate itemized pricing
        const pricing = calculateFilePrice({
          calculatedPages: rangeResult.calculatedPages,
          copies: merged.copies || 1,
          colorMode: merged.colorMode || 'bw',
          sides: merged.sides || 'single',
          rangeValidation: {
            isValid: rangeResult.isValid,
            error: rangeResult.error,
          },
        }, shopPricing);

        const updatedFile = {
          ...merged,
          pageSelection: rangeResult.pageSelection,
          pageRangeMode: rangeResult.pageSelection.mode,
          fromPage: rangeResult.fromPage,
          toPage: rangeResult.toPage,
          pageRangeString: rangeResult.pageRangeString,
          calculatedPages: rangeResult.calculatedPages,
          rangeValidation: {
            isValid: rangeResult.isValid,
            error: rangeResult.error,
          },
          ratePerPage: pricing.ratePerPage,
          itemTotal: pricing.itemTotal,
        };

        // If this is the active/first file, update legacy parent state for backwards-compatibility
        if (prevList[0]?.id === fileId) {
          if (setCopies) setCopies(updatedFile.copies);
          if (setColorMode) setColorMode(updatedFile.colorMode);
          if (setSides) setSides(updatedFile.sides);
          if (setPageRangeMode) setPageRangeMode(updatedFile.pageRangeMode);
          if (setCalculatedPages) setCalculatedPages(updatedFile.calculatedPages);
        }

        return updatedFile;
      });
    });
  };

  /**
   * Removes an individual file and its corresponding preferences
   */
  const handleRemoveFile = (fileId) => {
    if (!setFilesList) return;
    setFilesList((prevList) => prevList.filter((f) => f.id !== fileId));
  };

  /**
   * Batch Presets: Quickly apply a default configuration to all files
   * while keeping their independent state fully isolated
   */
  const handleApplyPresetToAll = (presetType) => {
    if (!setFilesList || !filesList.length) return;

    setFilesList((prevList) => {
      return prevList.map((item) => {
        let updates = {};
        if (presetType === 'all-bw') {
          updates = { colorMode: 'bw', colourMode: 'grayscale' };
        } else if (presetType === 'all-color' && allowsColor) {
          updates = { colorMode: 'color', colourMode: 'color' };
        } else if (presetType === 'all-single' && allowsSingle) {
          updates = { sides: 'single' };
        } else if (presetType === 'all-duplex' && allowsDuplex) {
          updates = { sides: 'double' };
        } else if (presetType === 'reset-all-pages') {
          updates = {
            pageSelection: { mode: 'all', fromPage: 1, toPage: item.totalPages || 1 },
            pageRangeMode: 'all',
            fromPage: 1,
            toPage: item.totalPages || 1,
          };
        }

        const merged = { ...item, ...updates };
        const mode = merged.pageSelection?.mode || merged.pageRangeMode || 'all';
        const fromVal = merged.pageSelection?.fromPage ?? merged.fromPage ?? 1;
        const toVal = merged.pageSelection?.toPage ?? merged.toPage ?? (item.totalPages || 1);

        const rangeResult = evaluatePageSelection(mode, fromVal, toVal, item.totalPages || 1);
        const pricing = calculateFilePrice({
          calculatedPages: rangeResult.calculatedPages,
          copies: merged.copies || 1,
          colorMode: merged.colorMode || 'bw',
          sides: merged.sides || 'single',
          rangeValidation: { isValid: rangeResult.isValid, error: rangeResult.error },
        }, shopPricing);

        return {
          ...merged,
          pageSelection: rangeResult.pageSelection,
          pageRangeMode: rangeResult.pageSelection.mode,
          fromPage: rangeResult.fromPage,
          toPage: rangeResult.toPage,
          pageRangeString: rangeResult.pageRangeString,
          calculatedPages: rangeResult.calculatedPages,
          rangeValidation: { isValid: rangeResult.isValid, error: rangeResult.error },
          ratePerPage: pricing.ratePerPage,
          itemTotal: pricing.itemTotal,
        };
      });
    });
  };

  return (
    <div className="panel-card">
      <div className="panel-header">
        <h2 className="panel-title">
          <span className="panel-title-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </span>
          2. Print Configuration & Page Ranges
        </h2>
        <span className="step-tag">Step 2 of 3</span>
      </div>

      {/* Empty State when no files are uploaded */}
      {filesList.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '2.5rem 1rem',
          color: 'var(--text-muted)',
          background: 'rgba(15, 23, 42, 0.4)',
          borderRadius: '10px',
          border: '1px dashed var(--border-light)'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.65rem' }}>📄</div>
          <h4 style={{ color: 'var(--text-main)', fontSize: '0.95rem', marginBottom: '0.25rem' }}>
            No documents uploaded yet
          </h4>
          <p style={{ fontSize: '0.82rem', margin: 0 }}>
            Upload one or more PDF files in Step 1 to configure independent page ranges, copies, and color options for each file.
          </p>
        </div>
      ) : (
        <div>
          {/* Quick Batch Actions (if 2+ files are uploaded) */}
          {filesList.length > 1 && (
            <div className="quick-presets-bar">
              <span className="presets-label">⚡ Quick Batch Apply:</span>
              <div className="presets-buttons">
                <button
                  type="button"
                  className="preset-pill-btn"
                  onClick={() => handleApplyPresetToAll('all-bw')}
                >
                  ⬛ All B&W
                </button>
                {allowsColor && (
                  <button
                    type="button"
                    className="preset-pill-btn"
                    onClick={() => handleApplyPresetToAll('all-color')}
                  >
                    🎨 All Color
                  </button>
                )}
                {allowsDuplex && (
                  <button
                    type="button"
                    className="preset-pill-btn"
                    onClick={() => handleApplyPresetToAll('all-duplex')}
                  >
                    🔄 All Duplex
                  </button>
                )}
                <button
                  type="button"
                  className="preset-pill-btn"
                  onClick={() => handleApplyPresetToAll('reset-all-pages')}
                >
                  📑 All Full Docs
                </button>
              </div>
            </div>
          )}

          {/* List of Independent Per-File Cards */}
          <div className="per-file-cards-container">
            {filesList.map((file, idx) => {
              const currentMode = file.pageSelection?.mode || file.pageRangeMode || 'all';
              const fromVal = file.pageSelection?.fromPage ?? file.fromPage ?? 1;
              const toVal = file.pageSelection?.toPage ?? file.toPage ?? (file.totalPages || 1);
              const isInvalid = file.rangeValidation && file.rangeValidation.isValid === false;

              return (
                <div key={file.id || `file_${idx}`} className="file-config-card">
                  {/* Card Header: File Name, Type, Size, Cost & Remove */}
                  <div className="file-card-header">
                    <div className="file-badge-group">
                      <div className="pdf-icon-box">
                        <span>PDF</span>
                      </div>
                      <div className="file-title-block">
                        <h4 className="file-name-heading" title={file.fileName || file.name}>
                          {idx + 1}. {file.fileName || file.name}
                        </h4>
                        <div className="file-meta-tags">
                          <span className="file-meta-pill">
                            📊 {formatFileSize(file.fileSize || file.size)}
                          </span>
                          <span className="file-meta-pill">
                            📑 {file.totalPages || 1} Total {file.totalPages === 1 ? 'Page' : 'Pages'}
                          </span>
                          <span className="file-type-pill">Type: PDF</span>
                        </div>
                      </div>
                    </div>

                    <div className="file-card-actions">
                      <div className="file-cost-tag">
                        {formatCurrency(file.itemTotal || 0)}
                      </div>
                      <button
                        type="button"
                        className="remove-btn"
                        onClick={() => handleRemoveFile(file.id)}
                        title={`Remove ${file.fileName || file.name}`}
                        aria-label={`Remove ${file.fileName || file.name}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                        Remove
                      </button>
                    </div>
                  </div>

                  {/* Section A: Independent Page Range Selection */}
                  <div className="file-section-block">
                    <div className="file-section-header">
                      <label className="section-label">
                        Page Selection
                      </label>
                      <span className={`selected-count-badge ${isInvalid ? 'error' : ''}`}>
                        {isInvalid ? (
                          '⚠️ Invalid page range'
                        ) : (
                          <>
                            📄 Printing: <strong>{file.calculatedPages || 1}</strong> of {file.totalPages || 1} pages
                          </>
                        )}
                      </span>
                    </div>

                    {/* Mode Toggle Buttons: All Pages vs Custom Range */}
                    <div className="segmented-control page-mode-segmented">
                      <button
                        type="button"
                        className={`segmented-btn ${currentMode === 'all' ? 'active' : ''}`}
                        onClick={() =>
                          updateFileConfig(file.id, {
                            pageSelection: { mode: 'all', fromPage: 1, toPage: file.totalPages || 1 },
                            pageRangeMode: 'all',
                            fromPage: 1,
                            toPage: file.totalPages || 1,
                          })
                        }
                      >
                        <span className="option-title">All Pages</span>
                        <span className="option-subtitle">
                          Pages 1 to {file.totalPages || 1}
                        </span>
                      </button>

                      <button
                        type="button"
                        className={`segmented-btn ${currentMode === 'custom' ? 'active' : ''}`}
                        onClick={() =>
                          updateFileConfig(file.id, {
                            pageSelection: {
                              mode: 'custom',
                              fromPage: fromVal,
                              toPage: toVal,
                            },
                            pageRangeMode: 'custom',
                            fromPage: fromVal,
                            toPage: toVal,
                          })
                        }
                      >
                        <span className="option-title">Custom Range</span>
                        <span className="option-subtitle">Specify From / To</span>
                      </button>
                    </div>

                    {/* Custom Range Inputs (From page / To page) */}
                    {currentMode === 'custom' && (
                      <div className="custom-range-inputs-container">
                        <div className="range-inputs-grid">
                          <div className="range-input-item">
                            <label className="range-sublabel" htmlFor={`fromPage_${file.id}`}>
                              From Page:
                            </label>
                            <input
                              id={`fromPage_${file.id}`}
                              type="number"
                              min="1"
                              max={file.totalPages || 1}
                              value={fromVal}
                              onChange={(e) => {
                                const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                                updateFileConfig(file.id, {
                                  fromPage: val,
                                  pageSelection: {
                                    mode: 'custom',
                                    fromPage: val,
                                    toPage: toVal,
                                  },
                                });
                              }}
                              className={`range-num-input ${isInvalid ? 'input-error' : ''}`}
                              placeholder="1"
                            />
                          </div>

                          <div className="range-input-separator">&rarr;</div>

                          <div className="range-input-item">
                            <label className="range-sublabel" htmlFor={`toPage_${file.id}`}>
                              To Page:
                            </label>
                            <input
                              id={`toPage_${file.id}`}
                              type="number"
                              min="1"
                              max={file.totalPages || 1}
                              value={toVal}
                              onChange={(e) => {
                                const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                                updateFileConfig(file.id, {
                                  toPage: val,
                                  pageSelection: {
                                    mode: 'custom',
                                    fromPage: fromVal,
                                    toPage: val,
                                  },
                                });
                              }}
                              className={`range-num-input ${isInvalid ? 'input-error' : ''}`}
                              placeholder={file.totalPages || 1}
                            />
                          </div>

                          <div className="range-preview-summary">
                            <span className="summary-label">Summary:</span>
                            <span className="summary-val">
                              {file.rangeValidation?.isValid ? file.pageRangeString : '—'}
                            </span>
                          </div>
                        </div>

                        {/* File-Specific Validation Error Banner */}
                        {isInvalid && (
                          <div className="file-validation-error-alert" role="alert">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="12" />
                              <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <span>{file.rangeValidation.error}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Section B: Printing Preferences (Copies, Color, Sides) */}
                  <div className="file-preferences-grid">
                    {/* 1. Copies Stepper */}
                    <div className="file-pref-col">
                      <label className="pref-label">Copies</label>
                      <div className="stepper-container" style={{ maxWidth: '140px' }}>
                        <button
                          type="button"
                          className="stepper-btn"
                          onClick={() => {
                            const cur = file.copies || 1;
                            if (cur > 1) updateFileConfig(file.id, { copies: cur - 1 });
                          }}
                          disabled={(file.copies || 1) <= 1}
                          aria-label={`Decrease copies for ${file.fileName || file.name}`}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={file.copies || 1}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            const safe = isNaN(val) ? 1 : Math.max(1, Math.min(100, val));
                            updateFileConfig(file.id, { copies: safe });
                          }}
                          className="stepper-input"
                        />
                        <button
                          type="button"
                          className="stepper-btn"
                          onClick={() => {
                            const cur = file.copies || 1;
                            if (cur < 100) updateFileConfig(file.id, { copies: cur + 1 });
                          }}
                          disabled={(file.copies || 1) >= 100}
                          aria-label={`Increase copies for ${file.fileName || file.name}`}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* 2. Color Mode */}
                    <div className="file-pref-col">
                      <label className="pref-label">Color Mode</label>
                      <div className="segmented-control compact-segmented">
                        <button
                          type="button"
                          className={`segmented-btn ${(file.colorMode || 'bw') === 'bw' ? 'active' : ''}`}
                          onClick={() => allowsBw && updateFileConfig(file.id, { colorMode: 'bw', colourMode: 'grayscale' })}
                          disabled={!allowsBw}
                          style={{ opacity: allowsBw ? 1 : 0.45, cursor: allowsBw ? 'pointer' : 'not-allowed' }}
                        >
                          <span className="option-title">B&W</span>
                          <span className="option-subtitle">Economical</span>
                        </button>
                        <button
                          type="button"
                          className={`segmented-btn ${(file.colorMode || 'bw') === 'color' ? 'active' : ''}`}
                          onClick={() => allowsColor && updateFileConfig(file.id, { colorMode: 'color', colourMode: 'color' })}
                          disabled={!allowsColor}
                          style={{ opacity: allowsColor ? 1 : 0.45, cursor: allowsColor ? 'pointer' : 'not-allowed' }}
                        >
                          <span className="option-title">Color</span>
                          <span className="option-subtitle">Vibrant</span>
                        </button>
                      </div>
                    </div>

                    {/* 3. Paper Layout (Duplex) */}
                    <div className="file-pref-col">
                      <label className="pref-label">Paper Layout</label>
                      <div className="segmented-control compact-segmented">
                        <button
                          type="button"
                          className={`segmented-btn ${(file.sides || 'single') === 'single' ? 'active' : ''}`}
                          onClick={() => allowsSingle && updateFileConfig(file.id, { sides: 'single' })}
                          disabled={!allowsSingle}
                          style={{ opacity: allowsSingle ? 1 : 0.45, cursor: allowsSingle ? 'pointer' : 'not-allowed' }}
                        >
                          <span className="option-title">1-Sided</span>
                          <span className="option-subtitle">Standard</span>
                        </button>
                        <button
                          type="button"
                          className={`segmented-btn ${(file.sides || 'single') === 'double' ? 'active' : ''}`}
                          onClick={() => allowsDuplex && updateFileConfig(file.id, { sides: 'double' })}
                          disabled={!allowsDuplex}
                          style={{ opacity: allowsDuplex ? 1 : 0.45, cursor: allowsDuplex ? 'pointer' : 'not-allowed' }}
                        >
                          <span className="option-title">Duplex</span>
                          <span className="option-subtitle">2-Sided</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* File Subtotal Footer */}
                  <div className="file-subtotal-footer">
                    <span className="subtotal-calc-text">
                      Subtotal: <strong>{file.calculatedPages || 0}</strong> pages &times;{' '}
                      <strong>{file.copies || 1}</strong> {(file.copies || 1) === 1 ? 'copy' : 'copies'}{' '}
                      ({(file.colorMode || 'bw').toUpperCase()}, {file.sides === 'double' ? 'Duplex' : 'Single-Sided'})
                    </span>
                    <span className="subtotal-amount-tag">
                      {formatCurrency(file.itemTotal || 0)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

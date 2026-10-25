/**
 * ============================================================================
 * PRINT-SATHI: Dynamic Tiered Pricing Engine
 * ============================================================================
 * 
 * Features:
 * - Dynamic quantity tiers:
 *   * Tier 1: 1–49 units (pages / duplex sheets)
 *   * Tier 2: 50–99 units
 *   * Tier 3: 100+ units
 * - Color vs. Black & White rates
 * - Single-sided vs. Duplex (Double-sided) sheet calculations
 * - Itemized multi-file order aggregation
 * - Client & Server/Cloud Function validation consistency
 */

export const DEFAULT_PRICING_CONFIG = {
  bw: {
    single: [
      { min: 1, max: 49, rate: 2.0 },
      { min: 50, max: 99, rate: 1.5 },
      { min: 100, max: Infinity, rate: 1.0 },
    ],
    double: [
      { min: 1, max: 49, rate: 3.0 }, // per sheet (2 pages front/back)
      { min: 50, max: 99, rate: 2.2 },
      { min: 100, max: Infinity, rate: 1.6 },
    ],
  },
  color: {
    single: [
      { min: 1, max: 49, rate: 8.0 },
      { min: 50, max: 99, rate: 6.0 },
      { min: 100, max: Infinity, rate: 5.0 },
    ],
    double: [
      { min: 1, max: 49, rate: 14.0 }, // per sheet
      { min: 50, max: 99, rate: 10.0 },
      { min: 100, max: Infinity, rate: 8.0 },
    ],
  },
};

/**
 * Creates a validated pricing tiers structure for a shop registration
 * @param {object} customRates Flat rates for each combination and tier
 */
export function buildPricingConfig(customRates = {}) {
  return {
    bw: {
      single: [
        { min: 1, max: 49, rate: Math.max(0, parseFloat(customRates.bw_single_t1 ?? 2.0)) },
        { min: 50, max: 99, rate: Math.max(0, parseFloat(customRates.bw_single_t2 ?? 1.5)) },
        { min: 100, max: Infinity, rate: Math.max(0, parseFloat(customRates.bw_single_t3 ?? 1.0)) },
      ],
      double: [
        { min: 1, max: 49, rate: Math.max(0, parseFloat(customRates.bw_double_t1 ?? 3.0)) },
        { min: 50, max: 99, rate: Math.max(0, parseFloat(customRates.bw_double_t2 ?? 2.2)) },
        { min: 100, max: Infinity, rate: Math.max(0, parseFloat(customRates.bw_double_t3 ?? 1.6)) },
      ],
    },
    color: {
      single: [
        { min: 1, max: 49, rate: Math.max(0, parseFloat(customRates.color_single_t1 ?? 8.0)) },
        { min: 50, max: 99, rate: Math.max(0, parseFloat(customRates.color_single_t2 ?? 6.0)) },
        { min: 100, max: Infinity, rate: Math.max(0, parseFloat(customRates.color_single_t3 ?? 5.0)) },
      ],
      double: [
        { min: 1, max: 49, rate: Math.max(0, parseFloat(customRates.color_double_t1 ?? 14.0)) },
        { min: 50, max: 99, rate: Math.max(0, parseFloat(customRates.color_double_t2 ?? 10.0)) },
        { min: 100, max: Infinity, rate: Math.max(0, parseFloat(customRates.color_double_t3 ?? 8.0)) },
      ],
    },
  };
}

/**
 * Finds the applicable rate from pricing tiers
 * @param {'bw'|'color'} colorMode 
 * @param {'single'|'double'} sides 
 * @param {number} unitCount - pages for single, sheets for duplex
 * @param {object} customPricing 
 * @returns {number} Rate per unit
 */
export function getTierRate(colorMode = 'bw', sides = 'single', unitCount = 1, customPricing = null) {
  const pricing = customPricing || DEFAULT_PRICING_CONFIG;
  const modeKey = colorMode === 'color' ? 'color' : 'bw';
  const sideKey = sides === 'double' ? 'double' : 'single';

  const tiers = pricing[modeKey]?.[sideKey] || DEFAULT_PRICING_CONFIG[modeKey][sideKey];
  const count = Math.max(1, unitCount);

  for (const tier of tiers) {
    if (count >= tier.min && count <= tier.max) {
      return tier.rate;
    }
  }

  return tiers[tiers.length - 1]?.rate || 1.0;
}

/**
 * Computes pricing for a single file in the print queue
 * @param {object} fileSpec
 * @param {object} shopPricing 
 */
export function calculateFilePrice(fileSpec, shopPricing = null) {
  const isInvalid = fileSpec?.rangeValidation && fileSpec.rangeValidation.isValid === false;
  const rawPages = parseInt(fileSpec?.calculatedPages, 10);
  const calculatedPages = isInvalid || isNaN(rawPages) || rawPages <= 0 ? 0 : rawPages;

  const copies = Math.max(1, parseInt(fileSpec?.copies || 1, 10));
  const colorMode = fileSpec?.colorMode === 'color' ? 'color' : 'bw';
  const sides = fileSpec?.sides === 'double' ? 'double' : 'single';

  if (calculatedPages === 0) {
    return {
      calculatedPages: 0,
      copies,
      colorMode,
      sides,
      sheetsPerCopy: 0,
      totalSheets: 0,
      totalImpressions: 0,
      billingUnits: 0,
      unitType: sides === 'double' ? 'sheets' : 'pages',
      ratePerUnit: 0,
      ratePerPage: 0,
      itemTotal: 0,
    };
  }

  // For double sided, 1 sheet contains 2 page impressions
  const sheetsPerCopy = sides === 'double' ? Math.ceil(calculatedPages / 2) : calculatedPages;
  const totalSheets = sheetsPerCopy * copies;
  const totalImpressions = calculatedPages * copies;

  // Pricing unit is sheets for duplex, or pages for single
  const billingUnits = sides === 'double' ? totalSheets : totalImpressions;
  const ratePerUnit = getTierRate(colorMode, sides, billingUnits, shopPricing);

  const itemTotal = Math.round(billingUnits * ratePerUnit * 100) / 100;

  return {
    calculatedPages,
    copies,
    colorMode,
    sides,
    sheetsPerCopy,
    totalSheets,
    totalImpressions,
    billingUnits,
    unitType: sides === 'double' ? 'sheets' : 'pages',
    ratePerUnit,
    ratePerPage: sides === 'double' ? (ratePerUnit / 2) : ratePerUnit,
    itemTotal,
  };
}

/**
 * Computes complete pricing snapshot for an array of files in an order
 * @param {Array<object>} filesList 
 * @param {object} shopPricing 
 */
export function calculateOrderPricing(filesList = [], shopPricing = null) {
  if (!Array.isArray(filesList) || filesList.length === 0) {
    return {
      subtotal: 0,
      totalAmount: 0,
      totalSheets: 0,
      totalPages: 0,
      totalFiles: 0,
      items: [],
    };
  }

  const items = filesList.map((file) => {
    const pricing = calculateFilePrice(file, shopPricing);
    return {
      fileId: file.id || file.fileId || `file_${Math.random().toString(36).substring(2, 9)}`,
      fileName: file.name || file.fileName || 'document.pdf',
      fileSize: file.size || file.fileSize || 0,
      fileUrl: file.fileUrl || '',
      pageSelection: file.pageSelection || {
        mode: file.pageRangeMode || 'all',
        fromPage: file.fromPage || 1,
        toPage: file.toPage || (file.totalPages || 1),
      },
      pageRangeMode: file.pageRangeMode || 'all',
      fromPage: file.fromPage || 1,
      toPage: file.toPage || (file.totalPages || 1),
      pageRangeString: file.pageRangeString || `All (${file.totalPages || 1} pgs)`,
      totalPages: file.totalPages || 1,
      rangeValidation: file.rangeValidation || { isValid: true, error: null },
      ...pricing,
    };
  });

  const totalAmount = items.reduce((acc, item) => acc + item.itemTotal, 0);
  const totalSheets = items.reduce((acc, item) => acc + item.totalSheets, 0);
  const totalPages = items.reduce((acc, item) => acc + item.totalImpressions, 0);

  return {
    subtotal: Math.round(totalAmount * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
    totalSheets,
    totalPages,
    totalFiles: items.length,
    items,
  };
}

/**
 * Formats rupee currency nicely
 */
export function formatCurrency(amount) {
  const num = typeof amount === 'number' ? amount : parseFloat(amount || 0);
  return `₹${num.toFixed(num % 1 === 0 ? 0 : 2)}`;
}

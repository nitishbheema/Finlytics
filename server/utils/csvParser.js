import crypto from 'node:crypto';

/**
 * Robust CSV parser that handles:
 * - Common delimiters (comma, semicolon, tab)
 * - Quoted fields with escaped quotes and embedded commas/newlines
 * - Leading/trailing spaces
 * - Bank statement preambles (skipping non-tabular header metadata)
 */

export function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0).slice(0, 10);
  if (lines.length === 0) return ',';

  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (const line of lines) {
    counts[','] += (line.match(/,/g) || []).length;
    counts[';'] += (line.match(/;/g) || []).length;
    counts['\t'] += (line.match(/\t/g) || []).length;
  }

  if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) return '\t';
  if (counts[';'] > counts[',']) return ';';
  return ',';
}

/**
 * Parse raw CSV text into array of rows (each row is array of string cells)
 * adhering to RFC 4180 rules.
 */
export function parseCSV(text, delimiter = ',') {
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let insideQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        i += 2;
        continue;
      }
      insideQuotes = !insideQuotes;
      i++;
      continue;
    }

    if (!insideQuotes && char === delimiter) {
      currentRow.push(currentCell.trim());
      currentCell = '';
      i++;
      continue;
    }

    if (!insideQuotes && (char === '\r' || char === '\n')) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      // Only add non-empty rows or rows with more than one empty cell
      if (currentRow.some(cell => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
      i++;
      continue;
    }

    currentCell += char;
    i++;
  }

  // Push final cell/row if remaining
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(cell => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Scan rows to find the actual table header row.
 * Bank statements frequently start with 2-10 rows of account/branch details.
 */
const HEADER_KEYWORDS = [
  'date', 'txn date', 'transaction date', 'value date', 'posting date',
  'description', 'narration', 'particulars', 'remarks', 'details', 'payee',
  'debit', 'withdrawal', 'dr', 'credit', 'deposit', 'cr', 'amount',
  'balance', 'chq', 'ref', 'utr', 'reference'
];

export function findHeaderRowIndex(rows) {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i].map(c => c.toLowerCase().trim());
    const matchCount = row.filter(cell =>
      HEADER_KEYWORDS.some(kw => cell.includes(kw))
    ).length;

    // Must have at least 2 bank header keywords to be considered the header
    if (matchCount >= 2) {
      return i;
    }
  }
  return 0; // Default to first row if no clear header found
}

/**
 * Intelligently suggest column indices from the detected header row.
 */
export function guessColumnMapping(headers) {
  const mapping = {
    dateCol: -1,
    descCol: -1,
    amountCol: -1,
    debitCol: -1,
    creditCol: -1,
    typeCol: -1,
    refCol: -1,
    dateFormat: 'auto',
  };

  const normalized = headers.map(h => (h || '').toLowerCase().trim());

  normalized.forEach((h, idx) => {
    // Date column
    if (mapping.dateCol === -1) {
      if (h === 'date' || h === 'txn date' || h === 'transaction date' || h === 'value date') {
        mapping.dateCol = idx;
      } else if (h.includes('date') && !h.includes('update')) {
        mapping.dateCol = idx;
      }
    }

    // Debit column
    if (mapping.debitCol === -1) {
      if (h === 'debit' || h === 'withdrawal' || h === 'dr' || h === 'debit amount' || h === 'withdrawals') {
        mapping.debitCol = idx;
      } else if ((h.includes('debit') || h.includes('withdrawal')) && !h.includes('total')) {
        mapping.debitCol = idx;
      }
    }

    // Credit column
    if (mapping.creditCol === -1) {
      if (h === 'credit' || h === 'deposit' || h === 'cr' || h === 'credit amount' || h === 'deposits') {
        mapping.creditCol = idx;
      } else if ((h.includes('credit') || h.includes('deposit')) && !h.includes('total')) {
        mapping.creditCol = idx;
      }
    }

    // Single Amount column
    if (mapping.amountCol === -1) {
      if (h === 'amount' || h === 'txn amount' || h === 'transaction amount') {
        mapping.amountCol = idx;
      }
    }

    // Type column (DR / CR)
    if (mapping.typeCol === -1) {
      if (h === 'type' || h === 'cr/dr' || h === 'dr/cr' || h === 'txn type' || h === 'transaction type') {
        mapping.typeCol = idx;
      }
    }

    // Description / Narration
    if (mapping.descCol === -1) {
      if (h === 'narration' || h === 'description' || h === 'particulars' || h === 'remarks') {
        mapping.descCol = idx;
      } else if (h.includes('description') || h.includes('narration') || h.includes('particulars') || h.includes('details') || h.includes('payee')) {
        mapping.descCol = idx;
      }
    }

    // Reference / UTR
    if (mapping.refCol === -1) {
      if (h === 'chq/ref no' || h === 'ref no' || h === 'reference' || h === 'utr' || h === 'chq no' || h === 'txn id') {
        mapping.refCol = idx;
      } else if (h.includes('ref') || h.includes('utr') || h.includes('cheque') || h.includes('chq')) {
        mapping.refCol = idx;
      }
    }
  });

  return mapping;
}

/**
 * Cleans numerical amount string (removes ₹, Rs., INR, commas, whitespace)
 */
export function cleanAmount(val) {
  if (val === null || val === undefined) return null;
  let str = String(val).trim();
  if (!str || str === '-' || str === '--') return null;

  // Remove currency codes and symbols
  str = str.replace(/(₹|Rs\.?|INR|\$|€|£)/gi, '').trim();
  // Remove commas
  str = str.replace(/,/g, '');

  let isNegative = false;
  if (str.startsWith('-') || str.endsWith('-')) {
    isNegative = true;
    str = str.replace(/-/g, '');
  }

  // Check for trailing Dr/Cr in amount
  let suffixType = null;
  if (/dr$/i.test(str)) {
    suffixType = 'debit';
    str = str.replace(/dr$/i, '');
  } else if (/cr$/i.test(str)) {
    suffixType = 'credit';
    str = str.replace(/cr$/i, '');
  }

  const num = parseFloat(str.trim());
  if (isNaN(num)) return null;

  return {
    value: Math.abs(num),
    isNegative,
    suffixType,
  };
}

/**
 * Month lookup for named month parsing
 */
const MONTH_NAMES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

/**
 * Parses diverse date string formats into standard YYYY-MM-DD.
 * Formats handled:
 * - DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 * - YYYY-MM-DD, YYYY/MM/DD
 * - MM/DD/YYYY, MM-DD-YYYY
 * - DD Mon YYYY, DD-Mon-YYYY (e.g. 24 Mar 2026, 24-MAR-2026)
 */
export function parseDateString(raw, formatHint = 'auto') {
  if (!raw || typeof raw !== 'string') return null;
  const str = raw.trim();
  if (!str) return null;

  // 1. ISO format: YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (isValidDate(y, m, d)) return formatDate(y, m, d);
  }

  // 2. Alpha month: 24-Mar-2026 or 24 Mar 2026 or 24-MAR-26
  const alphaMatch = str.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,9})[-/\s](\d{2,4})(?:[T\s].*)?$/);
  if (alphaMatch) {
    const d = parseInt(alphaMatch[1], 10);
    const mName = alphaMatch[2].toLowerCase();
    let y = parseInt(alphaMatch[3], 10);
    if (y < 100) y += 2000;
    const m = MONTH_NAMES[mName];
    if (m && isValidDate(y, m, d)) return formatDate(y, m, d);
  }

  // 3. Delimited numeric: DD/MM/YYYY or MM/DD/YYYY
  const numMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[T\s].*)?$/);
  if (numMatch) {
    const first = parseInt(numMatch[1], 10);
    const second = parseInt(numMatch[2], 10);
    let y = parseInt(numMatch[3], 10);
    if (y < 100) y += 2000;

    // Check hint
    if (formatHint === 'mdy') {
      if (isValidDate(y, first, second)) return formatDate(y, first, second);
    } else if (formatHint === 'dmy') {
      if (isValidDate(y, second, first)) return formatDate(y, second, first);
    }

    // Auto heuristics:
    // If first > 12, it must be DD/MM/YYYY
    if (first > 12 && second <= 12) {
      if (isValidDate(y, second, first)) return formatDate(y, second, first);
    }
    // If second > 12, it must be MM/DD/YYYY
    if (second > 12 && first <= 12) {
      if (isValidDate(y, first, second)) return formatDate(y, first, second);
    }

    // Default for Indian & global banking is DD/MM/YYYY
    if (isValidDate(y, second, first)) {
      return formatDate(y, second, first);
    }
    if (isValidDate(y, first, second)) {
      return formatDate(y, first, second);
    }
  }

  return null;
}

function isValidDate(y, m, d) {
  if (y < 2000 || y > 2100) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const daysInMonth = new Date(y, m, 0).getDate();
  return d <= daysInMonth;
}

function formatDate(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Extracts reference/UTR and cleans merchant name from raw description and reference cells.
 */
export function extractMerchantAndRef(rawDesc, rawRef) {
  let merchant = (rawDesc || '').trim();
  let reference = (rawRef || '').trim() || null;

  // Clean obvious noise
  merchant = merchant.replace(/\s+/g, ' ');

  // Look for 12-digit numeric UPI reference / UTR if no reference is present
  if (!reference) {
    const upiRefMatch = merchant.match(/(?:UPI|UTR|REF|TXN)[:\s\-/]*([0-9]{10,18})/i)
      || merchant.match(/\b([0-9]{12})\b/);
    if (upiRefMatch) {
      reference = upiRefMatch[1];
    }
  }

  // Generate a cleaner merchant display name if prefixed with bank codes
  let cleanMerchant = merchant;
  // e.g. "UPI/DR/123456789012/SWIGGY/ICICI" -> "SWIGGY"
  const upiParts = cleanMerchant.split(/[/\\-]/).map(p => p.trim()).filter(Boolean);
  if (upiParts.length >= 3 && /^upi$/i.test(upiParts[0])) {
    const namedPart = upiParts.find((p, idx) =>
      idx > 0 && !/^\d+$/.test(p) && !/^(dr|cr|p2p|p2m|pay|payment)$/i.test(p) && p.length > 2
    );
    if (namedPart) {
      cleanMerchant = namedPart;
    }
  }

  // e.g. "POS 401234XXXXXX1234 STARBUCKS"
  cleanMerchant = cleanMerchant.replace(/^POS\s+\d+X+\d+\s+/i, '');
  // e.g. "NEFT/AXIS12345/..."
  cleanMerchant = cleanMerchant.replace(/^(NEFT|IMPS|RTGS|ACH|NACH|ATM-WDL|CASH-WDL)[/\s:]+/i, '');

  cleanMerchant = cleanMerchant.trim();
  if (!cleanMerchant || cleanMerchant.length < 2) {
    cleanMerchant = merchant || 'Bank Statement Transaction';
  }

  return {
    merchant: cleanMerchant.slice(0, 180),
    rawDescription: merchant.slice(0, 240),
    reference: reference ? reference.slice(0, 150) : null,
  };
}

/**
 * Parse and validate bank statement rows with explicit per-row validation reporting.
 */
export function parseStatementRows(rawRows, mapping, options = {}) {
  const { userId, existingFingerprints = new Set() } = options;
  const headerIdx = findHeaderRowIndex(rawRows);
  const headers = rawRows[headerIdx] || [];
  const activeMapping = { ...guessColumnMapping(headers), ...mapping };

  const validRows = [];
  const invalidRows = [];
  const seenBatchFingerprints = new Set();

  for (let idx = headerIdx + 1; idx < rawRows.length; idx++) {
    const row = rawRows[idx];
    const rowNumber = idx + 1;

    // Skip empty rows
    if (!row || row.every(cell => !cell || cell.trim().length === 0)) {
      continue;
    }

    // 1. Date
    const rawDate = activeMapping.dateCol >= 0 ? row[activeMapping.dateCol] : '';
    const parsedDate = parseDateString(rawDate, activeMapping.dateFormat);
    if (!parsedDate) {
      invalidRows.push({
        rowNumber,
        reason: `Invalid or missing transaction date ('${rawDate || 'empty'}'). Expected DD/MM/YYYY or YYYY-MM-DD.`,
        rawData: row,
      });
      continue;
    }

    // 2. Amount and Direction (Debit/Credit)
    let amount = null;
    let direction = null;

    const hasDebitCol = activeMapping.debitCol >= 0 && activeMapping.debitCol < row.length;
    const hasCreditCol = activeMapping.creditCol >= 0 && activeMapping.creditCol < row.length;
    const hasAmountCol = activeMapping.amountCol >= 0 && activeMapping.amountCol < row.length;

    if (hasDebitCol || hasCreditCol) {
      const debitParsed = hasDebitCol ? cleanAmount(row[activeMapping.debitCol]) : null;
      const creditParsed = hasCreditCol ? cleanAmount(row[activeMapping.creditCol]) : null;

      if (debitParsed && debitParsed.value > 0) {
        amount = debitParsed.value;
        direction = 'debit';
      } else if (creditParsed && creditParsed.value > 0) {
        amount = creditParsed.value;
        direction = 'credit';
      }
    }

    // Single amount column with Type or negative sign
    if (amount === null && hasAmountCol) {
      const amtParsed = cleanAmount(row[activeMapping.amountCol]);
      if (amtParsed && amtParsed.value > 0) {
        amount = amtParsed.value;

        // Check Type column
        if (activeMapping.typeCol >= 0 && activeMapping.typeCol < row.length) {
          const typeVal = (row[activeMapping.typeCol] || '').toLowerCase().trim();
          if (typeVal.startsWith('dr') || typeVal.includes('debit') || typeVal.includes('withdraw') || typeVal === 'w') {
            direction = 'debit';
          } else if (typeVal.startsWith('cr') || typeVal.includes('credit') || typeVal.includes('deposit') || typeVal === 'd') {
            direction = 'credit';
          }
        }

        // Suffix in amount (e.g. 500 Dr)
        if (!direction && amtParsed.suffixType) {
          direction = amtParsed.suffixType;
        }

        // Negative sign in amount (e.g. -500.00 is debit)
        if (!direction && amtParsed.isNegative) {
          direction = 'debit';
        }
      }
    }

    if (!amount || amount <= 0) {
      invalidRows.push({
        rowNumber,
        reason: 'Missing or zero transaction amount.',
        rawData: row,
      });
      continue;
    }

    if (!direction) {
      invalidRows.push({
        rowNumber,
        reason: 'Could not determine whether transaction is a Debit or Credit.',
        rawData: row,
      });
      continue;
    }

    // 3. Description & Reference
    const rawDesc = activeMapping.descCol >= 0 ? row[activeMapping.descCol] : '';
    const rawRef = activeMapping.refCol >= 0 ? row[activeMapping.refCol] : '';
    const { merchant, rawDescription, reference } = extractMerchantAndRef(rawDesc, rawRef);

    // 4. Deterministic SHA-256 Fingerprint
    // Hash format: user|date|amount.toFixed(2)|direction|ref_or_merchant
    const identityString = `${userId || 'web'}|${parsedDate}|${amount.toFixed(2)}|${direction}|${reference || merchant.toLowerCase()}`;
    const fingerprint = crypto.createHash('sha256').update(identityString).digest('hex');

    // Check duplicate
    const isDuplicate = existingFingerprints.has(fingerprint) || seenBatchFingerprints.has(fingerprint);
    seenBatchFingerprints.add(fingerprint);

    validRows.push({
      rowNumber,
      transactionDate: parsedDate,
      amount: Number(amount.toFixed(2)),
      currency: 'INR',
      direction, // 'debit' or 'credit'
      merchant,
      description: rawDescription,
      reference,
      fingerprint,
      isDuplicate,
      status: isDuplicate ? 'duplicate' : 'pending',
    });
  }

  return {
    headers,
    headerRowIndex: headerIdx,
    mapping: activeMapping,
    validRows,
    invalidRows,
  };
}

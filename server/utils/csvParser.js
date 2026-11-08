import crypto from 'node:crypto';

/**
 * Universal Delimiter Detection (Comma, Semicolon, Tab)
 */
export function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0).slice(0, 15);
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
 * RFC 4180 Compliant CSV Parser
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

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(cell => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Header row detector. Scans past metadata/preambles (e.g. Customer Mobile Number, Title lines).
 */
const HEADER_KEYWORDS = [
  'date', 'time', 'sender', 'receiver', 'payment id', 'pay/collect',
  'dr/cr', 'status', 'narration', 'description', 'particulars',
  'debit', 'credit', 'withdrawal', 'deposit', 'amount', 'balance',
  'ref', 'utr', 'transaction id', 'chq', 'activity', 'wallet txn id'
];

export function findHeaderRowIndex(rows) {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i].map(c => (c || '').toLowerCase().trim());
    const matchCount = row.filter(cell =>
      HEADER_KEYWORDS.some(kw => cell.includes(kw))
    ).length;

    // Header requires at least 2 distinct banking/UPI keyword matches
    if (matchCount >= 2) {
      return i;
    }
  }
  return 0;
}

/**
 * Detect Statement Format Template
 */
export function detectStatementFormat(headers) {
  const norm = headers.map(h => (h || '').toLowerCase().trim());
  const headerStr = norm.join('|');

  // Format 1: UPI Unified Statement (BHIM / Bank Export)
  // Date, Time, Bank Name, Account Number, Sender, Receiver, Payment ID/Reference Number, Pay/Collect, Amount (in Rs.), DR/CR, Status
  if (
    norm.includes('sender') &&
    norm.includes('receiver') &&
    (headerStr.includes('dr/cr') || norm.includes('dr/cr'))
  ) {
    return {
      formatId: 'upi_unified',
      formatName: 'UPI Unified Statement (BHIM / Bank Export)',
      isRecognized: true,
      mapping: {
        dateCol: norm.findIndex(h => h === 'date'),
        timeCol: norm.findIndex(h => h === 'time'),
        bankCol: norm.findIndex(h => h.includes('bank')),
        accountCol: norm.findIndex(h => h.includes('account')),
        senderCol: norm.findIndex(h => h === 'sender'),
        receiverCol: norm.findIndex(h => h === 'receiver'),
        refCol: norm.findIndex(h => h.includes('payment id') || h.includes('reference')),
        payCollectCol: norm.findIndex(h => h.includes('pay/collect') || h === 'pay/collect'),
        amountCol: norm.findIndex(h => h.includes('amount')),
        typeCol: norm.findIndex(h => h.includes('dr/cr') || h === 'dr/cr'),
        statusCol: norm.findIndex(h => h === 'status'),
        dateFormat: 'dmy',
      },
    };
  }

  // Format 2: Google Pay Statement
  if (
    (headerStr.includes('google transaction id') || headerStr.includes('gpay')) ||
    (norm.includes('to / from') || (norm.includes('description') && norm.includes('transaction id') && norm.includes('amount') && norm.includes('status')))
  ) {
    return {
      formatId: 'google_pay',
      formatName: 'Google Pay UPI Statement',
      isRecognized: true,
      mapping: {
        dateCol: norm.findIndex(h => h.includes('date')),
        timeCol: norm.findIndex(h => h.includes('time')),
        descCol: norm.findIndex(h => h.includes('description') || h.includes('to / from') || h.includes('details')),
        refCol: norm.findIndex(h => h.includes('transaction id') || h.includes('google transaction id') || h.includes('ref')),
        amountCol: norm.findIndex(h => h.includes('amount')),
        statusCol: norm.findIndex(h => h.includes('status')),
        dateFormat: 'auto',
      },
    };
  }

  // Format 3: PhonePe Statement
  if (
    norm.includes('transaction with') ||
    (norm.includes('transaction id') && norm.includes('details') && (norm.includes('type') || norm.includes('amount')))
  ) {
    return {
      formatId: 'phonepe',
      formatName: 'PhonePe Statement',
      isRecognized: true,
      mapping: {
        dateCol: norm.findIndex(h => h.includes('date')),
        descCol: norm.findIndex(h => h.includes('transaction with') || h.includes('details') || h.includes('description')),
        refCol: norm.findIndex(h => h.includes('transaction id') || h.includes('utr') || h.includes('reference')),
        typeCol: norm.findIndex(h => h === 'type' || h.includes('type')),
        amountCol: norm.findIndex(h => h.includes('amount')),
        statusCol: norm.findIndex(h => h.includes('status')),
        dateFormat: 'auto',
      },
    };
  }

  // Format 4: Paytm Statement
  if (
    norm.includes('wallet txn id') ||
    (norm.includes('activity') && norm.includes('source/destination'))
  ) {
    return {
      formatId: 'paytm',
      formatName: 'Paytm Statement',
      isRecognized: true,
      mapping: {
        dateCol: norm.findIndex(h => h.includes('date')),
        timeCol: norm.findIndex(h => h.includes('time')),
        descCol: norm.findIndex(h => h.includes('activity') || h.includes('source/destination') || h.includes('comment')),
        refCol: norm.findIndex(h => h.includes('wallet txn id') || h.includes('order id') || h.includes('txn id')),
        amountCol: norm.findIndex(h => h.includes('amount') || h.includes('transaction breakup')),
        statusCol: norm.findIndex(h => h.includes('status')),
        dateFormat: 'auto',
      },
    };
  }

  // Format 5: Standard Bank Account CSV (HDFC, SBI, ICICI, Axis, Kotak, Generic)
  const hasDebit = norm.some(h => h.includes('debit') || h.includes('withdrawal') || h === 'dr');
  const hasCredit = norm.some(h => h.includes('credit') || h.includes('deposit') || h === 'cr');
  if (hasDebit || hasCredit) {
    return {
      formatId: 'bank_statement',
      formatName: 'Bank Account Statement (Debit/Credit Ledger)',
      isRecognized: true,
      mapping: {
        dateCol: norm.findIndex(h => h.includes('date') && !h.includes('update')),
        descCol: norm.findIndex(h => h.includes('narration') || h.includes('description') || h.includes('particulars') || h.includes('remarks')),
        refCol: norm.findIndex(h => h.includes('ref') || h.includes('chq') || h.includes('utr')),
        debitCol: norm.findIndex(h => (h.includes('debit') || h.includes('withdrawal') || h === 'dr') && !h.includes('total')),
        creditCol: norm.findIndex(h => (h.includes('credit') || h.includes('deposit') || h === 'cr') && !h.includes('total')),
        dateFormat: 'auto',
      },
    };
  }

  // Generic Fallback
  return {
    formatId: 'generic',
    formatName: 'Generic Bank CSV',
    isRecognized: false,
    mapping: guessColumnMapping(headers),
  };
}

/**
 * Intelligent Column Mapping for Custom / Fallback Formats
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
    statusCol: -1,
    dateFormat: 'auto',
  };

  const norm = headers.map(h => (h || '').toLowerCase().trim());

  norm.forEach((h, idx) => {
    if (mapping.dateCol === -1 && (h === 'date' || h === 'txn date' || h === 'transaction date' || (h.includes('date') && !h.includes('update')))) {
      mapping.dateCol = idx;
    }
    if (mapping.debitCol === -1 && (h === 'debit' || h === 'withdrawal' || h === 'dr' || h === 'debit amount' || h.includes('withdrawal'))) {
      mapping.debitCol = idx;
    }
    if (mapping.creditCol === -1 && (h === 'credit' || h === 'deposit' || h === 'cr' || h === 'credit amount' || h.includes('deposit'))) {
      mapping.creditCol = idx;
    }
    if (mapping.amountCol === -1 && (h === 'amount' || h === 'amount (in rs.)' || h === 'txn amount' || h === 'transaction amount')) {
      mapping.amountCol = idx;
    }
    if (mapping.typeCol === -1 && (h === 'type' || h === 'dr/cr' || h === 'cr/dr' || h === 'pay/collect')) {
      mapping.typeCol = idx;
    }
    if (mapping.descCol === -1 && (h === 'narration' || h === 'description' || h === 'particulars' || h === 'receiver' || h === 'remarks' || h.includes('details'))) {
      mapping.descCol = idx;
    }
    if (mapping.refCol === -1 && (h.includes('payment id') || h.includes('reference') || h.includes('utr') || h.includes('chq') || h.includes('txn id'))) {
      mapping.refCol = idx;
    }
    if (mapping.statusCol === -1 && h === 'status') {
      mapping.statusCol = idx;
    }
  });

  return mapping;
}

/**
 * Clean UPI entity string: extracts readable human/merchant name from `vpa(NAME)` or VPA handle.
 * Masks sensitive mobile numbers where applicable.
 */
export function cleanUpiEntity(raw) {
  if (!raw) return 'Unknown Party';
  const str = String(raw).trim();

  // 1. Check parenthesized name, e.g. "xxxxx09933@ybl(NARAYANA BHIMA)" -> "NARAYANA BHIMA"
  const parenMatch = str.match(/\(([^)]+)\)/);
  if (parenMatch && parenMatch[1].trim()) {
    const inside = parenMatch[1].trim();
    // If not all masked 'xxxx'
    if (!/^x+$/i.test(inside.replace(/[^a-zA-Z0-9]/g, ''))) {
      return inside;
    }
  }

  // 2. Check handle before @, e.g. "swiggy@icici" -> "Swiggy"
  const atMatch = str.match(/^([^@()]+)@/);
  if (atMatch && atMatch[1].trim()) {
    const handle = atMatch[1].trim();
    if (!/^x+$/i.test(handle.replace(/[^a-zA-Z0-9]/g, '')) && !/^\d{10}$/.test(handle)) {
      return handle.charAt(0).toUpperCase() + handle.slice(1);
    }
  }

  // 3. Fallback to inside parentheses or cleaned string
  if (parenMatch && parenMatch[1].trim()) return parenMatch[1].trim();
  return str.split('@')[0] || str;
}

/**
 * Checks if status indicates successful completion.
 * Rejects failed, declined, cancelled, or pending transactions.
 */
export function isSuccessfulStatus(statusRaw) {
  if (!statusRaw || typeof statusRaw !== 'string') return true; // Default to true if statement doesn't have status column (bank ledger)
  const s = statusRaw.trim().toUpperCase();
  if (s === 'SUCCESS' || s === 'SUCCESSFUL' || s === 'COMPLETED' || s === 'PAID' || s === 'DONE' || s === 'EXECUTED' || s === 'PROCESSED' || s === 'CLEARED') {
    return true;
  }
  return false;
}

/**
 * Cleans numerical amount string (removes ₹, Rs., INR, commas, whitespace)
 */
export function cleanAmount(val) {
  if (val === null || val === undefined) return null;
  let str = String(val).trim();
  if (!str || str === '-' || str === '--') return null;

  str = str.replace(/(₹|Rs\.?|INR|\$|€|£)/gi, '').trim();
  str = str.replace(/,/g, '');

  let isNegative = false;
  if (str.startsWith('-') || str.endsWith('-')) {
    isNegative = true;
    str = str.replace(/-/g, '');
  }

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

const MONTH_NAMES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

export function parseDateString(raw, formatHint = 'auto') {
  if (!raw || typeof raw !== 'string') return null;
  const str = raw.trim();
  if (!str) return null;

  // ISO: YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (isValidDate(y, m, d)) return formatDate(y, m, d);
  }

  // Alpha month: 24-Mar-2026 or 24 Mar 2026
  const alphaMatch = str.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,9})[-/\s](\d{2,4})(?:[T\s].*)?$/);
  if (alphaMatch) {
    const d = parseInt(alphaMatch[1], 10);
    const mName = alphaMatch[2].toLowerCase();
    let y = parseInt(alphaMatch[3], 10);
    if (y < 100) y += 2000;
    const m = MONTH_NAMES[mName];
    if (m && isValidDate(y, m, d)) return formatDate(y, m, d);
  }

  // Delimited: DD/MM/YYYY or MM/DD/YYYY
  const numMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[T\s].*)?$/);
  if (numMatch) {
    const first = parseInt(numMatch[1], 10);
    const second = parseInt(numMatch[2], 10);
    let y = parseInt(numMatch[3], 10);
    if (y < 100) y += 2000;

    if (formatHint === 'mdy') {
      if (isValidDate(y, first, second)) return formatDate(y, first, second);
    } else if (formatHint === 'dmy') {
      if (isValidDate(y, second, first)) return formatDate(y, second, first);
    }

    if (first > 12 && second <= 12) {
      if (isValidDate(y, second, first)) return formatDate(y, second, first);
    }
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
 * Smart Auto-Categorization Engine
 * Maps transaction keywords against categories present in the database.
 */
const CATEGORY_KEYWORDS = {
  expense: [
    {
      category: 'Food',
      keywords: [
        'swiggy', 'zomato', 'restaurant', 'cafe', 'dining', 'kitchen', 'bites',
        'bakery', 'starbucks', 'tea', 'chai', 'coffee', 'pizza', 'burger',
        'mcdonald', 'kfc', 'blinkit', 'zepto', 'instamart', 'bigbasket',
        'grocer', 'supermarket', 'meat', 'chicken', 'hotel', 'dhaba', 'tiffin',
        'canteen', 'eats', 'food', 'snack', 'dosa', 'biryani', 'sweets', 'juice'
      ]
    },
    {
      category: 'Travel',
      keywords: [
        'uber', 'ola', 'rapido', 'metro', 'irctc', 'train', 'bus', 'railway',
        'flight', 'indigo', 'airasia', 'redbus', 'makemytrip', 'petrol', 'fuel',
        'diesel', 'indianoil', 'hpcl', 'bpcl', 'shell', 'toll', 'fastag',
        'auto', 'cab', 'driver', 'transport', 'parking', 'airlines'
      ]
    },
    {
      category: 'Shopping',
      keywords: [
        'amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'croma',
        'reliance', 'retail', 'fashion', 'clothes', 'store', 'mall', 'mart',
        'cloth', 'jewel', 'footwear', 'zudio', 'decathlon', 'lenskart',
        'shopping', 'bazaar', 'textiles', 'trends'
      ]
    },
    {
      category: 'Bills',
      keywords: [
        'bill', 'electricity', 'bescom', 'water', 'gas', 'recharge', 'airtel',
        'jio', 'vi', 'vodafone', 'broadband', 'wifi', 'dth', 'tataplay',
        'postpaid', 'prepaid', 'credit card', 'emi', 'loan', 'insurance', 'lic'
      ]
    },
    {
      category: 'Entertainment',
      keywords: [
        'netflix', 'spotify', 'hotstar', 'prime video', 'youtube', 'cinema',
        'pvr', 'inox', 'movie', 'playstation', 'steam', 'game', 'gaming',
        'ticket', 'bookmyshow', 'music'
      ]
    },
    {
      category: 'Healthcare',
      keywords: [
        'health', 'medical', 'pharmacy', 'chemist', 'apollo', 'medplus',
        '1mg', 'pharma', 'hospital', 'clinic', 'doctor', 'dental', 'diagnostic',
        'lab', 'pathology', 'medicals', 'opticals'
      ]
    },
    {
      category: 'Education',
      keywords: [
        'education', 'school', 'college', 'university', 'tuition', 'coaching',
        'class', 'course', 'udemy', 'coursera', 'books', 'stationary', 'fee', 'academy'
      ]
    },
    {
      category: 'Utilities',
      keywords: [
        'utility', 'utilities', 'maintenance', 'repair', 'cleaning', 'plumber',
        'electrician', 'service'
      ]
    }
  ],
  income: [
    {
      category: 'Salary',
      keywords: [
        'salary', 'payroll', 'stipend', 'wages', 'remuneration', 'infosys',
        'tcs', 'wipro', 'accenture', 'cognizant', 'hcl', 'tech mahindra',
        'google', 'microsoft', 'amazon', 'corp', 'limited', 'pvt ltd'
      ]
    },
    {
      category: 'Freelance',
      keywords: ['freelance', 'upwork', 'fiverr', 'toptal', 'contract', 'consulting', 'gig']
    },
    {
      category: 'Investment',
      keywords: [
        'investment', 'zerodha', 'groww', 'upstox', 'angel', 'kuvera',
        'mutual fund', 'sip', 'nse', 'bse', 'equity', 'shares', 'crypto'
      ]
    },
    {
      category: 'Dividends',
      keywords: ['dividend', 'interest', 'fd', 'rd', 'yield']
    },
    {
      category: 'Rental',
      keywords: ['rent', 'rental', 'tenant', 'lease']
    },
    {
      category: 'Bonus',
      keywords: ['bonus', 'reward', 'cashback', 'incentive', 'refund', 'reversal']
    },
    {
      category: 'Business',
      keywords: ['business', 'sales', 'vendor', 'customer', 'client', 'invoice']
    }
  ]
};

export function autoCategorize(text, direction, dbCategories) {
  const normText = (text || '').toLowerCase();
  const type = direction === 'debit' ? 'expense' : 'income';
  const rules = CATEGORY_KEYWORDS[type] || [];

  // Match against keywords
  for (const rule of rules) {
    for (const kw of rule.keywords) {
      if (normText.includes(kw)) {
        // Find category_id in user's DB categories
        const matchedDbCat = dbCategories.find(c =>
          c.category_type === type && c.category_name.toLowerCase() === rule.category.toLowerCase()
        );
        if (matchedDbCat) {
          return {
            categoryId: matchedDbCat.category_id,
            categoryName: matchedDbCat.category_name,
            matchedKeyword: kw,
          };
        }
      }
    }
  }

  // Fallback to "Other Expense" or "Other Income"
  const fallbackName = type === 'expense' ? 'other expense' : 'other income';
  const fallbackCat = dbCategories.find(c =>
    c.category_type === type && c.category_name.toLowerCase() === fallbackName
  ) || dbCategories.find(c => c.category_type === type);

  return {
    categoryId: fallbackCat?.category_id || null,
    categoryName: fallbackCat?.category_name || (type === 'expense' ? 'Other Expense' : 'Other Income'),
    matchedKeyword: null,
  };
}

/**
 * Universal Statement Parser & Normalizer
 * Handles both automated one-click ingestion and manual mapping fallbacks.
 */
export function parseAndNormalizeStatement(csvText, options = {}) {
  const { userId, categories = [], existingFingerprints = new Set(), customMapping = null } = options;

  const delimiter = detectDelimiter(csvText);
  const rows = parseCSV(csvText, delimiter);
  if (rows.length === 0) {
    throw new Error('CSV statement file contains no readable data.');
  }

  const headerIdx = findHeaderRowIndex(rows);
  const headers = rows[headerIdx] || [];
  const formatInfo = detectStatementFormat(headers);
  const activeMapping = customMapping || formatInfo.mapping;

  const successfulRows = [];
  const duplicateRows = [];
  const skippedFailedRows = [];
  const invalidRows = [];
  const seenBatchFingerprints = new Set();

  for (let idx = headerIdx + 1; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNumber = idx + 1;

    // Skip empty lines
    if (!row || row.every(c => !c || c.trim().length === 0)) {
      continue;
    }

    // 1. Status Check (UPI status: SUCCESS, FAILURE, etc.)
    const rawStatus = activeMapping.statusCol >= 0 && activeMapping.statusCol < row.length
      ? row[activeMapping.statusCol]
      : null;

    if (rawStatus && !isSuccessfulStatus(rawStatus)) {
      skippedFailedRows.push({
        rowNumber,
        status: rawStatus.trim(),
        reason: `Payment status was '${rawStatus.trim()}'. Non-successful transactions are skipped.`,
        rawData: row,
      });
      continue;
    }

    // 2. Date parsing
    const rawDate = activeMapping.dateCol >= 0 && activeMapping.dateCol < row.length ? row[activeMapping.dateCol] : '';
    const parsedDate = parseDateString(rawDate, activeMapping.dateFormat || 'auto');
    if (!parsedDate) {
      invalidRows.push({
        rowNumber,
        reason: `Invalid transaction date ('${rawDate || 'empty'}'). Expected DD/MM/YYYY or YYYY-MM-DD.`,
        rawData: row,
      });
      continue;
    }

    // 3. Direction and Amount
    let amount = null;
    let direction = null;

    // A. Separate Debit / Credit columns
    const hasDebitCol = activeMapping.debitCol >= 0 && activeMapping.debitCol < row.length;
    const hasCreditCol = activeMapping.creditCol >= 0 && activeMapping.creditCol < row.length;
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

    // B. Amount with DR/CR or Type column (e.g. UPI Unified Statement)
    if (amount === null && activeMapping.amountCol >= 0 && activeMapping.amountCol < row.length) {
      const amtParsed = cleanAmount(row[activeMapping.amountCol]);
      if (amtParsed && amtParsed.value > 0) {
        amount = amtParsed.value;

        if (activeMapping.typeCol >= 0 && activeMapping.typeCol < row.length) {
          const typeVal = (row[activeMapping.typeCol] || '').trim().toUpperCase();
          if (typeVal === 'DR' || typeVal.startsWith('DEBIT') || typeVal === 'W' || typeVal === 'PAY') {
            direction = 'debit';
          } else if (typeVal === 'CR' || typeVal.startsWith('CREDIT') || typeVal === 'D' || typeVal === 'COLLECT') {
            direction = 'credit';
          }
        }

        if (!direction && amtParsed.suffixType) direction = amtParsed.suffixType;
        if (!direction && amtParsed.isNegative) direction = 'debit';
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

    // 4. Counterparty & Merchant Extraction
    let counterparty = '';
    let bankName = '';
    let rawReference = '';

    if (formatInfo.formatId === 'upi_unified') {
      const sender = activeMapping.senderCol >= 0 ? row[activeMapping.senderCol] : '';
      const receiver = activeMapping.receiverCol >= 0 ? row[activeMapping.receiverCol] : '';
      bankName = activeMapping.bankCol >= 0 ? row[activeMapping.bankCol] : '';
      rawReference = activeMapping.refCol >= 0 ? row[activeMapping.refCol] : '';

      // If user is paying (DR), counterparty is Receiver; if user is receiving (CR), counterparty is Sender
      counterparty = direction === 'debit' ? cleanUpiEntity(receiver) : cleanUpiEntity(sender);
    } else {
      const rawDesc = activeMapping.descCol >= 0 ? row[activeMapping.descCol] : '';
      rawReference = activeMapping.refCol >= 0 ? row[activeMapping.refCol] : '';
      counterparty = cleanUpiEntity(rawDesc);
    }

    // Reference / UTR
    let reference = (rawReference || '').trim() || null;
    if (!reference) {
      const upiRefMatch = counterparty.match(/(?:UPI|UTR|REF|TXN)[:\s\-/]*([0-9]{10,18})/i)
        || counterparty.match(/\b([0-9]{12})\b/);
      if (upiRefMatch) reference = upiRefMatch[1];
    }

    // Clean description for database
    const cleanMerchant = (counterparty || 'UPI Transaction').slice(0, 180);
    const cleanDescription = `${direction === 'debit' ? 'Payment to' : 'Payment from'} ${cleanMerchant}${bankName ? ` (${bankName})` : ''}${reference ? ` - Ref: ${reference}` : ''}`.slice(0, 240);

    // 5. Deterministic SHA-256 Fingerprint
    const identityString = `${userId || 'web'}|${parsedDate}|${amount.toFixed(2)}|${direction}|${reference || cleanMerchant.toLowerCase()}`;
    const fingerprint = crypto.createHash('sha256').update(identityString).digest('hex');

    // 6. Deduplication Check
    const isDuplicate = existingFingerprints.has(fingerprint) || seenBatchFingerprints.has(fingerprint);
    seenBatchFingerprints.add(fingerprint);

    // 7. Auto-Categorization
    const categoryResult = autoCategorize(`${cleanMerchant} ${cleanDescription}`, direction, categories);

    const transactionItem = {
      rowNumber,
      transactionDate: parsedDate,
      amount: Number(amount.toFixed(2)),
      currency: 'INR',
      direction, // 'debit' or 'credit'
      merchant: cleanMerchant,
      description: cleanDescription,
      reference,
      fingerprint,
      categoryId: categoryResult.categoryId,
      categoryName: categoryResult.categoryName,
      isDuplicate,
      status: isDuplicate ? 'duplicate' : 'approved',
    };

    if (isDuplicate) {
      duplicateRows.push(transactionItem);
    } else {
      successfulRows.push(transactionItem);
    }
  }

  return {
    headers,
    headerRowIndex: headerIdx,
    formatId: formatInfo.formatId,
    formatName: formatInfo.formatName,
    isRecognized: formatInfo.isRecognized,
    mapping: activeMapping,
    totalRows: rows.length - headerIdx - 1,
    successfulRows,
    duplicateRows,
    skippedFailedRows,
    invalidRows,
  };
}

// Keep legacy helper for compatibility with tests
export function parseStatementRows(rawRows, mapping, options = {}) {
  const dummyCsv = rawRows.map(r => r.join(',')).join('\n');
  const res = parseAndNormalizeStatement(dummyCsv, {
    userId: options.userId,
    existingFingerprints: options.existingFingerprints,
    customMapping: mapping,
  });
  return {
    headers: res.headers,
    headerRowIndex: res.headerRowIndex,
    mapping: res.mapping,
    validRows: [...res.successfulRows, ...res.duplicateRows],
    invalidRows: [...res.invalidRows, ...res.skippedFailedRows],
  };
}

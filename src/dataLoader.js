// ─── CSV PARSER ──────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/^\uFEFF/, ''));
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (values[i] || '').trim(); });
    return row;
  }).filter(row => Object.values(row).some(v => v));
}

// ─── FETCH ───────────────────────────────────────────────────────────────────
export async function fetchCSV(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseCSV(await res.text());
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthKey(date) { return MONTH_NAMES[date.getMonth()]; }
function monthKeyYY(date) { return `${MONTH_NAMES[date.getMonth()]}'${String(date.getFullYear()).slice(2)}`; }

function parseDate(str) {
  if (!str) return null;
  // ISO: YYYY-MM-DD or YYYY/MM/DD
  let m = str.match(/^(\d{4})[-\/](\d{2})[-\/](\d{2})/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  // DD/MM/YYYY, DD-MM-YYYY, D/M/YYYY (Australian full year)
  m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  // DD/MM/YY, DD-MM-YY, D/M/YY (short year — assume 2000s)
  m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (m) return new Date(2000 + parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  return null;
}

function findCol(row, variants) {
  const rowKeys = Object.keys(row);
  const rowKeysLower = rowKeys.map(k => k.toLowerCase().trim());
  for (const v of variants) {
    const idx = rowKeysLower.indexOf(v.toLowerCase());
    if (idx !== -1) return rowKeys[idx];
  }
  return null;
}

function parseAmount(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/[$,\s]/g, '')) || 0;
}

function getSortedMonths(dates) {
  if (dates.length === 0) return [];
  const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
  const months = [];
  const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cur <= maxDate) {
    months.push({ key: monthKey(cur), year: cur.getFullYear(), month: cur.getMonth() });
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

// ─── BANK FORMAT DETECTION ───────────────────────────────────────────────────

export function detectBankFormat(rows) {
  const unknown = (confidence = 'manual') => ({
    bank: 'unknown', bankLabel: 'Unknown Bank', confidence,
    columns: { date: null, description: null, amount: null, debit: null, credit: null, balance: null, category: null },
    amountStyle: 'single',
  });

  if (!rows || rows.length === 0) return unknown();

  const sample = rows[0];
  const headers = Object.keys(sample);
  const headersLower = headers.map(h => h.toLowerCase().trim());
  const headerSet = new Set(headersLower);

  // Returns the original-case header name for the first matching lowercase keyword
  function col(...names) {
    for (const name of names) {
      const idx = headersLower.indexOf(name.toLowerCase());
      if (idx !== -1) return headers[idx];
    }
    return null;
  }

  // All of names must be present (superset check)
  function has(...names) {
    return names.every(n => headerSet.has(n.toLowerCase()));
  }

  // Headers must match exactly (same count + same names)
  function exact(...names) {
    return headersLower.length === names.length && names.every(n => headerSet.has(n.toLowerCase()));
  }

  // ── Tier 1: Known bank by exact header match ────────────────────────────────

  // CommSec — check early; 'security code' is very distinctive
  if (has('security code') || has('mkt value $') || has('mkt value') || has('market value')) {
    return {
      bank: 'commsec', bankLabel: 'CommSec', confidence: 'exact',
      columns: { date: null, description: null, amount: null, debit: null, credit: null, balance: null, category: null },
      amountStyle: 'single',
    };
  }

  // Up Bank — 'subtotal' column is unique to Up Bank exports
  if (has('transaction type', 'subtotal')) {
    return {
      bank: 'upbank', bankLabel: 'Up Bank', confidence: 'exact',
      columns: {
        date:        col('date', 'transaction date'),
        description: col('description', 'merchant', 'name'),
        amount:      col('value', 'amount', 'debit/credit'),
        debit: null, credit: null,
        balance:     null,
        category:    col('category', 'up category'),
      },
      amountStyle: 'single',
    };
  }

  // PayPal — 'gross' column is distinctive; guard with 'name' to avoid false positives
  if (has('gross') || (has('status') && has('name') && has('date'))) {
    return {
      bank: 'paypal', bankLabel: 'PayPal', confidence: 'exact',
      columns: {
        date:        col('date'),
        description: col('name', 'description'),
        amount:      col('gross', 'amount'),
        debit: null, credit: null,
        balance: null, category: null,
      },
      amountStyle: 'single',
    };
  }

  // BankWest — 'bsb' column is unique to BankWest exports
  if (has('bsb', 'account number', 'transaction date', 'description', 'debit', 'credit', 'balance', 'transaction type')) {
    return {
      bank: 'bankwest', bankLabel: 'BankWest', confidence: 'exact',
      columns: {
        date:        col('transaction date'),
        description: col('description'),
        amount: null,
        debit:        col('debit'),
        credit:       col('credit'),
        balance:      col('balance'),
        category: null,
      },
      amountStyle: 'split',
    };
  }

  // Macquarie — 'account name' + 'debit amount' / 'credit amount' combo is distinctive
  if (has('account name', 'transaction date', 'transaction description', 'debit amount', 'credit amount')) {
    return {
      bank: 'macquarie', bankLabel: 'Macquarie Bank', confidence: 'exact',
      columns: {
        date:        col('transaction date'),
        description: col('transaction description'),
        amount: null,
        debit:        col('debit amount'),
        credit:       col('credit amount'),
        balance:      col('balance'),
        category: null,
      },
      amountStyle: 'split',
    };
  }

  // NAB — 'transaction id' + 'transaction details' combo is distinctive
  if (has('date', 'amount', 'transaction id', 'transaction type', 'transaction details', 'balance')) {
    return {
      bank: 'nab', bankLabel: 'National Australia Bank', confidence: 'exact',
      columns: {
        date:        col('date'),
        description: col('transaction details'),
        amount:      col('amount'),
        debit: null, credit: null,
        balance:     col('balance'),
        category: null,
      },
      amountStyle: 'single',
    };
  }

  // ANZ — exactly 3 columns: Date, Amount, Description (no Balance)
  if (exact('date', 'amount', 'description')) {
    return {
      bank: 'anz', bankLabel: 'ANZ', confidence: 'exact',
      columns: {
        date:        col('date'),
        description: col('description'),
        amount:      col('amount'),
        debit: null, credit: null,
        balance: null, category: null,
      },
      amountStyle: 'single',
    };
  }

  // St George / BOQ — exactly 5 columns: Date, Description, Debit, Credit, Balance
  // Both banks share this identical header set; default to St George
  if (exact('date', 'description', 'debit', 'credit', 'balance')) {
    return {
      bank: 'stgeorge', bankLabel: 'St.George / BOQ', confidence: 'exact',
      columns: {
        date:        col('date'),
        description: col('description'),
        amount: null,
        debit:        col('debit'),
        credit:       col('credit'),
        balance:      col('balance'),
        category: null,
      },
      amountStyle: 'split',
    };
  }

  // CBA / Westpac — exactly 4 columns: Date, Amount, Description, Balance
  // Differentiate by scanning description values for Westpac-style prefixes
  if (exact('date', 'amount', 'description', 'balance')) {
    const descColName = col('description');
    const westpacPatterns = [
      /^VISA DEBIT/i, /^EFTPOS DEBIT/i, /^OSKO PAYMENT/i, /^OSKO RECEIPT/i,
      /^ATM WITHDRAWAL/i, /^BPAY INTERNET/i, /^DIRECT DEBIT/i, /^INTERNET TRANSFER/i,
    ];
    const sampleDescs = rows.slice(0, 20).map(r => r[descColName] || '');
    const looksLikeWestpac = sampleDescs.some(d => westpacPatterns.some(p => p.test(d)));

    if (looksLikeWestpac) {
      return {
        bank: 'westpac', bankLabel: 'Westpac', confidence: 'inferred',
        columns: {
          date:        col('date'),
          description: col('description'),
          amount:      col('amount'),
          debit: null, credit: null,
          balance:     col('balance'),
          category: null,
        },
        amountStyle: 'single',
      };
    }

    return {
      bank: 'cba', bankLabel: 'Commonwealth Bank', confidence: 'exact',
      columns: {
        date:        col('date'),
        description: col('description'),
        amount:      col('amount'),
        debit: null, credit: null,
        balance:     col('balance'),
        category: null,
      },
      amountStyle: 'single',
    };
  }

  // ── Tier 2: Shape detection (unknown bank, recognisable structure) ──────────

  // keyword → header search (partial match, order = priority)
  function findByKeyword(...keywords) {
    for (const kw of keywords) {
      const idx = headersLower.findIndex(h => h.includes(kw.toLowerCase()));
      if (idx !== -1) return headers[idx];
    }
    return null;
  }

  const t2Date    = findByKeyword('date');
  const t2Desc    = findByKeyword('description', 'narrative', 'details', 'memo', 'reference', 'particulars');
  const t2Amount  = findByKeyword('amount', 'value');
  const t2Debit   = findByKeyword('debit', 'withdrawal');
  const t2Credit  = findByKeyword('credit', 'deposit');
  const t2Balance = findByKeyword('balance');

  if (t2Date || t2Desc || t2Amount || t2Debit || t2Credit) {
    const isSplit = !!(t2Debit && t2Credit);
    return {
      bank: 'unknown', bankLabel: 'Unknown Bank', confidence: 'inferred',
      columns: {
        date:        t2Date,
        description: t2Desc,
        amount:      isSplit ? null : t2Amount,
        debit:       isSplit ? t2Debit  : null,
        credit:      isSplit ? t2Credit : null,
        balance:     t2Balance,
        category: null,
      },
      amountStyle: isSplit ? 'split' : 'single',
    };
  }

  // ── Tier 3: Manual mapping needed ──────────────────────────────────────────
  return unknown('manual');
}

// ─── UP BANK ─────────────────────────────────────────────────────────────────

// ─── UNIVERSAL CATEGORISATION ENGINE ─────────────────────────────────────────
// Maps transaction description patterns → spending categories.
// Used by all bank CSV parsers (Up Bank, CBA, NAB, Westpac, ANZ, etc.).
// UPBANK_CATEGORY_MAP takes priority when present; this map is the fallback
// for banks that don't include a category column in their CSV exports.
// ORDER MATTERS: the loop breaks on the first match, so more specific patterns
// must appear before broader ones (e.g. grocery_delivery before grocery,
// delivery before transport, health before insurance).
const MERCHANT_MAP = {
  // ── Subscriptions & digital services ──────────────────────────────────────
  // Must come before amazon/paypal so "Amazon Prime" → sub, not amazon
  sub: [
    /netflix/i, /spotify/i, /\bstan\b/i, /disney\+/i, /disney plus/i,
    /youtube premium/i, /\bkayo\b/i, /\bbinge\b/i, /foxtel/i,
    /paramount\+/i, /paramount plus/i, /amazon prime/i,
    /\badobe\b/i, /\bcanva\b/i, /chatgpt/i, /openai/i,
    /\bclaude\b/i, /anthropic/i, /microsoft 365/i, /\bdropbox\b/i,
    /\bicloud\b/i, /grammarly/i, /\baudible\b/i, /\bkindle\b/i,
    /\bpatreon\b/i, /\bgithub\b/i, /\bnotion\b/i, /crunchyroll/i, /\bdazn\b/i,
    /apple\.com/i, /app store/i, /apple music/i, /apple one/i, /apple tv/i,
    /google one/i, /google workspace/i, /google storage/i,
    /tidal/i, /xbox.*game\s?pass/i, /playstation.*plus/i, /\bps\s?plus\b/i,
    /nintendo.*online/i, /\btwitch\b/i, /\bplex\b/i,
    /nordvpn/i, /expressvpn/i, /surfshark/i,
  ],

  // ── Legacy merchant trackers (kept for existing chart aggregations) ────────
  amazon: [/amazon/i, /amzn/i],
  paypal: [/paypal/i],

  // ── Buy Now Pay Later ─────────────────────────────────────────────────────
  bnpl: [
    /afterpay/i, /zip\s?pay/i, /zip\s?money/i, /zip\s?co/i,
    /klarna/i, /\bhumm\b/i, /latitude\s?pay/i, /openpay/i,
    /brighte/i, /payright/i, /limepay/i, /splitit/i, /laybuy/i,
  ],

  // ── Grocery delivery (before grocery — "Woolworths Online" → grocery_delivery) ──
  grocery_delivery: [
    /woolworths online/i, /coles online/i, /amazon fresh/i,
    /\bmilkrun\b/i, /\bvoly\b/i,
  ],

  // ── Groceries ─────────────────────────────────────────────────────────────
  grocery: [
    /\bwoolworths\b/i, /\bwoolies\b/i, /\bcoles\b/i, /\baldi\b/i,
    /\biga\b/i, /harris farm/i, /\bcostco\b/i, /foodworks/i,
    /spudshed/i, /\bdrakes\b/i, /ritchies/i, /farmer jacks/i,
    /fresh provisions/i,
  ],

  // ── Food & drink ──────────────────────────────────────────────────────────
  restaurant: [
    /restaurant/i, /\bcafe\b/i, /dining/i, /bistro/i, /\bpizza\b/i,
    /\bsushi\b/i, /\bthai\b/i, /\bindian\b/i, /\bchinese\b/i,
    /\bgrill\b/i, /\bkitchen\b/i, /bar & grill/i, /bar and grill/i,
    /\bburger\b/i,
  ],
  takeaway: [
    /mcdonald/i, /maccas/i, /\bkfc\b/i, /hungry jack/i, /\bsubway\b/i,
    /guzman/i, /nando/i, /dominos/i, /domino's/i, /\bgrill'd\b/i,
    /oporto/i, /red rooster/i, /zambrero/i, /roll'd/i,
    /betty's burger/i, /schnitz/i,
  ],
  coffee: [
    /coffee/i, /barista/i, /starbucks/i, /gloria jean/i, /mecca.*espresso/i,
    /patricia.*coffee/i, /market lane/i, /\baxil\b/i, /st ali/i,
    /industry beans/i, /\bcampos\b/i, /single o/i,
  ],

  // ── Alcohol ───────────────────────────────────────────────────────────────
  alcohol: [
    /\bbws\b/i, /dan murphy/i, /liquorland/i, /first choice liquor/i,
    /vintage cellars/i, /jimmy brings/i, /endeavour group/i,
    /wine selectors/i, /vinomofo/i, /naked wines/i,
  ],

  // ── Delivery apps (before transport — "Uber Eats" → delivery, not transport) ──
  delivery: [/doordash/i, /uber eats/i, /menulog/i, /deliveroo/i],

  // ── Transport ─────────────────────────────────────────────────────────────
  transport: [
    /\bmyki\b/i, /\bopal\b/i, /\bgo card\b/i, /translink/i,
    /\buber\b(?!.*eats)/i, /\bdidi\b/i, /\bola\b/i, /\btaxi\b/i,
    /\b13cabs\b/i, /ingogo/i, /\blime\b/i, /\bbeam\b/i, /neuron/i,
    /\btram\b/i, /\bferry\b/i, /\bmetro\b/i,
  ],

  // ── Vehicle ───────────────────────────────────────────────────────────────
  fuel: [
    /\bbp\b/i, /shell/i, /7.?eleven/i, /puma/i, /coles express/i,
    /ampol/i, /united petrol/i, /costco fuel/i, /liberty petrol/i,
    /metro petroleum/i, /speedway/i, /\bvibe\b/i,
    /\beg\s/i, /eg australia/i, /eg fuel/i, /mobil/i,
  ],
  toll: [
    /citylink/i, /eastlink/i, /\blinkt\b/i, /mylinkt/i, /e-toll/i,
    /\be-tag\b/i, /\broam\b/i, /\bm5\b/i, /\bm7\b/i, /westconnex/i,
    /go via/i,
  ],

  // ── Parking ───────────────────────────────────────────────────────────────
  parking: [
    /wilson parking/i, /secure parking/i, /care park/i, /easypark/i,
    /paystay/i, /park.*meter/i, /\bparking\b/i, /cellopark/i, /\bdivvy\b/i,
  ],

  // ── Car ───────────────────────────────────────────────────────────────────
  // Before insurance so RACV/NRMA/RACQ → car (roadside assist), not insurance
  car: [
    /\brego\b/i, /registration/i, /vicroads/i, /service nsw.*rego/i,
    /bridgestone/i, /beaurepaires/i, /bob jane/i, /jax tyres/i,
    /car wash/i, /\bmycar\b/i, /ultratune/i, /kmart tyre/i,
    /\bracv\b/i, /\bnrma\b/i, /\bracq\b/i, /roadside/i,
  ],

  // ── Home bills ────────────────────────────────────────────────────────────
  utilities: [
    /\bagl\b/i, /origin energy/i, /energy australia/i, /alinta/i,
    /red energy/i, /lumo energy/i, /simply energy/i, /powershop/i,
    /momentum energy/i, /globibird/i, /yarra valley water/i,
    /sydney water/i, /\bsa water\b/i, /city west water/i,
    /south east water/i, /council rates/i,
  ],
  telco: [
    /telstra/i, /\boptus\b/i, /vodafone/i, /aussie broadband/i,
    /\btpg\b/i, /\biinet\b/i, /tangerine telecom/i, /\bbelong\b/i,
    /spintel/i, /\bdodo\b/i, /exetel/i, /superloop/i,
    /buddy telco/i, /mate communicate/i, /amaysim/i,
  ],

  // ── Health (before insurance — "Bupa Dental" → health, not insurance) ─────
  health: [
    /chemist warehouse/i, /priceline pharmacy/i, /terrywhite/i,
    /terry white/i, /\bblooms\b/i, /ramsay health/i, /healthscope/i,
    /bupa dental/i, /hcf dental/i, /pacific smiles/i,
    /maven dental/i, /national dental/i, /\bdental\b/i,
    /optometrist/i, /pathology/i, /radiology/i,
    /\bi-med\b/i, /sonic health/i, /laverty/i, /qml pathology/i,
  ],
  insurance: [
    /\baami\b/i, /allianz/i, /\bbupa\b/i, /medibank/i, /\bhcf\b/i,
    /\bnib\b/i, /\bahm\b/i, /\bracv\b/i, /\bnrma\b/i, /suncorp/i,
    /\bcgu\b/i, /\bqbe\b/i, /\bgio\b/i, /budget direct/i,
    /\byoui\b/i, /real insurance/i, /\btid\b/i, /woolworths insurance/i,
  ],

  // ── Lifestyle ─────────────────────────────────────────────────────────────
  fitness: [
    /fitness first/i, /anytime fitness/i, /\bf45\b/i, /\bjetts\b/i,
    /goodlife/i, /virgin active/i, /barry's/i, /plus fitness/i,
    /snap fitness/i, /\bgym\b/i, /crossfit/i, /\byoga\b/i,
    /pilates/i, /\brouvy\b/i, /\bzwift\b/i, /\bstrava\b/i,
    /les mills/i, /peloton/i, /fernwood/i, /\bcurves\b/i,
    /aquatic/i, /\bswim\b/i, /martial arts/i, /boxing/i, /\bmma\b/i,
  ],

  // ── Personal care ─────────────────────────────────────────────────────────
  personal_care: [
    /hairdress/i, /\bbarber\b/i, /beauty/i, /\bnails?\b/i, /\bsalon\b/i,
    /\bwax\b/i, /laser clinics/i, /endota/i, /just cuts/i,
    /ella bache/i, /brazilian butterfly/i,
  ],

  education: [
    /university/i, /\btafe\b/i, /coursera/i, /udemy/i,
    /skillshare/i, /linkedin learning/i, /textbook/i,
  ],

  // ── School ────────────────────────────────────────────────────────────────
  school: [
    /school fees/i, /school fund/i, /\bpsw\b/i, /lowes.*uniform/i,
    /school photo/i, /book\s?list/i, /canteen/i, /excursion/i,
  ],

  // ── Childcare ─────────────────────────────────────────────────────────────
  childcare: [
    /childcare/i, /child care/i, /\bkindi\b/i, /kinderloop/i,
    /camp australia/i, /goodstart/i, /g8 education/i, /little scholars/i,
    /before.?school/i, /after.?school/i, /family day care/i,
  ],

  clothing: [
    /uniqlo/i, /\bzara\b/i, /\bh&m\b/i, /cotton on/i, /country road/i,
    /\bmyer\b/i, /david jones/i, /the iconic/i, /\basos\b/i,
  ],
  home: [
    /bunnings/i, /\bikea\b/i, /\bkmart\b/i, /\btarget\b/i,
    /officeworks/i, /harvey norman/i, /jb hi-fi/i, /jb hifi/i,
    /the good guys/i, /fantastic furniture/i, /\bfreedom\b/i,
    /temple & webster/i, /\badairs\b/i,
    /mitre 10/i, /beacon lighting/i, /carpet court/i,
    /\bplumb/i, /electrician/i, /handyman/i,
    /hire a hubby/i, /jim.?s mowing/i,
  ],
  pets: [
    /petstock/i, /petbarn/i, /city farmers/i, /greencross/i, /\bvet\b/i,
  ],

  // ── Kids ──────────────────────────────────────────────────────────────────
  kids: [
    /baby bunting/i, /cotton on kids/i, /best & less/i, /best and less/i,
    /toys r us/i, /toy world/i, /mr toys/i, /kidstuff/i,
  ],

  // ── Gifts ─────────────────────────────────────────────────────────────────
  gifts: [
    /interflora/i, /florist/i, /\bt2 tea\b/i, /gift\s?card/i,
    /smiggle/i, /\btypo\b/i, /hallmark/i, /kikki\s?k/i,
  ],

  travel: [
    /airbnb/i, /booking\.com/i, /expedia/i, /\bhotel/i,
    /\bqantas\b/i, /virgin australia/i, /jetstar/i, /rex airlines/i,
    /skyscanner/i, /\bflight\b/i,
    /\bbonza\b/i, /tigerair/i, /regional express/i, /\brex\b/i,
    /webjet/i, /trip\.com/i, /agoda/i, /hostelworld/i,
    /trivago/i, /wotif/i, /lastminute/i, /luxury escapes/i,
    /\bcruise\b/i, /greyhound/i, /\bnsw trainlink\b/i, /\bv\/line\b/i,
    /spirit of tasmania/i, /sealink/i, /google flights/i,
    /travel insurance/i, /cover-?more/i, /world nomads/i,
  ],
  gambling: [
    /\btab\b/i, /sportsbet/i, /ladbrokes/i, /bet365/i,
    /pointsbet/i, /\bneds\b/i, /unibet/i, /\bcrown\b/i,
    /star casino/i, /\bpokies\b/i,
  ],

  // ── Charity ───────────────────────────────────────────────────────────────
  charity: [
    /donation/i, /charity/i, /red cross/i, /salvation army/i,
    /smith family/i, /gofundme/i, /oxfam/i, /unicef/i,
    /world vision/i, /beyond blue/i, /movember/i, /rspca/i,
  ],

  // ── Government ────────────────────────────────────────────────────────────
  government: [
    /\bato\b/i, /service nsw/i, /vicroads/i, /\bmygov\b/i,
    /\bmedicare\b/i, /centrelink/i, /\bcouncil\b/i,
  ],

  // ── Cash ──────────────────────────────────────────────────────────────────
  cash: [
    /\batm\b/i, /cash withdrawal/i, /cash w\/d/i,
    /commonwealth atm/i, /westpac atm/i,
  ],

  // ── Housing ───────────────────────────────────────────────────────────────
  strata: [
    /\bstrata\b/i, /owners corp/i, /body corporate/i, /oc levy/i, /\blevies\b/i,
  ],
  mortgage: [/mortgage/i, /home loan/i, /\boffset\b/i, /\bredraw\b/i],
  rent:     [/ray white/i, /real estate/i, /\bproperty\b/i, /tenancy/i, /\blease\b/i, /\brea\b/i, /\bdomain\b/i, /propertyme/i, /\bailo\b/i, /different.*rent/i],

  // ── Personal (hidden from UI — auto-categorises but not shown in filter buttons) ──
  personal: [
    /lovehoney/i, /adultshop/i, /adult shop/i, /wild secrets/i,
    /honey birdette/i, /oh zone/i, /pleasure\s?machine/i,
  ],

  // ── Financial flows ───────────────────────────────────────────────────────
  // transfer: flag so users can choose to exclude from spending totals
  transfer: [/\btransfer\b/i, /\bbpay\b/i, /pay anyone/i, /\binternal\b/i, /\bsweep\b/i],
  income:   [/salary/i, /\bwages\b/i, /\bpay\b/i, /\bxero\b/i, /employment hero/i, /keypay/i, /dividend/i, /\binterest\b/i, /\brefund\b/i, /cashback/i, /\brebate\b/i],
};

const UPBANK_CATEGORY_MAP = {
  'Restaurants & Cafes': 'restaurant',
  'Takeaway':            'takeaway',
  'Groceries':           'grocery',
  'Medical & Pharmacy':  'health',
  'Fitness & Wellbeing': 'health',
  'Doctor':              'health',
  'Subscriptions & Lifestyle': 'sub',
  'Transport':           'transport',
  'Fuel':                'fuel',
  'Income':              'income',
  'Savings':             'savings_transfer',
  'Investments':         'savings_transfer',
};

const HEALTH_SUBCATS = {
  Vision:          [/specsavers/i, /opsm/i, /vision/i, /optical/i],
  Pharmacy:        [/chemist warehouse/i, /pharmacy/i, /priceline/i],
  'Mental Health': [/psychology/i, /psychiatr/i, /psychologist/i, /counsell/i],
  GP:              [/medical centre/i, /\bgp\b/i, /doctor/i, /clinic/i],
  Physio:          [/physio/i, /osteo/i, /chiro/i],
  Surgery:         [/hospital/i, /surgeon/i, /surgical/i],
};

const HEALTH_COLORS = {
  Vision: '#06b6d4', Pharmacy: '#f97316', 'Mental Health': '#ec4899',
  GP: '#8b5cf6', Physio: '#22c55e', Surgery: '#ef4444',
};

const DOW_ORDERED = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DOW_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── SHARED AGGREGATION ───────────────────────────────────────────────────────
// Accepts a normalised txs array (fields: date, desc, absAmt, isIncome,
// merchant, cat, upCat) and returns the standard dashboard output shape.
// Used by both processUpBank() and processUniversalBank().
export function aggregateTxs(txs) {
  if (!txs || txs.length === 0) return null;

  const months    = getSortedMonths(txs.map(t => t.date));
  const monthKeys = months.map(m => m.key);

  const md = {};
  monthKeys.forEach(k => {
    md[k] = { income: 0, spending: 0, amazon: 0, paypal: 0, toll: 0, coffee: 0, delivery: 0, restaurant: 0, takeaway: 0, grocery: 0, healthRec: 0, healthOne: 0, healthMC: 0 };
  });

  const dowData = {};
  DOW_NAMES.forEach(d => { dowData[d] = { sum: 0, cnt: 0 }; });

  const hcatAcc = {};

  txs.forEach(tx => {
    const mk = monthKey(tx.date);
    if (!md[mk]) return;

    if (tx.isIncome) {
      md[mk].income += tx.absAmt;
    } else {
      md[mk].spending += tx.absAmt;
      const d = DOW_NAMES[tx.date.getDay()];
      dowData[d].sum += tx.absAmt;
      dowData[d].cnt += 1;
    }

    if (tx.merchant === 'amazon')   md[mk].amazon   += tx.absAmt;
    if (tx.merchant === 'paypal')   md[mk].paypal   += tx.absAmt;
    if (tx.merchant === 'toll')     md[mk].toll     += tx.absAmt;
    if (tx.merchant === 'coffee')   md[mk].coffee   += tx.absAmt;
    if (tx.merchant === 'delivery') md[mk].delivery += tx.absAmt;

    if (tx.cat === 'restaurant') md[mk].restaurant += tx.absAmt;
    if (tx.cat === 'takeaway')   md[mk].takeaway   += tx.absAmt;
    if (tx.cat === 'grocery')    md[mk].grocery    += tx.absAmt;

    // upCat is Up Bank-specific; falls back gracefully to '' for other banks
    const isHealth = tx.cat === 'health' || /Medical|Fitness|Doctor/i.test(tx.upCat || '');
    if (isHealth) {
      let sub = 'Other';
      for (const [name, pats] of Object.entries(HEALTH_SUBCATS)) {
        if (pats.some(p => p.test(tx.desc))) { sub = name; break; }
      }
      hcatAcc[sub] = (hcatAcc[sub] || 0) + tx.absAmt;

      if (/medicare/i.test(tx.desc)) md[mk].healthMC  += tx.absAmt;
      else if (tx.absAmt > 500)      md[mk].healthOne += tx.absAmt;
      else                           md[mk].healthRec += tx.absAmt;
    }
  });

  const round = v => Math.round(v);

  const pnl  = monthKeys.map(m => ({ m, i: round(md[m].income), s: round(md[m].spending), n: round(md[m].income - md[m].spending) }));
  const amz  = monthKeys.map(m => ({ m, v: round(md[m].amazon) }));
  const food = monthKeys.map(m => ({ m, r: round(md[m].restaurant), t: round(md[m].takeaway), g: round(md[m].grocery) }));
  const hm   = monthKeys.map(m => ({ m, rec: round(md[m].healthRec), one: round(md[m].healthOne), mc: round(md[m].healthMC) }));
  const cd   = monthKeys.map(m => ({ m, a: round(md[m].amazon), p: round(md[m].paypal) }));
  const bva  = monthKeys.map(m => ({ m, amazon: round(md[m].amazon), tolls: round(md[m].toll), coffee: round(md[m].coffee), delivery: round(md[m].delivery) }));

  const hcats = Object.entries(hcatAcc)
    .sort((a, b) => b[1] - a[1])
    .map(([n, t]) => ({ n, t: round(t), c: HEALTH_COLORS[n] || '#94a3b8' }));

  const dow = DOW_ORDERED.map(d => ({ d, avg: dowData[d].cnt > 0 ? round(dowData[d].sum / dowData[d].cnt) : 0 }));

  const allDates = txs.map(t => t.date);
  const minDate  = new Date(Math.min(...allDates.map(d => d.getTime())));
  const maxDate  = new Date(Math.max(...allDates.map(d => d.getTime())));
  const dateRange = {
    start: `${MONTH_NAMES[minDate.getMonth()]} ${minDate.getFullYear()}`,
    end:   `${MONTH_NAMES[maxDate.getMonth()]} ${maxDate.getFullYear()}`,
    minDate, maxDate,
  };

  // Daily spending totals for heatmap
  const dailyTotals = {};
  for (const tx of txs) {
    if (!tx.isIncome) {
      const d   = tx.date;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      dailyTotals[key] = (dailyTotals[key] || 0) + tx.absAmt;
    }
  }

  // Individual transactions for search (spending only, newest first)
  const transactions = txs
    .filter(tx => !tx.isIncome)
    .map(tx => {
      const d = tx.date;
      return {
        date:   `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
        desc:   tx.desc,
        amount: tx.absAmt,
        cat:    tx.cat,
        source: tx.userRuled ? 'custom' : (tx.cat !== 'other' ? 'auto' : ''),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return { pnl, amz, food, hm, hcats, dow, cd, bva, dateRange, dailyTotals, transactions, rowCount: txs.length, rawTxs: txs };
}

// ─── USER RULES ───────────────────────────────────────────────────────────────

/**
 * Strips bank transaction noise from a raw description to produce a clean,
 * reusable merchant pattern suitable for user categorisation rules.
 *
 * Examples:
 *   "EFTPOS MARTIN AND CO PTY LT MELBOURNE AUS Card xx7113" → "MARTIN AND CO PTY LT"
 *   "VISA PURCHASE COLES 2184 BRUNSWICK VIC"               → "COLES 2184 BRUNSWICK"
 *   "DIRECT DEBIT 142619 TPG Internet DH9M1IFK4EH"         → "TPG Internet"
 *   "BPAY YARRA VALLEY WATER"                              → "YARRA VALLEY WATER"
 */
export function extractMerchantPattern(desc) {
  let s = desc.trim();

  // 1. Strip common Australian bank transaction prefixes
  s = s.replace(
    /^(EFTPOS|VISA\s+(?:PURCHASE|DEBIT|CREDIT|PAYWAVE)|MASTERCARD\s+(?:PURCHASE|DEBIT)|DIRECT\s+DEBIT|DIRECT\s+CREDIT|PENDING\s*-\s*|TRANSFER\s+(?:TO|FROM)\s+|BPAY|OSKO(?:\s+PAYMENT)?|PAY\s+ANYONE|INTERNET\s+TRANSFER)\s*/i,
    ''
  );

  // 2. Strip leading asterisks
  s = s.replace(/^\*+\s*/, '').trim();

  // 3. Strip leading standalone numeric reference codes (e.g. "142619 " before merchant)
  s = s.replace(/^\d{4,}\s+/, '').trim();

  // 4. Strip "Value Date: DD/MM/YYYY" suffix and everything after
  s = s.replace(/\s+Value\s+Date:\s*\d{1,2}\/\d{1,2}\/\d{2,4}.*/i, '').trim();

  // 5. Strip card reference numbers: "Card xx1234" or bare "xx1234" and everything after
  s = s.replace(/\s+(?:Card\s+)?xx\d{3,}\b.*/i, '').trim();

  // 6. Strip trailing alphanumeric reference codes that contain digits
  //    (e.g. "DH9M1IFK4EH") — distinguishes from plain words by requiring a digit
  s = s.replace(/\s+(?=[A-Z0-9]*\d)[A-Z0-9]{6,}\s*$/i, '').trim();

  // 7. Strip trailing major Australian city names
  s = s.replace(/\s+(?:MELBOURNE|SYDNEY|BRISBANE|PERTH|ADELAIDE)\b.*/i, '').trim();

  // 8. Strip trailing state abbreviations and country suffixes
  s = s.replace(/\s+(?:VIC|NSW|QLD|WA|SA|TAS|NT|ACT|AUS|AU|AUSTRALIA)\s*$/i, '').trim();

  // 9. Strip trailing bare digit sequences (card/ref numbers)
  s = s.replace(/\s+\d[\d\s]*$/, '').trim();

  // 10. Strip trailing date patterns (DD/MM or DD/MM/YYYY)
  s = s.replace(/\s+\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\s*$/, '').trim();

  // 11. Normalise internal whitespace
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

// Re-categorises 'other' transactions that match a user-defined pattern.
// userRules: { "MERCHANT NAME": "category", ... }
// Matching is case-insensitive substring. UPBANK_CATEGORY_MAP-categorised
// transactions are left untouched (highest priority).
export function applyUserRules(rawTxs, userRules) {
  if (!rawTxs || !userRules || Object.keys(userRules).length === 0) return rawTxs;
  return rawTxs.map(tx => {
    // Up Bank categories (from the CSV category column) take highest priority
    if (tx.upCat) return tx;
    const descLower = tx.desc.toLowerCase();
    for (const [pattern, category] of Object.entries(userRules)) {
      if (descLower.includes(pattern.toLowerCase())) {
        return { ...tx, cat: category, userRuled: true };
      }
    }
    return tx;
  });
}


export function processUpBank(rows) {
  if (!rows || rows.length === 0) return null;

  const sample  = rows[0];
  const dateCol = findCol(sample, ['date', 'transaction date']);
  const descCol = findCol(sample, ['description', 'merchant', 'name']);
  const amtCol  = findCol(sample, ['value', 'amount', 'debit/credit']);
  const catCol  = findCol(sample, ['category', 'up category']);

  if (!dateCol || !descCol || !amtCol) return null;

  const txs = rows.map(r => {
    const date = parseDate(r[dateCol] || '');
    if (!date) return null;
    const amount = parseAmount(r[amtCol]);
    const desc   = r[descCol] || '';
    const upCat  = catCol ? (r[catCol] || '') : '';

    const isIncome = amount > 0;
    const absAmt   = Math.abs(amount);

    let merchant = null;
    for (const [cat, patterns] of Object.entries(MERCHANT_MAP)) {
      if (patterns.some(p => p.test(desc))) { merchant = cat; break; }
    }

    const mappedCat = UPBANK_CATEGORY_MAP[upCat];
    const cat = mappedCat || merchant || (isIncome ? 'income' : 'other');

    return { date, desc, absAmt, isIncome, merchant, cat, upCat };
  }).filter(Boolean);

  if (txs.length === 0) return null;
  return aggregateTxs(txs);
}

// ─── UNIVERSAL BANK ───────────────────────────────────────────────────────────
// Parses any Australian bank CSV using the column map from detectBankFormat().
// Produces the same output shape as processUpBank() so all dashboard tabs
// work without modification.
export function processUniversalBank(rows, format) {
  if (!rows || rows.length === 0 || !format) return null;

  // Delegate to the bank-specific processor where one exists
  if (format.bank === 'upbank')  return processUpBank(rows);
  if (format.bank === 'commsec') return null; // investment CSV, not spending

  const { columns, amountStyle } = format;
  if (!columns.date) return null;

  const txs = rows.map(r => {
    // ── Date ────────────────────────────────────────────────────────────────
    const date = parseDate(r[columns.date] || '');
    if (!date) return null;

    // ── Description ─────────────────────────────────────────────────────────
    const desc = columns.description ? (r[columns.description] || '').trim() : '';

    // ── Amount ──────────────────────────────────────────────────────────────
    let amount;
    if (amountStyle === 'split') {
      // Debit column = money out (positive number → negative flow)
      // Credit column = money in (positive number → positive flow)
      const debit  = columns.debit  ? parseAmount(r[columns.debit]  || '') : 0;
      const credit = columns.credit ? parseAmount(r[columns.credit] || '') : 0;
      if (debit === 0 && credit === 0) return null; // empty / header-only row
      amount = credit - debit;
    } else {
      if (!columns.amount) return null;
      const raw = r[columns.amount] || '';
      if (!raw.trim()) return null;
      amount = parseAmount(raw);
    }

    const isIncome = amount > 0;
    const absAmt   = Math.abs(amount);

    // ── Categorise via MERCHANT_MAP ──────────────────────────────────────────
    let merchant = null;
    for (const [cat, patterns] of Object.entries(MERCHANT_MAP)) {
      if (patterns.some(p => p.test(desc))) { merchant = cat; break; }
    }

    const cat = merchant || (isIncome ? 'income' : 'other');

    return { date, desc, absAmt, isIncome, merchant, cat, upCat: '' };
  }).filter(Boolean);

  if (txs.length === 0) return null;
  return aggregateTxs(txs);
}

// ─── PAYPAL ──────────────────────────────────────────────────────────────────
const PAYPAL_CATS = {
  'Vehicle':        [/autobarn/i, /repco/i, /supercheap/i],
  'Tech':           [/microsoft/i, /google/i, /steam/i, /adobe/i, /logitech/i, /corsair/i],
  'Motorcycle':     [/peter steven/i, /mcas/i, /bikebiz/i],
  'Fitness':        [/zwift/i, /strava/i, /garmin/i, /oura/i, /fitbit/i],
  'eBay':           [/ebay/i],
  'Events+Travel':  [/eventbrite/i, /airbnb/i, /booking\./i, /ticketek/i, /ticketmaster/i, /viator/i],
};

const PAYPAL_CAT_COLORS = {
  'Vehicle': '#ef4444', 'Tech': '#6366f1', 'Motorcycle': '#f97316',
  'Fitness': '#22c55e', 'eBay': '#eab308', 'Events+Travel': '#ec4899', 'Other': '#94a3b8',
};

export function processPayPal(rows) {
  if (!rows || rows.length === 0) return null;

  const sample = rows[0];
  const dateCol   = findCol(sample, ['date']);
  const nameCol   = findCol(sample, ['name', 'description']);
  const grossCol  = findCol(sample, ['gross', 'amount']);
  const statusCol = findCol(sample, ['status']);

  if (!dateCol || !grossCol) return null;

  // Completed outgoing payments only
  const payments = rows.filter(r => {
    if (statusCol && !/completed/i.test(r[statusCol] || '')) return false;
    return parseAmount(r[grossCol]) < 0;
  });

  if (payments.length === 0) return null;

  const withDates = payments.map(r => {
    const date = parseDate(r[dateCol] || '');
    if (!date) return null;
    return { date, absAmt: Math.abs(parseAmount(r[grossCol])), name: r[nameCol] || '' };
  }).filter(Boolean);

  if (withDates.length === 0) return null;

  const months = getSortedMonths(withDates.map(t => t.date));
  const monthKeys = months.map(m => m.key);

  const monthTotals = {};
  monthKeys.forEach(k => { monthTotals[k] = 0; });
  withDates.forEach(({ date, absAmt }) => {
    const mk = monthKey(date);
    if (monthTotals[mk] !== undefined) monthTotals[mk] += absAmt;
  });

  const ppM = monthKeys.map(m => ({ m, p: Math.round(monthTotals[m] || 0) }));

  const catTotals = {};
  withDates.forEach(({ name, absAmt }) => {
    let cat = 'Other';
    for (const [catName, pats] of Object.entries(PAYPAL_CATS)) {
      if (pats.some(p => p.test(name))) { cat = catName; break; }
    }
    if (!catTotals[cat]) catTotals[cat] = { t: 0, ct: 0 };
    catTotals[cat].t += absAmt;
    catTotals[cat].ct += 1;
  });

  const ppCats = Object.entries(catTotals)
    .sort((a, b) => b[1].t - a[1].t)
    .map(([n, { t, ct }]) => ({ n, t: Math.round(t), ct, c: PAYPAL_CAT_COLORS[n] || '#94a3b8' }));

  return { ppM, ppCats, rowCount: withDates.length };
}

// ─── GATEWAY BANK ────────────────────────────────────────────────────────────
function processGatewayLoan(rows) {
  if (!rows || rows.length === 0) return {};
  const sample = rows[0];
  const dateCol = findCol(sample, ['entered date', 'transaction date', 'value date', 'date', 'effective date']);
  const balCol  = findCol(sample, ['balance', 'closing balance', 'running balance']);
  if (!balCol) return {};
  if (!dateCol) return {};

  const byMonth = {};
  rows.forEach(r => {
    const date = parseDate(r[dateCol] || '');
    if (!date) return;
    const bal = parseAmount(r[balCol]);
    if (!bal) return;
    const mk = monthKeyYY(date);
    if (!byMonth[mk] || date >= byMonth[mk].date) {
      byMonth[mk] = { date, bal: Math.abs(bal) };
    }
  });

  return Object.fromEntries(Object.entries(byMonth).map(([k, v]) => [k, Math.round(v.bal)]));
}

export function processGateway(mainRows, topRows) {
  const mainByMonth = processGatewayLoan(mainRows);
  const topByMonth  = processGatewayLoan(topRows);

  const allMonths = new Set([...Object.keys(mainByMonth), ...Object.keys(topByMonth)]);
  if (allMonths.size === 0) return null;

  const sorted = Array.from(allMonths).sort((a, b) => {
    const parse = s => { const [mo, yr] = s.split("'"); return parseInt('20' + yr) * 12 + MONTH_NAMES.indexOf(mo); };
    return parse(a) - parse(b);
  });

  const mortBal = sorted.map(m => ({ m, main: mainByMonth[m] || 0, top: topByMonth[m] || 0 }));
  return { mortBal, rowCount: (mainRows?.length || 0) + (topRows?.length || 0) };
}

// ─── COMMSEC ─────────────────────────────────────────────────────────────────
const POS_COLORS = ['#34d399', '#60a5fa', '#fbbf24', '#14b8a6', '#a78bfa', '#fb923c'];
const NEG_COLORS = ['#f87171', '#ef4444', '#fb923c'];

export function processCommSec(rows) {
  if (!rows || rows.length === 0) return null;

  // CommSec CSVs have a title row before the real headers — detect and skip it
  let workRows = rows;
  if (!findCol(rows[0], ['security code', 'code', 'ticker'])) {
    for (let i = 0; i < Math.min(4, rows.length); i++) {
      const vals = Object.values(rows[i]);
      if (vals.some(v => /^code$/i.test((v || '').trim()))) {
        const realHeaders = vals.map(v => (v || '').trim());
        workRows = rows.slice(i + 1).map(r => {
          const values = Object.values(r);
          const row = {};
          realHeaders.forEach((h, idx) => { if (h) row[h] = (values[idx] || '').trim(); });
          return row;
        });
        break;
      }
    }
  }

  const sample = workRows[0];
  if (!sample) return null;

  const codeCol  = findCol(sample, ['security code', 'code', 'ticker']);
  const valueCol = findCol(sample, ['mkt value $', 'market value', 'mkt value', 'value', 'market val', 'value (aud)', 'current value']);
  const plCol    = findCol(sample, ['profit/loss $', 'open p/l ($)', 'unrealised p/l', 'p/l ($)', 'gain/loss', 'gain/loss (aud)', 'unrealised p/l (aud)', 'profit/loss']);

  if (!codeCol || !valueCol) return null;

  const SKIP_CODES = new Set(['total', 'chess', 'issuer sponsored', 'grand total', '']);
  const holdings = workRows.map(r => {
    const code = (r[codeCol] || '').trim();
    if (SKIP_CODES.has(code.toLowerCase())) return null;
    const value = parseAmount(r[valueCol]);
    if (value <= 0) return null;
    const pl = plCol ? parseAmount(r[plCol]) : 0;
    return { code, value, pl };
  }).filter(Boolean);

  if (holdings.length === 0) return null;

  const totalValue = holdings.reduce((s, h) => s + h.value, 0);
  let posIdx = 0, negIdx = 0;

  const shares = holdings.map(h => ({
    code:  h.code,
    value: Math.round(h.value),
    pl:    Math.round(h.pl),
    pct:   parseFloat((h.value / totalValue * 100).toFixed(1)),
    color: h.pl >= 0 ? (POS_COLORS[posIdx++] || '#34d399') : (NEG_COLORS[negIdx++] || '#f87171'),
  }));

  return { shares, rowCount: shares.length };
}

// ─── PIPELINE ENTRY POINT ────────────────────────────────────────────────────
// Accepts raw CSV text (e.g. from FileReader) and returns parsed data or a
// signal that manual column mapping is needed. Single function for the upload UI.
export function processCSVText(text) {
  const rows = parseCSV(text);
  if (!rows || rows.length === 0) return { error: 'No data found in CSV' };

  const format = detectBankFormat(rows);

  if (format.bank === 'commsec') return { type: 'commsec', data: processCommSec(rows), format };
  if (format.bank === 'paypal')  return { type: 'paypal',  data: processPayPal(rows),  format };
  if (format.bank === 'upbank')  return { type: 'upbank',  data: processUpBank(rows),  format };

  if (format.confidence !== 'manual') {
    return { type: 'bank', data: processUniversalBank(rows, format), format };
  }

  return { type: 'manual', rows, format };
}

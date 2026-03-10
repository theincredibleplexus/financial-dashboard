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

function parseCSV(text) {
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
  // ISO: YYYY-MM-DD
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  // Australian: DD/MM/YYYY
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
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

// ─── UP BANK ─────────────────────────────────────────────────────────────────
const MERCHANT_MAP = {
  amazon:   [/amazon/i, /amzn/i],
  paypal:   [/paypal/i],
  toll:     [/citylink/i, /eastlink/i, /linkt/i, /mylinkt/i, /e-toll/i],
  fuel:     [/bp\s/i, /shell/i, /7-eleven/i, /puma/i, /coles express/i],
  mortgage: [/gateway bank/i, /mortgage/i],
  rent:     [/ray white/i, /real estate/i],
  coffee:   [/coffee/i, /barista/i, /starbucks/i, /gloria jean/i, /mecca.*espresso/i],
  delivery: [/doordash/i, /uber eats/i, /menulog/i, /deliveroo/i],
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
  'Mental Health': [/psychology/i, /psychiatr/i, /psychologist/i, /counsell/i, /langley/i],
  GP:              [/medical centre/i, /\bgp\b/i, /doctor/i, /clinic/i],
  Physio:          [/physio/i, /osteo/i, /chiro/i],
  Surgery:         [/hospital/i, /surgeon/i, /surgical/i, /cabrini/i],
};

const HEALTH_COLORS = {
  Vision: '#06b6d4', Pharmacy: '#f97316', 'Mental Health': '#ec4899',
  GP: '#8b5cf6', Physio: '#22c55e', Surgery: '#ef4444',
};

const DOW_ORDERED = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DOW_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function processUpBank(rows) {
  if (!rows || rows.length === 0) return null;

  const sample = rows[0];
  const dateCol = findCol(sample, ['date', 'transaction date']);
  const descCol = findCol(sample, ['description', 'merchant', 'name']);
  const amtCol  = findCol(sample, ['value', 'amount', 'debit/credit']);
  const catCol  = findCol(sample, ['category', 'up category']);

  if (!dateCol || !descCol || !amtCol) return null;

  // Parse and classify each row
  const txs = rows.map(r => {
    const date = parseDate(r[dateCol] || '');
    if (!date) return null;
    const amount = parseAmount(r[amtCol]);
    const desc = r[descCol] || '';
    const upCat = catCol ? (r[catCol] || '') : '';

    const isIncome = amount > 0;
    const absAmt = Math.abs(amount);

    let merchant = null;
    for (const [cat, patterns] of Object.entries(MERCHANT_MAP)) {
      if (patterns.some(p => p.test(desc))) { merchant = cat; break; }
    }

    const mappedCat = UPBANK_CATEGORY_MAP[upCat];
    const cat = mappedCat || merchant || (isIncome ? 'income' : 'other');

    return { date, desc, absAmt, isIncome, merchant, cat, upCat };
  }).filter(Boolean);

  if (txs.length === 0) return null;

  const months = getSortedMonths(txs.map(t => t.date));
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

    const isHealth = tx.cat === 'health' || /Medical|Fitness|Doctor/i.test(tx.upCat);
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
  const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
  const dateRange = {
    start: `${MONTH_NAMES[minDate.getMonth()]} ${minDate.getFullYear()}`,
    end:   `${MONTH_NAMES[maxDate.getMonth()]} ${maxDate.getFullYear()}`,
    minDate, maxDate,
  };

  // Daily spending totals for heatmap
  const dailyTotals = {};
  for (const tx of txs) {
    if (!tx.isIncome) {
      const d = tx.date;
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
        date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
        desc: tx.desc,
        amount: tx.absAmt,
        cat: tx.cat,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return { pnl, amz, food, hm, hcats, dow, cd, bva, dateRange, dailyTotals, transactions, rowCount: txs.length };
}

// ─── PAYPAL ──────────────────────────────────────────────────────────────────
const PAYPAL_CATS = {
  'Vehicle (Jeep)': [/jeep/i, /chrysler/i, /mopar/i, /autobarn/i, /repco/i, /supercheap/i],
  'Tech':           [/microsoft/i, /google/i, /steam/i, /adobe/i, /logitech/i, /corsair/i],
  'Harley/Moto':    [/harley/i, /davidson/i, /peter steven/i, /mcas/i, /bikebiz/i],
  'Fitness':        [/zwift/i, /strava/i, /garmin/i, /oura/i, /fitbit/i],
  'eBay':           [/ebay/i],
  'Events+Travel':  [/eventbrite/i, /airbnb/i, /booking\./i, /ticketek/i, /ticketmaster/i, /viator/i],
};

const PAYPAL_CAT_COLORS = {
  'Vehicle (Jeep)': '#ef4444', 'Tech': '#6366f1', 'Harley/Moto': '#f97316',
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
  const dateCol = findCol(sample, ['date', 'transaction date', 'value date']);
  const balCol  = findCol(sample, ['balance', 'closing balance', 'running balance']);
  if (!dateCol || !balCol) return {};

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

  const sample = rows[0];
  const codeCol  = findCol(sample, ['security code', 'code', 'ticker']);
  const valueCol = findCol(sample, ['market value', 'value', 'market val', 'value (aud)', 'current value']);
  const plCol    = findCol(sample, ['open p/l ($)', 'unrealised p/l', 'p/l ($)', 'gain/loss', 'gain/loss (aud)', 'unrealised p/l (aud)', 'profit/loss']);

  if (!codeCol || !valueCol) return null;

  const holdings = rows.map(r => {
    const code = (r[codeCol] || '').trim();
    if (!code || code.toLowerCase() === 'total') return null;
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

  return { shares, rowCount: rows.length };
}

import { ML_PER_UNIT, US_UNITS } from './constants.js';

export function normalizeSpace(value) {
  return String(value ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function looseNormalize(value) {
  return normalizeSpace(value)
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export function similarity(a, b) {
  const x = looseNormalize(a);
  const y = looseNormalize(b);
  if (!x && !y) return 1;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

export function diffWords(expected, actual) {
  const a = normalizeSpace(expected).split(' ').filter(Boolean);
  const b = normalizeSpace(actual).split(' ').filter(Boolean);
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const runs = [];
  const push = (type, word) => {
    const last = runs[runs.length - 1];
    if (last && last.type === type) last.text += ` ${word}`;
    else runs.push({ type, text: word });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('equal', a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push('missing', a[i++]);
    } else {
      push('extra', b[j++]);
    }
  }
  while (i < a.length) push('missing', a[i++]);
  while (j < b.length) push('extra', b[j++]);
  return runs;
}

export function parseAlcohol(text) {
  const s = normalizeSpace(text);
  if (!s) return null;
  const abv = s.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
  const proof = s.match(/(\d{1,3}(?:\.\d+)?)\s*°?\s*proof/i);
  const hasAbvWording =
    /alc(?:ohol)?\.?\s*(?:\/|by)?\s*vol/i.test(s) || /%\s*by\s*vol/i.test(s) || /\bABV\b/i.test(s);
  return {
    abv: abv ? Number(abv[1]) : null,
    proof: proof ? Number(proof[1]) : null,
    hasAbvWording,
  };
}

const UNIT_PATTERN =
  /(\d+(?:[.,]\d+)?)\s*(ml|milliliters?|millilitres?|cl|centiliters?|l|liters?|litres?|fl\.?\s*oz\.?|fluid\s+ounces?|oz\.?|pints?|pt\.?|quarts?|qt\.?|gallons?|gal\.?)(?![a-z])/gi;

function canonicalUnit(raw) {
  const u = raw.toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');
  if (/^(ml|millilit)/.test(u)) return 'ml';
  if (/^(cl|centilit)/.test(u)) return 'cl';
  if (/^(l|lit)/.test(u)) return 'l';
  if (/^(fl|fluid|oz)/.test(u)) return 'fl oz';
  if (/^(pint|pt)/.test(u)) return 'pint';
  if (/^(quart|qt)/.test(u)) return 'quart';
  if (/^gal/.test(u)) return 'gallon';
  return null;
}

export function parseNetContents(text) {
  const s = normalizeSpace(text);
  const quantities = [];
  for (const m of s.matchAll(UNIT_PATTERN)) {
    const unit = canonicalUnit(m[2]);
    if (!unit) continue;
    const value = Number(m[1].replace(',', '.'));
    quantities.push({ value, unit, ml: value * ML_PER_UNIT[unit], system: US_UNITS.has(unit) ? 'us' : 'metric' });
  }
  return quantities;
}

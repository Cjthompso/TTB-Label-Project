

import { normalizeSpace, parseNetContents } from './text.js';

const WINE = /\b(wines?|cabernet|merlot|chardonnay|zinfandel|pinot|sauvignon|riesling|syrah|shiraz|malbec|ros[eé]|champagne|sparkling|prosecco|port|sherry|vermouth|sangiovese|tempranillo|grenache|moscato|claret|vinted|winery|cellars)\b/i;
const MALT = /\b(beer|ale|lager|ipa|stout|porter|pilsner|pils|bock|hefeweizen|saison|malt beverage|brewed|brewing|brewery)\b/i;
const SPIRITS = /\b(whiske?y|bourbon|scotch|rye|vodka|gin|rum|tequila|mezcal|brandy|cognac|armagnac|liqueur|schnapps|absinthe|spirits?|distilled|distillery|proof)\b/i;
const CLASS_WORDS = /\b(whiske?y|bourbon|scotch|vodka|gin|rum|tequila|mezcal|brandy|cognac|armagnac|liqueur|schnapps|absinthe|wine|cabernet|merlot|chardonnay|zinfandel|pinot|sauvignon|riesling|syrah|shiraz|malbec|ros[eé]|champagne|sparkling|prosecco|sherry|vermouth|sangiovese|tempranillo|grenache|moscato|beer|ale|lager|ipa|stout|porter|pilsner|bock|hefeweizen|saison|cider|seltzer)\b/i;
const INGREDIENT_PERCENT = /\b(agave|grain|malt|barley|wheat|corn|rye|grape|juice|natural|organic|recycled)\b/i;

const SULFITES = /\bsul(f|ph)ites?\b/i;
const WARNING_START = /g[o0]v[e3]rnm[e3]nt\s*warn/i;
const WARNING_END = /health\s+problems?\s*[.,]?/i;
const RESPONSIBILITY = /\b(bottled|distilled|produced|made|brewed|imported|blended|vinted|cellared|packed|manufactured|prepared|canned)\b[\w\s,&]{0,30}?\bby\b/i;
const COUNTRY = /\b(product of|made in|produced in|imported from|country of origin)\b/i;
const US_STATE =
  /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b|,\s*[A-Z]{2}\b/;

const isUpper = (s) => /[A-Z]/.test(s) && s === s.toUpperCase();

function detectType(classType, allText) {
  for (const text of [classType ?? '', allText]) {
    if (WINE.test(text)) return 'wine';
    if (MALT.test(text)) return 'malt_beverage';
    if (SPIRITS.test(text)) return 'distilled_spirits';
  }
  return 'unknown';
}

function extractWarning(lines) {
  const start = lines.findIndex((l) => WARNING_START.test(l.text));
  if (start < 0) return [null, lines];
  const parts = [];
  const leftovers = [];
  const before = lines[start].text.slice(0, lines[start].text.search(WARNING_START)).trim();
  if (before) leftovers.push({ ...lines[start], text: before });

  let end = start;
  for (let i = start; i < lines.length && i < start + 10; i++) {
    const text = i === start ? lines[i].text.slice(lines[i].text.search(WARNING_START)) : lines[i].text;
    const m = text.match(WARNING_END);
    end = i;
    if (m) {
      parts.push(text.slice(0, m.index + m[0].length));
      const after = text.slice(m.index + m[0].length).trim();
      if (after) leftovers.push({ ...lines[i], text: after });
      break;
    }
    parts.push(text);
  }
  const remaining = [...lines.slice(0, start), ...leftovers, ...lines.slice(end + 1)];
  return [normalizeSpace(parts.join(' ')), remaining];
}

export function parseLabel({ lines: rawLines = [], confidence = null, headingBold = null }) {
  const cleaned = rawLines
    .map((l) => ({ text: normalizeSpace(l.text), height: l.height ?? null, confidence: l.confidence ?? null }))
    .filter((l) => /[a-z0-9]{2,}/i.test(l.text));
  const allText = cleaned.map((l) => l.text).join('\n');

  const [warningText, lines] = extractWarning(cleaned);
  const used = new Set();
  const take = (predicate) => {
    const i = lines.findIndex((l, k) => !used.has(k) && predicate(l, k));
    if (i < 0) return null;
    used.add(i);
    return i;
  };
  const textAt = (i) => (i == null ? null : lines[i].text);

  const sulfites = textAt(take((l) => SULFITES.test(l.text)));
  const country = textAt(take((l) => COUNTRY.test(l.text)));
  const alcohol =
    textAt(take((l) => /\d\s*%/.test(l.text) && /alc|vol|abv|proof/i.test(l.text))) ??
    textAt(take((l) => /\d\s*%/.test(l.text) && !INGREDIENT_PERCENT.test(l.text))) ??
    textAt(take((l) => /\bproof\b/i.test(l.text)));
  const net = textAt(take((l) => l.text.length < 40 && !/%/.test(l.text) && parseNetContents(l.text).length > 0));

  const nameParts = [];
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i) || !RESPONSIBILITY.test(lines[i].text)) continue;
    used.add(i);
    nameParts.push(lines[i].text);
    const next = lines[i + 1];
    if (next && !used.has(i + 1) && !RESPONSIBILITY.test(next.text) && !CLASS_WORDS.test(next.text) && (US_STATE.test(next.text) || next.text.includes(','))) {
      used.add(i + 1);
      nameParts.push(next.text);
    }
  }
  if (!nameParts.length) {
    const i = take((l) => US_STATE.test(l.text) && !CLASS_WORDS.test(l.text));
    if (i != null) nameParts.push(lines[i].text);
  }

  const hasHeights = lines.some((l) => l.height);
  const pickTallest = (accept) => {
    const candidates = lines.map((_, k) => k).filter((k) => !used.has(k) && !/^\d+$/.test(lines[k].text) && accept(lines[k]));
    if (!candidates.length) return null;
    return hasHeights ? candidates.reduce((a, b) => ((lines[b].height ?? 0) > (lines[a].height ?? 0) ? b : a)) : candidates[0];
  };
  const brandIdx = pickTallest((l) => !CLASS_WORDS.test(l.text)) ?? pickTallest(() => true);
  if (brandIdx != null) used.add(brandIdx);
  const tallest = hasHeights && brandIdx != null ? lines[brandIdx].height : null;

  const classIdx = take((l) => CLASS_WORDS.test(l.text));
  let brand = textAt(brandIdx);
  if (brandIdx != null) {
    const next = lines[brandIdx + 1];
    const bigEnough = !tallest || (next?.height ?? 0) >= 0.55 * tallest;
    if (next && !used.has(brandIdx + 1) && isUpper(next.text) && bigEnough && !/^\d+$/.test(next.text)) {
      used.add(brandIdx + 1);
      brand = `${brand} ${next.text}`;
    }
  }
  const classType = textAt(classIdx);

  const isImport = /\bimport(ed|er)\b/i.test(allText);
  const found = [warningText, alcohol, classType, net].filter(Boolean).length;
  const cutOff = (t) => /\b(by|of|and|in)$/i.test(t);
  const shaky = cleaned.filter((l) => (l.confidence != null && l.confidence < 75) || cutOff(l.text)).length;
  const quality = confidence != null && confidence < 65 ? 'poor' : (confidence != null && confidence < 85) || shaky ? 'fair' : 'good';
  const issues = [];
  if (shaky) issues.push(`${shaky} line${shaky > 1 ? 's' : ''} partly unreadable (glare, blur, or angle)`);
  else if (quality !== 'good') issues.push('low text-recognition confidence');

  return {
    is_alcohol_label: cleaned.length === 0 ? null : found > 0,
    image_quality: quality,
    image_issues: issues,
    beverage_type: detectType(classType, allText.replace(warningText ?? '', '')),
    brand_name: brand,
    class_type: classType,
    alcohol_content: alcohol,
    net_contents: net,
    name_address: nameParts.length ? nameParts.join(', ') : null,
    country_of_origin: country,
    is_import_indicated: isImport,
    government_warning: { text: warningText, heading_bold: headingBold, body_bold: null },
    sulfite_declaration: sulfites,
    other_text: lines.filter((_, k) => !used.has(k)).map((l) => l.text).join('\n') || null,
  };
}

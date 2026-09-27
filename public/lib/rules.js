import {
  BEVERAGE_TYPES,
  GOVERNMENT_WARNING,
  SPIRITS_STANDARDS_ML,
  WARNING_BODY,
  WINE_STANDARDS_ML,
} from './constants.js';
import { diffWords, levenshtein, looseNormalize, normalizeSpace, parseAlcohol, parseNetContents } from './text.js';
import { compareExpected } from './compare.js';

export const STATUS = Object.freeze({ PASS: 'pass', FAIL: 'fail', REVIEW: 'review', NA: 'na' });
const RANK = { na: 0, pass: 0, review: 1, fail: 2 };

const result = (id, label, status, message, found = null, extra = {}) => ({
  id,
  label,
  status,
  message,
  found,
  ...extra,
});


const OCR_MISREAD_CHARS = 6;

const worst = (...statuses) => statuses.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), STATUS.PASS);

function missing(ex, id, label, message) {
  return ex.image_quality === 'good' || ex.image_quality == null
    ? result(id, label, STATUS.FAIL, message)
    : result(id, label, STATUS.REVIEW, `${message} Parts of the image are hard to read, so it may be obscured; check the image.`);
}

export function resolveBeverageType(requested, detected) {
  if (BEVERAGE_TYPES.includes(requested)) return requested;
  if (BEVERAGE_TYPES.includes(detected)) return detected;
  return 'unknown';
}

function checkBrand(ex) {
  const v = normalizeSpace(ex.brand_name);
  return v
    ? result('brand_name', 'Brand name', STATUS.PASS, 'Brand name is present.', v)
    : missing(ex, 'brand_name', 'Brand name', 'No brand name found on the label.');
}

function checkClassType(ex) {
  const v = normalizeSpace(ex.class_type);
  return v
    ? result('class_type', 'Class/type designation', STATUS.PASS, 'Class/type designation is present.', v)
    : missing(ex, 'class_type', 'Class/type designation', 'No class or type designation found (e.g. "Bourbon Whiskey", "Red Wine", "Ale").');
}

function checkAlcohol(ex, type) {
  const label = 'Alcohol content';
  const raw = normalizeSpace(ex.alcohol_content);
  const parsed = parseAlcohol(raw);

  if (!raw || parsed.abv === null) {
    if (type === 'malt_beverage') {
      return result('alcohol_content', label, STATUS.NA, 'Not required federally for most malt beverages (some states require it).', raw || null);
    }
    if (type === 'wine' && /\b(table|light)\s+wine\b/i.test(ex.class_type ?? '')) {
      return result('alcohol_content', label, STATUS.PASS, '"Table wine"/"light wine" may be used in place of a percentage for wines of 14% ABV or less.', raw || null);
    }
    if (type === 'unknown') {
      return result('alcohol_content', label, STATUS.REVIEW, 'No alcohol content found. Select the beverage type to determine whether it is required.', raw || null);
    }
    const why = type === 'wine' ? ' Wine over 14% ABV must state it; wine at 14% or less may say "table wine" instead.' : '';
    return { ...missing(ex, 'alcohol_content', label, `No alcohol-by-volume statement found.${why}`), found: raw || null };
  }

  const problems = [];
  let status = STATUS.PASS;
  if (parsed.abv <= 0 || parsed.abv > 95) {
    status = worst(status, STATUS.REVIEW);
    problems.push(`${parsed.abv}% is outside a plausible range; check the reading.`);
  }
  if (!parsed.hasAbvWording) {
    status = worst(status, STATUS.REVIEW);
    problems.push('Percentage should be identified as alcohol by volume (e.g. "Alc./Vol." or "Alcohol by Volume").');
  }
  if (parsed.proof !== null && Math.abs(parsed.proof - parsed.abv * 2) > 0.05) {
    status = STATUS.FAIL;
    problems.push(`Proof (${parsed.proof}) should be twice the ABV (${parsed.abv}% → ${+(parsed.abv * 2).toFixed(2)} proof).`);
  }
  const message = problems.length ? problems.join(' ') : `States ${parsed.abv}% alcohol by volume${parsed.proof ? ` (${parsed.proof} proof)` : ''}.`;
  return result('alcohol_content', label, status, message, raw);
}

function checkNetContents(ex, type) {
  const label = 'Net contents';
  const raw = normalizeSpace(ex.net_contents);
  if (!raw) return missing(ex, 'net_contents', label, 'No net contents statement found.');

  const quantities = parseNetContents(raw);
  if (!quantities.length) {
    return result('net_contents', label, STATUS.REVIEW, 'Could not read a volume and unit from the net contents statement.', raw);
  }
  const metric = quantities.find((q) => q.system === 'metric');
  const us = quantities.find((q) => q.system === 'us');

  if (type === 'malt_beverage') {
    return us
      ? result('net_contents', label, STATUS.PASS, 'Net contents stated in U.S. measure.', raw)
      : result('net_contents', label, STATUS.FAIL, 'Malt beverages must state net contents in U.S. measure (e.g. "12 FL OZ"); metric may only be added alongside it.', raw);
  }

  if (type === 'distilled_spirits' || type === 'wine') {
    if (!metric) {
      return result('net_contents', label, STATUS.FAIL, `${type === 'wine' ? 'Wine' : 'Distilled spirits'} must state net contents in metric units (mL or L).`, raw);
    }
    const ml = Math.round(metric.ml);
    const standards = type === 'wine' ? WINE_STANDARDS_ML : SPIRITS_STANDARDS_ML;
    const isStandard = standards.includes(ml) || (type === 'wine' && ml > 3000 && ml % 1000 === 0);
    if (metric.unit === 'cl') {
      return result('net_contents', label, STATUS.REVIEW, 'Centiliters are not a U.S. labeling unit; state the volume in mL or L.', raw);
    }
    return isStandard
      ? result('net_contents', label, STATUS.PASS, `${ml} mL is an authorized standard of fill.`, raw)
      : result('net_contents', label, STATUS.REVIEW, `${ml} mL is not on the standards-of-fill list this tool knows about. Confirm against the current regulation.`, raw);
  }

  return result('net_contents', label, STATUS.PASS, 'Net contents statement is present.', raw);
}

const RESPONSIBILITY_PHRASE =
  /\b(bottled|distilled|produced|made|brewed|imported|blended|vinted|cellared|packed|manufactured|prepared|canned)\b[\w\s,&]{0,30}?\bby\b/i;

function checkNameAddress(ex) {
  const label = 'Name and address';
  const raw = normalizeSpace(ex.name_address);
  if (!raw) return missing(ex, 'name_address', label, 'No bottler, producer, or importer name and address found.');
  return RESPONSIBILITY_PHRASE.test(raw)
    ? result('name_address', label, STATUS.PASS, 'Name and address present with a qualifying phrase. Confirm the city and state are included.', raw)
    : result('name_address', label, STATUS.REVIEW, 'Name and address found, but without a phrase such as "Bottled by" or "Imported by".', raw);
}

export function isImport(ex) {
  return Boolean(ex.is_import_indicated) || /\bimport(ed|er)\b/i.test(ex.name_address ?? '');
}

function checkCountryOfOrigin(ex) {
  const label = 'Country of origin';
  const raw = normalizeSpace(ex.country_of_origin);
  if (!isImport(ex)) {
    return result('country_of_origin', label, STATUS.NA, 'Not required: the label does not indicate an imported product.', raw || null);
  }
  return raw
    ? result('country_of_origin', label, STATUS.PASS, 'Country of origin is stated for this import.', raw)
    : result('country_of_origin', label, STATUS.FAIL, 'Imported product, but no country of origin statement (e.g. "Product of Scotland").');
}

function checkGovernmentWarning(ex) {
  const label = 'Government health warning';
  const w = ex.government_warning ?? {};
  const text = normalizeSpace(w.text);
  if (!text) {
    return missing(ex, 'government_warning', label, 'The Government Health Warning Statement is missing. It is required on all alcohol beverages.');
  }

  let status = STATUS.PASS;
  const problems = [];
  const notes = [];
  let body = text;

  const heading = text.match(/^(government\s+warning)\s*(:?)\s*/i);
  if (!heading) {
    status = STATUS.FAIL;
    problems.push('The statement must begin with "GOVERNMENT WARNING:".');
  } else {
    body = text.slice(heading[0].length);
    if (heading[1] !== 'GOVERNMENT WARNING') {
      status = STATUS.FAIL;
      problems.push(`"${heading[1]}" must be in capital letters: "GOVERNMENT WARNING".`);
    }
    if (!heading[2]) {
      status = worst(status, STATUS.REVIEW);
      problems.push('The heading should be followed by a colon.');
    }
  }

  let diff = null;
  if (body !== WARNING_BODY) {
    diff = diffWords(GOVERNMENT_WARNING, text);
    const distance = levenshtein(looseNormalize(body), looseNormalize(WARNING_BODY));
    if (distance === 0) {
      status = worst(status, STATUS.REVIEW);
      problems.push('Wording matches, but capitalization or punctuation differs from the required text. This may be a misread; compare with the image.');
    } else if (distance <= OCR_MISREAD_CHARS) {
      status = worst(status, STATUS.REVIEW);
      problems.push(`Differs from the required text by ${distance} character${distance > 1 ? 's' : ''}. This may be a misread; compare the highlighted words with the image.`);
    } else {
      status = STATUS.FAIL;
      problems.push('Wording differs from the required statement (see highlighted differences).');
    }
  }

  if (w.heading_bold === false) {
    status = worst(status, STATUS.REVIEW);
    problems.push('"GOVERNMENT WARNING" does not appear to be bold (its strokes are no thicker than the body text); it must be.');
  } else if (w.heading_bold == null) {
    notes.push('Could not measure whether the heading is bold; check the image.');
  }
  if (w.body_bold === true) {
    status = worst(status, STATUS.REVIEW);
    problems.push('The remainder of the statement appears bold; only the heading may be bold.');
  }

  const message = problems.length ? problems.join(' ') : 'Matches the required statement word for word.';
  return result('government_warning', label, status, [message, ...notes].join(' '), text, diff ? { diff } : {});
}

function checkSulfites(ex) {
  const label = 'Sulfite declaration';
  const raw = normalizeSpace(ex.sulfite_declaration);
  return raw && /\bsul(f|ph)ites?\b/i.test(raw)
    ? result('sulfites', label, STATUS.PASS, 'Sulfite declaration is present.', raw)
    : result('sulfites', label, STATUS.REVIEW, 'No "Contains Sulfites" statement found. It is required if the wine has 10 ppm or more sulfur dioxide.');
}

function checkImageQuality(ex) {
  if (ex.image_quality !== 'poor') return null;
  const issues = (ex.image_issues ?? []).join('; ');
  return result('image_quality', 'Image legibility', STATUS.REVIEW, `Parts of the label were hard to read${issues ? ` (${issues})` : ''}. Results may be incomplete; a straighter, well-lit photo will help.`);
}

export function summarize(items) {
  const counts = { pass: 0, fail: 0, review: 0, na: 0 };
  for (const item of items) counts[item.status]++;
  const overall = counts.fail ? STATUS.FAIL : counts.review ? STATUS.REVIEW : STATUS.PASS;
  return { overall, counts };
}

export function evaluateLabel(extraction, { beverageType = 'auto', expected = {} } = {}) {
  const ex = extraction ?? {};
  const type = resolveBeverageType(beverageType, ex.beverage_type);

  if (ex.is_alcohol_label == null) {
    const checks = [result('readable', 'Readable image', STATUS.REVIEW, 'No text could be read from this image. Retake the photo straight-on, in focus, and without glare.')];
    return { beverageType: type, checks, comparisons: [], ...summarize(checks), unreadable: true };
  }
  if (ex.is_alcohol_label === false) {
    const checks = [result('is_label', 'Alcohol label', STATUS.FAIL, 'This image does not appear to be an alcohol beverage label.')];
    return { beverageType: type, checks, comparisons: [], ...summarize(checks) };
  }

  const checks = [
    checkImageQuality(ex),
    type === 'unknown'
      ? result('beverage_type', 'Beverage type', STATUS.REVIEW, 'Could not tell whether this is spirits, wine, or beer. Select the type and re-check for type-specific rules.')
      : null,
    checkBrand(ex),
    checkClassType(ex),
    checkAlcohol(ex, type),
    checkNetContents(ex, type),
    checkNameAddress(ex),
    checkCountryOfOrigin(ex),
    checkGovernmentWarning(ex),
    type === 'wine' ? checkSulfites(ex) : null,
  ].filter(Boolean);

  const comparisons = compareExpected(ex, expected);
  return { beverageType: type, checks, comparisons, ...summarize([...checks, ...comparisons]) };
}

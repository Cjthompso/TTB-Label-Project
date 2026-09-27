import { looseNormalize, normalizeSpace, parseAlcohol, parseNetContents, similarity } from './text.js';

export const COMPARABLE_FIELDS = [
  { key: 'brand_name', label: 'Brand name', kind: 'text' },
  { key: 'class_type', label: 'Class/type designation', kind: 'text' },
  { key: 'alcohol_content', label: 'Alcohol content', kind: 'alcohol' },
  { key: 'net_contents', label: 'Net contents', kind: 'volume' },
  { key: 'name_address', label: 'Name and address', kind: 'text' },
  { key: 'country_of_origin', label: 'Country of origin', kind: 'text' },
];

const SIMILAR_THRESHOLD = 0.85;

const out = (field, status, message, expected, found) => ({
  id: `match_${field.key}`,
  label: field.label,
  status,
  message,
  expected,
  found: found || null,
});

function compareText(field, expected, found) {
  if (!found) return out(field, 'fail', 'Not found on the label.', expected, found);
  if (expected === found) return out(field, 'pass', 'Exact match.', expected, found);
  const a = looseNormalize(expected);
  const b = looseNormalize(found);
  if (a === b) return out(field, 'pass', 'Matches; differs only in capitalization or punctuation.', expected, found);
  if (b.includes(a)) return out(field, 'pass', 'Application value appears within the label text.', expected, found);
  const score = similarity(expected, found);
  if (score >= SIMILAR_THRESHOLD) {
    return out(field, 'review', `Close but not identical (${Math.round(score * 100)}% similar). Check for a typo.`, expected, found);
  }
  return out(field, 'fail', 'Does not match the application.', expected, found);
}

function compareAlcohol(field, expected, found) {
  if (!found) return out(field, 'fail', 'Not found on the label.', expected, found);
  const e = parseAlcohol(expected);
  const f = parseAlcohol(found);
  if (e?.abv == null || f?.abv == null) return compareText(field, expected, found);
  if (e.abv !== f.abv) return out(field, 'fail', `Label says ${f.abv}%, application says ${e.abv}%.`, expected, found);
  if (e.proof != null && f.proof != null && e.proof !== f.proof) {
    return out(field, 'fail', `Label says ${f.proof} proof, application says ${e.proof} proof.`, expected, found);
  }
  return out(field, 'pass', `Both state ${f.abv}% alcohol by volume.`, expected, found);
}

function compareVolume(field, expected, found) {
  if (!found) return out(field, 'fail', 'Not found on the label.', expected, found);
  const [e] = parseNetContents(expected);
  const f = parseNetContents(found);
  if (!e || !f.length) return compareText(field, expected, found);
  const same = f.some((q) => Math.abs(q.ml - e.ml) / e.ml < 0.005);
  return same
    ? out(field, 'pass', 'Same volume.', expected, found)
    : out(field, 'fail', 'Label volume differs from the application.', expected, found);
}

const COMPARATORS = { text: compareText, alcohol: compareAlcohol, volume: compareVolume };

export function compareExpected(extraction, expected = {}) {
  return COMPARABLE_FIELDS.filter((f) => normalizeSpace(expected?.[f.key])).map((f) =>
    COMPARATORS[f.kind](f, normalizeSpace(expected[f.key]), normalizeSpace(extraction?.[f.key])),
  );
}

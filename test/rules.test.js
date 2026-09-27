import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLabel } from '../public/lib/rules.js';
import { GOVERNMENT_WARNING } from '../public/lib/constants.js';
import { parseAlcohol, parseNetContents } from '../public/lib/text.js';

const bourbon = () => ({
  is_alcohol_label: true,
  image_quality: 'good',
  beverage_type: 'distilled_spirits',
  brand_name: 'OLD TOM DISTILLERY',
  class_type: 'Kentucky Straight Bourbon Whiskey',
  alcohol_content: '45% Alc./Vol. (90 Proof)',
  net_contents: '750 mL',
  name_address: 'Bottled by Old Tom Distillery, Bardstown, Kentucky',
  country_of_origin: null,
  is_import_indicated: false,
  government_warning: { text: GOVERNMENT_WARNING, heading_bold: true, body_bold: false },
});

const find = (report, id) => [...report.checks, ...report.comparisons].find((c) => c.id === id);

test('fully compliant spirits label passes', () => {
  const r = evaluateLabel(bourbon());
  assert.equal(r.overall, 'pass', JSON.stringify(r.checks.filter((c) => c.status !== 'pass'), null, 2));
});

test('missing government warning fails', () => {
  const ex = bourbon();
  ex.government_warning = { text: null, heading_bold: null, body_bold: null };
  const r = evaluateLabel(ex);
  assert.equal(find(r, 'government_warning').status, 'fail');
  assert.equal(r.overall, 'fail');
});

test('title-case warning heading fails', () => {
  const ex = bourbon();
  ex.government_warning.text = GOVERNMENT_WARNING.replace('GOVERNMENT WARNING', 'Government Warning');
  assert.equal(find(evaluateLabel(ex), 'government_warning').status, 'fail');
});

test('altered warning wording fails and returns a diff', () => {
  const ex = bourbon();
  ex.government_warning.text = GOVERNMENT_WARNING.replace('birth defects', 'health issues');
  const check = find(evaluateLabel(ex), 'government_warning');
  assert.equal(check.status, 'fail');
  assert.ok(check.diff.some((d) => d.type === 'missing' && d.text.includes('birth defects')));
  assert.ok(check.diff.some((d) => d.type === 'extra' && d.text.includes('health issues')));
});

test('non-bold heading needs review', () => {
  const ex = bourbon();
  ex.government_warning.heading_bold = false;
  assert.equal(find(evaluateLabel(ex), 'government_warning').status, 'review');
});

test('proof that is not twice ABV fails', () => {
  const ex = bourbon();
  ex.alcohol_content = '45% Alc./Vol. (80 Proof)';
  assert.equal(find(evaluateLabel(ex), 'alcohol_content').status, 'fail');
});

test('spirits without alcohol content fails', () => {
  const ex = bourbon();
  ex.alcohol_content = null;
  assert.equal(find(evaluateLabel(ex), 'alcohol_content').status, 'fail');
});

test('non-standard spirits fill size needs review', () => {
  const ex = bourbon();
  ex.net_contents = '800 mL';
  assert.equal(find(evaluateLabel(ex), 'net_contents').status, 'review');
});

test('imported product without country of origin fails', () => {
  const ex = bourbon();
  ex.name_address = 'Imported by Harbor Spirits Co., New York, NY';
  assert.equal(find(evaluateLabel(ex), 'country_of_origin').status, 'fail');
  ex.country_of_origin = 'Product of Scotland';
  assert.equal(find(evaluateLabel(ex), 'country_of_origin').status, 'pass');
});

test('malt beverage: ABV optional, metric-only net contents fails', () => {
  const ex = { ...bourbon(), beverage_type: 'malt_beverage', class_type: 'India Pale Ale', alcohol_content: null, net_contents: '355 mL' };
  const r = evaluateLabel(ex);
  assert.equal(find(r, 'alcohol_content').status, 'na');
  assert.equal(find(r, 'net_contents').status, 'fail');
  ex.net_contents = '12 FL OZ (355 mL)';
  assert.equal(find(evaluateLabel(ex), 'net_contents').status, 'pass');
});

test('table wine may omit ABV; wine without sulfite statement needs review', () => {
  const ex = { ...bourbon(), beverage_type: 'wine', class_type: 'Red Table Wine', alcohol_content: null, sulfite_declaration: null };
  const r = evaluateLabel(ex);
  assert.equal(find(r, 'alcohol_content').status, 'pass');
  assert.equal(find(r, 'sulfites').status, 'review');
});

test('user-selected beverage type overrides detection', () => {
  const ex = { ...bourbon(), beverage_type: 'unknown' };
  assert.equal(evaluateLabel(ex).beverageType, 'unknown');
  assert.equal(evaluateLabel(ex, { beverageType: 'distilled_spirits' }).beverageType, 'distilled_spirits');
});

test('application comparison tolerates case/punctuation but catches real differences', () => {
  const ex = bourbon();
  ex.brand_name = "Stone's Throw";
  const r = evaluateLabel(ex, {
    expected: { brand_name: "STONE'S THROW", alcohol_content: '45.0% ABV', net_contents: '0.75 L', class_type: 'Straight Rye Whiskey' },
  });
  assert.equal(find(r, 'match_brand_name').status, 'pass');
  assert.equal(find(r, 'match_alcohol_content').status, 'pass');
  assert.equal(find(r, 'match_net_contents').status, 'pass');
  assert.equal(find(r, 'match_class_type').status, 'fail');
});

test('near-miss application value is flagged for review', () => {
  const r = evaluateLabel(bourbon(), { expected: { brand_name: 'OLD TOM DISTILERY' } });
  assert.equal(find(r, 'match_brand_name').status, 'review');
});

test('non-label image fails cleanly', () => {
  const r = evaluateLabel({ is_alcohol_label: false });
  assert.equal(r.overall, 'fail');
});

test('parsers', () => {
  assert.deepEqual(parseAlcohol('45% Alc./Vol. (90 Proof)'), { abv: 45, proof: 90, hasAbvWording: true });
  assert.equal(parseAlcohol('Alcohol 13.5% by volume').abv, 13.5);
  assert.equal(Math.round(parseNetContents('1.75 L')[0].ml), 1750);
  assert.equal(parseNetContents('12 FL. OZ.')[0].system, 'us');
});

test('missing field on a hard-to-read image is sent to review, not failed', () => {
  const ex = bourbon();
  ex.class_type = null;
  assert.equal(find(evaluateLabel(ex), 'class_type').status, 'fail');
  ex.image_quality = 'fair';
  assert.equal(find(evaluateLabel(ex), 'class_type').status, 'review');
});

test('a few changed characters in the warning is flagged as a possible misread', () => {
  const ex = bourbon();
  ex.government_warning.text = GOVERNMENT_WARNING.replace('Surgeon General', 'Surgeon Genera1');
  assert.equal(find(evaluateLabel(ex), 'government_warning').status, 'review');
});

test('image with no readable text is reported as unreadable', () => {
  const r = evaluateLabel({ is_alcohol_label: null });
  assert.equal(r.overall, 'review');
  assert.equal(r.unreadable, true);
});

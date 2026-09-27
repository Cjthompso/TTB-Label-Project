import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseLabel } from '../public/lib/parse.js';
import { evaluateLabel } from '../public/lib/rules.js';

const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/ocr-samples.json', import.meta.url)));
const run = (file, options) => {
  const extraction = parseLabel(fixtures[file]);
  return { extraction, report: evaluateLabel(extraction, options) };
};
const statusOf = (report, id) => [...report.checks, ...report.comparisons].find((c) => c.id === id)?.status;

const EXPECTED = {
  '01_old_tom_bourbon_compliant.png': 'pass',
  '02_casa_luna_cabernet_compliant.png': 'pass',
  '03_sundown_lager_compliant.png': 'pass',
  '04_agave_alto_tequila_import_compliant.png': 'pass',
  '05_harbor_scotch_multiple_violations.png': 'fail',
  '06_river_bend_ipa_metric_only.png': 'fail',
  '07_northwind_vodka_no_warning.png': 'fail',
  '08_bellwether_gin_needs_review.png': 'review',
  '09_sierra_roja_zinfandel_missing_abv.png': 'fail',
  '10_old_tom_phone_photo.jpg': 'review',
  '11_old_tom_blurry_photo.jpg': 'review',
  '12_not_a_label.png': 'fail',
};

for (const [file, verdict] of Object.entries(EXPECTED)) {
  test(`${file} → ${verdict}`, () => assert.equal(run(file).report.overall, verdict));
}

test('fields are read from the example bourbon label', () => {
  const { extraction: ex } = run('01_old_tom_bourbon_compliant.png');
  assert.equal(ex.brand_name, 'OLD TOM DISTILLERY');
  assert.equal(ex.class_type, 'Kentucky Straight Bourbon Whiskey');
  assert.equal(ex.alcohol_content, '45% Alc./Vol. (90 Proof)');
  assert.equal(ex.net_contents, '750 mL');
  assert.match(ex.name_address, /Bottled by Old Tom Distillery, Bardstown, Kentucky/);
  assert.equal(ex.beverage_type, 'distilled_spirits');
  assert.equal(ex.government_warning.heading_bold, true);
});

test('each violation on the Scotch label is caught', () => {
  const { report } = run('05_harbor_scotch_multiple_violations.png');
  for (const id of ['alcohol_content', 'country_of_origin', 'government_warning']) assert.equal(statusOf(report, id), 'fail', id);
});

test('non-bold warning heading is detected from pixels', () => {
  const { extraction } = run('08_bellwether_gin_needs_review.png');
  assert.equal(extraction.government_warning.heading_bold, false);
});

test('import country, wine sulfites, and beer type are recognized', () => {
  assert.equal(run('04_agave_alto_tequila_import_compliant.png').extraction.country_of_origin, 'Product of Mexico');
  assert.equal(run('02_casa_luna_cabernet_compliant.png').extraction.sulfite_declaration, 'Contains Sulfites');
  assert.equal(run('03_sundown_lager_compliant.png').extraction.beverage_type, 'malt_beverage');
});

test('application comparison works on OCR output', () => {
  const { report } = run('01_old_tom_bourbon_compliant.png', {
    expected: { brand_name: 'Old Tom Distillery', alcohol_content: '45.0% ABV', net_contents: '1 L' },
  });
  assert.equal(statusOf(report, 'match_brand_name'), 'pass');
  assert.equal(statusOf(report, 'match_alcohol_content'), 'pass');
  assert.equal(statusOf(report, 'match_net_contents'), 'fail');
});

test('parser works on hand-edited text with no layout information', () => {
  const lines = ['OLD TOM', 'DISTILLERY', 'Kentucky Straight Bourbon Whiskey', '45% Alc./Vol. (90 Proof)', '750 mL'].map((text) => ({ text }));
  const ex = parseLabel({ lines });
  assert.equal(ex.brand_name, 'OLD TOM DISTILLERY');
  assert.equal(ex.class_type, 'Kentucky Straight Bourbon Whiskey');
});

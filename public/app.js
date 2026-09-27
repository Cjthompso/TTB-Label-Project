import { loadEngine, readLabel } from './lib/ocr.js';
import { parseLabel } from './lib/parse.js';
import { evaluateLabel } from './lib/rules.js';

const MAX_FILES = 20;
const STATUS_TEXT = { pass: 'Pass', fail: 'Fail', review: 'Review', na: 'N/A' };
const VERDICT_TEXT = { pass: 'Compliant', fail: 'Not compliant', review: 'Needs review', error: 'Not checked', pending: 'Waiting', working: 'Reading' };
const TYPE_TEXT = { distilled_spirits: 'Distilled spirits', wine: 'Wine', malt_beverage: 'Malt beverage', unknown: 'Unknown type' };

const $ = (sel) => document.querySelector(sel);
const form = $('#form');
const fileInput = $('#files');
const drop = $('#drop');
const fileList = $('#file-list');
const submit = $('#submit');
const formError = $('#form-error');
const results = $('#results');

let items = [];
let nextId = 1;
let running = false;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function showError(message) {
  formError.textContent = message;
  formError.hidden = !message;
}


function addFiles(files) {
  showError('');
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  if (images.length < files.length) showError('Some files were skipped because they are not images.');
  for (const file of images) {
    if (items.length >= MAX_FILES) {
      showError(`You can check up to ${MAX_FILES} labels at a time.`);
      break;
    }
    items.push({ id: nextId++, file, url: URL.createObjectURL(file), state: 'pending' });
  }
  renderFileList();
  if (items.length) loadEngine().catch(() => {});
}

function renderFileList() {
  fileList.innerHTML = items
    .map((it) => `<li><img src="${it.url}" alt=""><span>${esc(it.file.name)}</span><button type="button" data-remove="${it.id}" aria-label="Remove ${esc(it.file.name)}">Remove</button></li>`)
    .join('');
  submit.disabled = running || items.length === 0;
  submit.textContent = running ? 'Checking…' : items.length > 1 ? `Check ${items.length} labels` : 'Check label';
}

fileList.addEventListener('click', (e) => {
  const id = Number(e.target.dataset.remove);
  if (!id || running) return;
  const it = items.find((x) => x.id === id);
  URL.revokeObjectURL(it.url);
  items = items.filter((x) => x.id !== id);
  renderFileList();
  document.getElementById(`card-${id}`)?.remove();
});

fileInput.addEventListener('change', () => {
  addFiles(fileInput.files);
  fileInput.value = '';
});
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('dragging'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('dragging'); }));
drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

function currentOptions() {
  const expected = {};
  for (const input of form.querySelectorAll('.expected input')) {
    if (input.value.trim()) expected[input.name] = input.value.trim();
  }
  return { beverageType: $('#beverage-type').value, expected };
}

function evaluate(it) {
  it.extraction = parseLabel(it.ocr);
  it.report = evaluateLabel(it.extraction, currentOptions());
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!items.length) return showError('Add at least one label image.');
  showError('');
  running = true;
  renderFileList();
  results.innerHTML = '<p id="batch-summary" class="batch-summary" aria-live="polite"></p>' + items.map((it) => `<article class="report" id="card-${it.id}"></article>`).join('');

  for (const it of items) {
    if (it.ocr) {
      evaluate(it);
      it.state = 'done';
    } else {
      it.state = 'pending';
    }
    renderCard(it);
  }

  const todo = items.filter((it) => !it.ocr);
  for (const [n, it] of todo.entries()) {
    it.state = 'working';
    it.error = null;
    renderCard(it, { step: n + 1, total: todo.length, progress: 0 });
    try {
      it.ocr = await readLabel(it.file, (p) => updateProgress(it, p));
      evaluate(it);
      it.state = 'done';
    } catch (err) {
      it.state = 'error';
      it.error = err.message || 'This label could not be checked.';
    }
    renderCard(it);
    renderSummary();
  }

  running = false;
  renderFileList();
  renderSummary();
});

results.addEventListener('click', (e) => {
  const id = Number(e.target.dataset.recheck);
  if (!id) return;
  const it = items.find((x) => x.id === id);
  const edited = document.getElementById(`text-${id}`).value.split('\n');
  const byText = new Map(it.ocr.lines.map((l) => [l.text, l]));
  it.ocr = { ...it.ocr, confidence: 100, lines: edited.filter((t) => t.trim()).map((text) => byText.get(text) ?? { text, height: null, confidence: 100 }) };
  it.edited = true;
  evaluate(it);
  renderCard(it);
  renderSummary();
  document.getElementById(`card-${id}`).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

function renderSummary() {
  const el = $('#batch-summary');
  if (!el) return;
  const done = items.filter((it) => it.state === 'done' || it.state === 'error');
  const tally = { pass: 0, review: 0, fail: 0, error: 0 };
  done.forEach((it) => tally[it.state === 'error' ? 'error' : it.report.overall]++);
  const parts = [
    tally.pass && `<strong>${tally.pass}</strong> compliant`,
    tally.review && `<strong>${tally.review}</strong> need review`,
    tally.fail && `<strong>${tally.fail}</strong> not compliant`,
    tally.error && `<strong>${tally.error}</strong> could not be checked`,
  ].filter(Boolean);
  const prefix = running ? `Checked ${done.length} of ${items.length}` : `${items.length} label${items.length > 1 ? 's' : ''} checked`;
  el.innerHTML = parts.length ? `${prefix}: ${parts.join(', ')}.` : `${prefix}.`;
}

function updateProgress(it, p) {
  const bar = document.querySelector(`#card-${it.id} .bar > span`);
  if (bar) bar.style.width = `${Math.round(p * 100)}%`;
}

function renderCard(it, progress) {
  const card = document.getElementById(`card-${it.id}`);
  if (!card) return;
  const status = it.state === 'done' ? it.report.overall : it.state;
  card.className = `report ${status}`;

  let meta = '';
  let body = '';
  if (it.state === 'pending') {
    meta = 'Waiting to be read';
  } else if (it.state === 'working') {
    const first = !it.ocr && progress?.step === 1;
    meta = `Reading label${progress?.total > 1 ? ` ${progress.step} of ${progress.total}` : ''}${first ? '. The first label takes longer while the text engine loads.' : ''}`;
    body = '<div class="bar" aria-hidden="true"><span></span></div>';
  } else if (it.state === 'error') {
    meta = 'Not checked';
    body = `<p class="error-msg">${esc(it.error)}</p>`;
  } else {
    const r = it.report;
    const counts = `${r.counts.fail} failed, ${r.counts.review} to review`;
    meta = r.unreadable ? 'No text found' : `${TYPE_TEXT[r.beverageType]}, ${counts}${it.edited ? ', using edited text' : ''}`;
    body = `<div class="section-title">Mandatory label information</div><ul class="checks">${r.checks.map(renderCheck).join('')}</ul>`;
    if (r.comparisons.length) {
      body += `<div class="section-title">Compared with application</div><ul class="checks">${r.comparisons.map(renderCheck).join('')}</ul>`;
    }
    const text = it.ocr.lines.map((l) => l.text).join('\n');
    body += `<details class="transcript"${r.unreadable ? ' open' : ''}>
      <summary>Text read from label</summary>
      <p class="hint">If something was misread, correct it here and re-check. Keep one line of the label per line.</p>
      <textarea id="text-${it.id}" rows="${Math.min(18, Math.max(6, it.ocr.lines.length + 1))}" spellcheck="false" aria-label="Text read from ${esc(it.file.name)}">${esc(text)}</textarea>
      <button type="button" class="secondary" data-recheck="${it.id}">Re-check with this text</button>
    </details>`;
  }

  card.innerHTML = `<div class="report-head">
      <img src="${it.url}" alt="Label image ${esc(it.file.name)}" data-zoom>
      <div><h3>${esc(it.file.name)}</h3><div class="meta">${esc(meta)}</div></div>
      <span class="verdict ${status}">${VERDICT_TEXT[status]}</span>
    </div>${body}`;
}

function renderCheck(c) {
  let detail = '';
  if (c.expected !== undefined) {
    detail = `<div class="found"><span class="k">Application</span>${esc(c.expected)}</div><div class="found"><span class="k">Label</span>${c.found ? esc(c.found) : '<em>not found</em>'}</div>`;
  } else if (c.diff) {
    const marked = c.diff
      .map((run) => (run.type === 'equal' ? esc(run.text) : `<span class="${run.type}">${esc(run.text)}</span>`))
      .join(' ');
    detail = `<div class="diff">${marked}</div><div class="diff-key"><span class="missing">underlined</span> = required but missing from label; <span class="extra">struck</span> = on label but not in required text</div>`;
  } else if (c.found) {
    detail = `<div class="found">${esc(c.found)}</div>`;
  }
  return `<li class="check"><span class="badge ${c.status}">${STATUS_TEXT[c.status]}</span><div><h4>${esc(c.label)}</h4><p>${esc(c.message)}</p>${detail}</div></li>`;
}

const dialog = document.createElement('dialog');
document.body.append(dialog);
results.addEventListener('click', (e) => {
  if (!e.target.matches('[data-zoom]')) return;
  dialog.innerHTML = `<img src="${e.target.src}" alt="${esc(e.target.alt)}">`;
  dialog.showModal();
});
dialog.addEventListener('click', () => dialog.close());

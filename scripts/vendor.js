import fs from 'node:fs';
import zlib from 'node:zlib';

const out = 'public/vendor/tesseract';
fs.mkdirSync(out, { recursive: true });
for (const f of ['tesseract.min.js', 'worker.min.js']) fs.copyFileSync(`node_modules/tesseract.js/dist/${f}`, `${out}/${f}`);
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js']) fs.copyFileSync(`node_modules/tesseract.js-core/${f}`, `${out}/${f}`);

const model = `${out}/eng.traineddata.gz`;
if (!fs.existsSync(model)) {
  const res = await fetch('https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata');
  if (!res.ok) throw new Error(`Model download failed: ${res.status}`);
  fs.writeFileSync(model, zlib.gzipSync(Buffer.from(await res.arrayBuffer()), { level: 9 }));
}
console.log('Vendored OCR files into', out);

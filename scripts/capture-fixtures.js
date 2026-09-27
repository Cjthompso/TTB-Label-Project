import fs from 'node:fs';
import { createWorker, PSM } from 'tesseract.js';
import { PNG } from 'pngjs';
import { summarizeOcr } from '../public/lib/ocr-core.js';
import { OCR_OPTIONS } from '../public/lib/ocr-settings.js';

const worker = await createWorker('eng', 1, { langPath: 'public/vendor/tesseract', cachePath: '/tmp/tesseract-cache' });
await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });

const fixtures = {};
for (const file of fs.readdirSync('samples').filter((f) => /\.(png|jpe?g)$/i.test(f)).sort()) {
  const { data } = await worker.recognize(`samples/${file}`, OCR_OPTIONS, { blocks: true, imageBinary: true });
  const png = PNG.sync.read(Buffer.from(data.imageBinary.split(',')[1], 'base64'));
  fixtures[file] = summarizeOcr(data, png);
  console.log(file, fixtures[file].confidence, fixtures[file].headingBold);
}
await worker.terminate();
fs.mkdirSync('test/fixtures', { recursive: true });
fs.writeFileSync('test/fixtures/ocr-samples.json', JSON.stringify(fixtures, null, 1));

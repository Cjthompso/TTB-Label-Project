Vendored OCR engine so the app makes no third-party network calls.

- tesseract.min.js, worker.min.js: tesseract.js 6.0.1 (Apache-2.0), https://github.com/naptha/tesseract.js
- tesseract-core-*.wasm.js: tesseract.js-core 6.1.2 (Apache-2.0)
- eng.traineddata.gz: English LSTM model from https://github.com/tesseract-ocr/tessdata_fast (Apache-2.0), gzipped

To update: `npm install` then `npm run vendor`.

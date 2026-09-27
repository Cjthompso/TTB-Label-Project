import { summarizeOcr } from './ocr-core.js';
import { MAX_EDGE, OCR_OPTIONS } from './ocr-settings.js';

const VENDOR = new URL('../vendor/tesseract', import.meta.url).href;

let workerPromise = null;
let onLog = null;

export class OcrError extends Error {}

export function loadEngine() {
  workerPromise ??= (async () => {
    const T = window.Tesseract;
    if (!T) throw new OcrError('The text recognition engine failed to load. Refresh the page and try again.');
    const worker = await T.createWorker('eng', T.OEM.LSTM_ONLY, {
      workerPath: `${VENDOR}/worker.min.js`,
      corePath: VENDOR,
      langPath: VENDOR,
      workerBlobURL: false,
      logger: (m) => onLog?.(m),
    });
    await worker.setParameters({ tessedit_pageseg_mode: T.PSM.AUTO });
    return worker;
  })().catch((err) => {
    workerPromise = null;
    throw err instanceof OcrError ? err : new OcrError('The text recognition engine could not start in this browser.');
  });
  return workerPromise;
}

async function toCanvas(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new OcrError('This image could not be opened. Use a JPEG, PNG, or WebP file.');
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

function pixelsFromDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, c.width, c.height));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}


export async function readLabel(file, onProgress = () => {}) {
  const [canvas, worker] = await Promise.all([toCanvas(file), loadEngine()]);
  onLog = (m) => m.status === 'recognizing text' && onProgress(m.progress);
  try {
    const { data } = await worker.recognize(canvas, OCR_OPTIONS, { blocks: true, imageBinary: true });
    const binary = data.imageBinary ? await pixelsFromDataUrl(data.imageBinary) : null;
    return summarizeOcr(data, binary);
  } catch (err) {
    if (err instanceof OcrError) throw err;
    console.error(err);
    throw new OcrError('Text recognition failed on this image. Try a different photo.');
  } finally {
    onLog = null;
  }
}

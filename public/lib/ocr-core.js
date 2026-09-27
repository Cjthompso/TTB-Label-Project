const BOLD_RATIO = 1.3; 
const REGULAR_RATIO = 1.12;

export function strokeWidth(img, { x0, y0, x1, y1 }) {
  let total = 0;
  let runs = 0;
  for (let y = Math.max(0, y0); y < Math.min(img.height, y1); y++) {
    let run = 0;
    for (let x = Math.max(0, x0); x <= Math.min(img.width, x1); x++) {
      const dark = x < x1 && img.data[(y * img.width + x) * 4] < 128;
      if (dark) run++;
      else if (run) {
        total += run;
        runs++;
        run = 0;
      }
    }
  }
  return runs ? total / runs : null;
}

export function measureHeadingBold(words, img) {
  const i = words.findIndex((w, k) => /^g[o0]vernment/i.test(w.text) && /^warning/i.test(words[k + 1]?.text ?? ''));
  if (i < 0) return null;
  const head = [words[i], words[i + 1]].map((w) => strokeWidth(img, w.bbox));
  const body = words
    .slice(i + 2, i + 16)
    .filter((w) => /^[a-z]{3,}[,.]?$/i.test(w.text))
    .map((w) => strokeWidth(img, w.bbox))
    .filter(Boolean);
  if (head.includes(null) || body.length < 3) return null;
  const ratio = (head[0] + head[1]) / 2 / (body.reduce((a, b) => a + b, 0) / body.length);
  if (ratio >= BOLD_RATIO) return true;
  if (ratio <= REGULAR_RATIO) return false;
  return null;
}

export function summarizeOcr(data, binaryImage = null) {
  const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
  return {
    confidence: Math.round(data.confidence ?? 0),
    lines: lines
      .map((l) => ({
        text: l.text.trim(),
        height: l.rowAttributes?.row_height ?? l.bbox.y1 - l.bbox.y0,
        confidence: Math.round(l.confidence),
      }))
      .filter((l) => l.text),
    headingBold: binaryImage ? measureHeadingBold(lines.flatMap((l) => l.words), binaryImage) : null,
  };
}

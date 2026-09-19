/** Extract plain text from a PDF in the browser (loaded lazily: pdf.js is heavy). */
export async function pdfToText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 30); p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    // Rebuild lines from text items using their vertical position.
    let lastY: number | null = null;
    let line = '';
    for (const it of content.items as any[]) {
      const y = it.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        out.push(line.trim());
        line = '';
      }
      line += it.str + ' ';
      lastY = y;
    }
    out.push(line.trim());
  }
  return out.filter(Boolean).join('\n');
}

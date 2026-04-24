/**
 * Client-side PDF text extraction for Quickstart seed input.
 * Lazy-imports `pdfjs-dist` on first invocation so the dashboard's
 * initial bundle stays lean. No server roundtrip; PDFs never leave
 * the browser.
 *
 * @module paracosm/dashboard/quickstart/pdf-extract
 */

export interface PdfExtractResult {
  /** Extracted text content, joined across pages with blank-line breaks. */
  text: string;
  /** Number of pages in the source PDF. */
  pages: number;
  /** True when `text` was truncated to stay within `maxBytes`. */
  truncated: boolean;
}

export interface PdfExtractOptions {
  /** Hard cap on extracted bytes (UTF-8). Default 50 000. */
  maxBytes?: number;
  /** Cap on pages scanned. Default 100. */
  maxPages?: number;
}

/**
 * Extract text from a PDF File. Uses `pdfjs-dist` via dynamic import.
 *
 * @throws Error when the file is not a PDF or the extraction fails.
 */
export async function extractPdfText(
  file: File,
  options: PdfExtractOptions = {},
): Promise<PdfExtractResult> {
  const { maxBytes = 50_000, maxPages = 100 } = options;
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    throw new Error(`File is not a PDF: ${file.name}`);
  }
  const pdfjs = await import('pdfjs-dist');
  // Disable worker to avoid needing a bundler-specific worker URL.
  // Slightly slower but works without additional Vite config.
  (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = '';

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer, disableWorker: true }).promise;
  const scanPages = Math.min(pdf.numPages, maxPages);
  const chunks: string[] = [];
  let totalBytes = 0;
  let truncated = false;
  for (let i = 1; i <= scanPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = (content.items as Array<{ str?: string }>)
      .map(item => item.str ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const pageBytes = new Blob([pageText]).size;
    if (totalBytes + pageBytes > maxBytes) {
      const remaining = maxBytes - totalBytes;
      if (remaining > 0) {
        chunks.push(pageText.slice(0, remaining));
        totalBytes = maxBytes;
      }
      truncated = true;
      break;
    }
    chunks.push(pageText);
    totalBytes += pageBytes;
  }

  return {
    text: chunks.join('\n\n'),
    pages: pdf.numPages,
    truncated,
  };
}

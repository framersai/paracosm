/**
 * Companion ESM loader to `test-css-stub.mjs`. When node:test resolves
 * a `.scss` / `.css` import, this hook returns a synthetic ESM module
 * whose default export is a Proxy that returns the property name as
 * its value (so `styles.foo` evaluates to `'foo'`, matching how CSS
 * Modules normally hash class names).
 */
const CSS_RE = /\.(scss|sass|css)$/;
// Vite's `?url` asset suffix is not understood by node's loader. Stub
// it to a fake URL string so any module that uses `import x from
// 'foo?url'` (e.g. pdfjs-dist worker setup in pdf-extract.ts) loads
// without errors during node:test runs.
const URL_QUERY_RE = /\?url$/;

export function resolve(specifier, context, nextResolve) {
  if (CSS_RE.test(specifier)) {
    return {
      url: `paracosm-css-stub:${specifier}`,
      shortCircuit: true,
      format: 'module',
    };
  }
  if (URL_QUERY_RE.test(specifier)) {
    return {
      url: `paracosm-url-stub:${specifier}`,
      shortCircuit: true,
      format: 'module',
    };
  }
  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  if (url.startsWith('paracosm-css-stub:')) {
    const source = `export default new Proxy({}, { get: (_, key) => typeof key === 'string' ? key : undefined });`;
    return { format: 'module', source, shortCircuit: true };
  }
  if (url.startsWith('paracosm-url-stub:')) {
    // Production path resolves to an actual URL string via Vite's
    // asset pipeline. Tests don't exercise the consumer (pdfjs worker
    // bootstrap) so the literal '' default suffices.
    const source = `export default '';`;
    return { format: 'module', source, shortCircuit: true };
  }
  return nextLoad(url, context);
}

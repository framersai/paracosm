/**
 * Companion ESM loader to `test-css-stub.mjs`. When node:test resolves
 * a `.scss` / `.css` import, this hook returns a synthetic ESM module
 * whose default export is a Proxy that returns the property name as
 * its value (so `styles.foo` evaluates to `'foo'`, matching how CSS
 * Modules normally hash class names).
 */
const CSS_RE = /\.(scss|sass|css)$/;

export function resolve(specifier, context, nextResolve) {
  if (CSS_RE.test(specifier)) {
    // Resolve to a fake file URL so node tracks it as a module; the
    // load() hook below intercepts before any disk read happens.
    return {
      url: `paracosm-css-stub:${specifier}`,
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
  return nextLoad(url, context);
}

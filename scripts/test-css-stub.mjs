/**
 * Node ESM loader hook that resolves `.scss` / `.css` / `.module.scss`
 * imports to an empty object during tests. The viz-kit React components
 * import their SCSS modules directly; node:test cannot natively load
 * those files. Production builds resolve them via Vite (the dashboard
 * dev / build commands), unaffected by this test-only shim.
 *
 * Wire-up: `node --import tsx --import ./scripts/test-css-stub.mjs --test ...`
 */
import { register } from 'node:module';

register('./test-css-stub-loader.mjs', import.meta.url);

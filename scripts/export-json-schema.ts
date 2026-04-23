/**
 * Emits JSON Schema artifacts for non-TS consumers.
 *
 * Output:
 *   - schema/run-artifact.schema.json
 *   - schema/stream-event.schema.json
 *
 * Consumed by digital-twin (Python + `datamodel-codegen`) and any other
 * language ecosystem that generates types from JSON Schema.
 *
 * Uses Zod v4's native `z.toJSONSchema()` — no third-party converter dep.
 *
 * Run: `npm run export:json-schema`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { RunArtifactSchema, StreamEventSchema } from '../src/engine/schema/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'schema');

mkdirSync(outDir, { recursive: true });

writeFileSync(
  join(outDir, 'run-artifact.schema.json'),
  JSON.stringify(z.toJSONSchema(RunArtifactSchema), null, 2) + '\n',
);

writeFileSync(
  join(outDir, 'stream-event.schema.json'),
  JSON.stringify(z.toJSONSchema(StreamEventSchema), null, 2) + '\n',
);

console.log('Exported:');
console.log('  schema/run-artifact.schema.json');
console.log('  schema/stream-event.schema.json');

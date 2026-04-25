import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../');
const outDir = path.resolve(root, 'src/cli/dashboard/public/demo');

await fs.mkdir(outDir, { recursive: true });

const COMPOSITIONS = [
  { id: 'SimDemo',      file: 'sim',      codec: 'h264' },
  { id: 'LibraryDemo',  file: 'library',  codec: 'h264' },
  { id: 'BranchesDemo', file: 'branches', codec: 'h264' },
];

console.log('[remotion] bundling…');
const bundled = await bundle({
  entryPoint: path.resolve(__dirname, 'src/index.tsx'),
  webpackOverride: (cfg) => cfg,
});
console.log('[remotion] bundled');

for (const c of COMPOSITIONS) {
  console.log(`[remotion] selecting ${c.id}`);
  const comp = await selectComposition({ serveUrl: bundled, id: c.id });
  const outPath = path.resolve(outDir, `${c.file}.mp4`);
  console.log(`[remotion] rendering ${c.id} -> ${outPath}`);
  await renderMedia({
    composition: comp,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: outPath,
    crf: 20,
    pixelFormat: 'yuv420p',
    onProgress: ({ progress }) => {
      if (progress === 1 || Math.floor(progress * 20) % 4 === 0) {
        process.stdout.write(`\r  ${(progress * 100).toFixed(0)}% `);
      }
    },
  });
  process.stdout.write('\n');
  const stat = await fs.stat(outPath);
  console.log(`[remotion] ${c.file}.mp4: ${(stat.size / 1024).toFixed(0)} KB`);
}

console.log('[remotion] done. output:', outDir);

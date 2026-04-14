import type { LlmProvider } from '../engine/types.js';

export interface CompileCliOptions {
  scenarioPath?: string;
  provider: LlmProvider;
  model: string;
  cache: boolean;
  cacheDir: string;
  seedText?: string;
  seedUrl?: string;
  webSearch: boolean;
  maxSearches?: number;
}

export function parseCompileCliOptions(argv: string[]): CompileCliOptions {
  const options: CompileCliOptions = {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    cache: true,
    cacheDir: '.paracosm/cache',
    webSearch: true,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (!arg.startsWith('--') && !options.scenarioPath) {
      options.scenarioPath = arg;
      continue;
    }

    switch (arg) {
      case '--provider':
        options.provider = (argv[++index] as LlmProvider | undefined) ?? options.provider;
        break;
      case '--model':
        options.model = argv[++index] ?? options.model;
        break;
      case '--no-cache':
        options.cache = false;
        break;
      case '--cache-dir':
        options.cacheDir = argv[++index] ?? options.cacheDir;
        break;
      case '--seed-text':
        options.seedText = argv[++index];
        break;
      case '--seed-url':
        options.seedUrl = argv[++index];
        break;
      case '--no-web-search':
        options.webSearch = false;
        break;
      case '--max-searches': {
        const value = Number.parseInt(argv[++index] ?? '', 10);
        options.maxSearches = Number.isFinite(value) ? value : undefined;
        break;
      }
      default:
        break;
    }
  }

  return options;
}

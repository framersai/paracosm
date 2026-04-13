import type { LlmProvider, SimulationModelConfig } from './sim-config.js';

export interface CliRunOptions {
  maxTurns?: number;
  seed?: number;
  startYear?: number;
  liveSearch: boolean;
  provider?: LlmProvider;
  models?: Partial<SimulationModelConfig>;
}

export function parseCliRunOptions(argv: string[]): CliRunOptions {
  const options: CliRunOptions = { liveSearch: false };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (!arg.startsWith('--') && options.maxTurns === undefined) {
      const turns = Number.parseInt(arg, 10);
      if (Number.isFinite(turns)) options.maxTurns = turns;
      continue;
    }

    switch (arg) {
      case '--live':
        options.liveSearch = true;
        break;
      case '--seed':
        options.seed = Number.parseInt(argv[++index] ?? '', 10);
        break;
      case '--start-year':
        options.startYear = Number.parseInt(argv[++index] ?? '', 10);
        break;
      case '--provider':
        options.provider = (argv[++index] as LlmProvider | undefined);
        break;
      case '--commander-model':
        options.models = { ...(options.models ?? {}), commander: argv[++index] };
        break;
      case '--department-model':
        options.models = { ...(options.models ?? {}), departments: argv[++index] };
        break;
      case '--judge-model':
        options.models = { ...(options.models ?? {}), judge: argv[++index] };
        break;
      default:
        break;
    }
  }

  return options;
}

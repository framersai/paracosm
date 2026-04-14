interface BuildScenarioCompileRequestOptions {
  scenario: Record<string, unknown>;
  seedText: string;
  seedUrl: string;
  webSearch: boolean;
  maxSearches: string;
}

export function buildScenarioCompileRequest(options: BuildScenarioCompileRequestOptions): Record<string, unknown> {
  const request: Record<string, unknown> = {
    scenario: options.scenario,
    webSearch: options.webSearch,
  };

  const trimmedSeedUrl = options.seedUrl.trim();
  const trimmedSeedText = options.seedText.trim();
  const maxSearches = Number.parseInt(options.maxSearches, 10);

  if (trimmedSeedUrl) {
    request.seedUrl = trimmedSeedUrl;
  } else if (trimmedSeedText) {
    request.seedText = trimmedSeedText;
  }

  if (Number.isFinite(maxSearches) && maxSearches > 0) {
    request.maxSearches = maxSearches;
  }

  return request;
}

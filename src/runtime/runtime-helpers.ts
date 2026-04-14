export function buildPromotionPrompt(candidateSummaries: string): string {
  return `You must promote 5 colonists to department head roles. Evaluate these candidates based on their personality traits and specialization. Choose people who align with YOUR leadership style.\n\n${candidateSummaries}\n\nReturn JSON: {"promotions":[{"agentId":"col-...","department":"medical","role":"Chief Medical Officer","reason":"..."},...]}`;
}

export function applyCustomEventToCrisis<T extends { description: string; turnSummary: string; crisis?: string }>(
  crisis: T,
  customEvents: Array<{ turn: number; title: string; description: string }>,
  turn: number,
): T {
  const matches = customEvents.filter(event => event.turn === turn);
  if (!matches.length) return crisis;

  const injected = matches
    .map(event => `USER EVENT: ${event.title} — ${event.description}`)
    .join('\n');
  const suffix = matches.map(event => event.title).join(', ');
  const baseText = crisis.crisis || crisis.description;

  return {
    ...crisis,
    description: `${crisis.description}\n\n${injected}`,
    crisis: baseText ? `${baseText}\n\n${injected}` : undefined,
    turnSummary: crisis.turnSummary
      ? `${crisis.turnSummary} | user event: ${suffix}`
      : `user event: ${suffix}`,
  };
}

export function buildYearSchedule(startYear: number, maxTurns: number): number[] {
  const offsets = [0, 2, 5, 8, 11, 14, 18, 23, 28, 33, 40, 50];
  return Array.from({ length: maxTurns }, (_, index) => {
    const offset = offsets[index] ?? (offsets[offsets.length - 1] + (index - offsets.length + 1) * 5);
    return startYear + offset;
  });
}

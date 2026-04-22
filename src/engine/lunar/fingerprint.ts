/**
 * Lunar-specific timeline fingerprint classification.
 */
export function lunarFingerprint(
  finalState: any,
  outcomeLog: any[],
  leader: any,
  toolRegs: Record<string, string[]>,
  maxTurns: number,
): Record<string, string> {
  const riskyWins = outcomeLog.filter((o: any) => o.outcome === 'risky_success').length;
  const riskyLosses = outcomeLog.filter((o: any) => o.outcome === 'risky_failure').length;
  const conservativeWins = outcomeLog.filter((o: any) => o.outcome === 'conservative_success').length;
  const totalTools = Object.values(toolRegs).flat().length;

  const resilience = finalState.systems.morale > 0.6 ? 'robust' : finalState.systems.morale > 0.35 ? 'stable' : 'fragile';
  const sustainment = finalState.systems.foodMonthsReserve > 12 ? 'self-sustaining' : finalState.systems.foodMonthsReserve > 6 ? 'resupply-dependent' : 'critical';
  const leadership = leader.hexaco.conscientiousness > 0.7 ? 'methodical' : leader.hexaco.openness > 0.7 ? 'pioneering' : 'balanced';
  const riskProfile = riskyWins + riskyLosses > conservativeWins ? 'exploratory' : 'procedural';
  const science = totalTools > maxTurns * 2 ? 'discovery-driven' : totalTools > maxTurns ? 'productive' : 'operational';
  const summary = `${resilience} · ${sustainment} · ${leadership} · ${riskProfile} · ${science}`;

  return { resilience, sustainment, leadership, riskProfile, science, summary };
}

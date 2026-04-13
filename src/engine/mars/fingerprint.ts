/**
 * Mars-specific timeline fingerprint classification.
 * Extracted from orchestrator.ts lines 820-843.
 */
export function marsFingerprint(
  finalState: any,
  outcomeLog: any[],
  leader: any,
  toolRegs: Record<string, string[]>,
  maxTurns: number,
): Record<string, string> {
  const riskyWins = outcomeLog.filter((o: any) => o.outcome === 'risky_success').length;
  const riskyLosses = outcomeLog.filter((o: any) => o.outcome === 'risky_failure').length;
  const conservativeWins = outcomeLog.filter((o: any) => o.outcome === 'conservative_success').length;
  const aliveCount = finalState.colonists.filter((c: any) => c.health.alive).length;
  const marsBorn = finalState.colonists.filter((c: any) => c.health.alive && c.core.marsborn).length;
  const totalTools = Object.values(toolRegs).flat().length;

  const resilience = finalState.colony.morale > 0.6 ? 'antifragile' : finalState.colony.morale > 0.35 ? 'resilient' : 'brittle';
  const autonomy = finalState.politics.earthDependencyPct < 40 ? 'autonomous' : finalState.politics.earthDependencyPct < 70 ? 'transitioning' : 'Earth-tethered';
  const governance = leader.hexaco.extraversion > 0.7 ? 'charismatic' : leader.hexaco.conscientiousness > 0.7 ? 'technocratic' : 'communal';
  const riskProfile = riskyWins + riskyLosses > conservativeWins ? 'expansionist' : 'conservative';
  const identity = marsBorn > aliveCount * 0.3 ? 'Martian' : 'Earth-diaspora';
  const innovation = totalTools > maxTurns * 2 ? 'innovative' : totalTools > maxTurns ? 'adaptive' : 'conventional';
  const summary = `${resilience} · ${autonomy} · ${governance} · ${riskProfile} · ${identity} · ${innovation}`;

  return { resilience, autonomy, governance, riskProfile, identity, innovation, summary };
}

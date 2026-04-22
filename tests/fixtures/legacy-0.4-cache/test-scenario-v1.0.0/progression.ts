(ctx) => {
  for (const c of ctx.agents) {
    if (!c.health.alive) continue;
    if (ctx.state.colony.foodMonthsReserve < 1) {
      c.health.psychScore = Math.max(0, c.health.psychScore - 0.05);
    }
  }
}

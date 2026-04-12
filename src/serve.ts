/**
 * SSE server for the Mars Genesis dashboard.
 *
 * Runs both simulations (Visionary + Engineer) in parallel and streams
 * turn events to connected browsers via Server-Sent Events.
 *
 * Usage:
 *   OPENAI_API_KEY=... npx tsx src/serve.ts [turns]
 *   Open http://localhost:3456 in browser
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3456', 10);
const maxTurns = process.argv[2] ? parseInt(process.argv[2], 10) : 12;

// SSE clients
const clients: Set<import('node:http').ServerResponse> = new Set();

function broadcast(event: string, data: unknown) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(msg); } catch { clients.delete(res); }
  }
}

// HTTP server
const server = createServer((req, res) => {
  if (req.url === '/events') {
    // SSE endpoint
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('event: connected\ndata: {}\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (req.url === '/about') {
    const html = readFileSync(resolve(__dirname, 'dashboard/about.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  if (req.url === '/' || req.url === '/index.html') {
    const html = readFileSync(resolve(__dirname, 'dashboard/index.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n  Mars Genesis Dashboard: http://localhost:${PORT}`);
  console.log(`  SSE endpoint: http://localhost:${PORT}/events`);
  console.log(`  Turns: ${maxTurns}\n`);
  runSimulations();
});

async function runSimulations() {
  broadcast('status', { phase: 'starting', maxTurns });

  // Import orchestrator
  const { runSimulation } = await import('./agents/orchestrator.js');

  const VISIONARY = {
    name: 'Aria Chen', archetype: 'The Visionary', colony: 'Ares Horizon',
    hexaco: { openness: 0.95, conscientiousness: 0.35, extraversion: 0.85, agreeableness: 0.55, emotionality: 0.3, honestyHumility: 0.65 },
    instructions: 'You are Commander Aria Chen. Bold expansion, calculated risks. Favor higher upside. Respond with JSON.',
  };

  const ENGINEER = {
    name: 'Dietrich Voss', archetype: 'The Engineer', colony: 'Meridian Base',
    hexaco: { openness: 0.25, conscientiousness: 0.97, extraversion: 0.3, agreeableness: 0.45, emotionality: 0.7, honestyHumility: 0.9 },
    instructions: 'You are Commander Dietrich Voss. Engineering discipline, safety margins. Favor lower risk. Respond with JSON.',
  };

  const KEY_PERSONNEL = [
    { name: 'Dr. Yuki Tanaka', department: 'medical' as const, role: 'Chief Medical Officer', specialization: 'Radiation Medicine', age: 38, featured: true },
    { name: 'Erik Lindqvist', department: 'engineering' as const, role: 'Chief Engineer', specialization: 'Structural Engineering', age: 45, featured: true },
    { name: 'Amara Osei', department: 'agriculture' as const, role: 'Head of Agriculture', specialization: 'Hydroponics', age: 34, featured: true },
    { name: 'Dr. Priya Singh', department: 'psychology' as const, role: 'Colony Psychologist', specialization: 'Clinical Psychology', age: 41, featured: true },
    { name: 'Carlos Fernandez', department: 'science' as const, role: 'Chief Scientist', specialization: 'Geology', age: 50, featured: true },
  ];

  const SHARED_SEED = 950;
  const onEvent = (event: any) => broadcast('sim', event);

  // Run BOTH simulations in parallel so turns appear side-by-side
  broadcast('status', { phase: 'parallel', leaders: ['Aria Chen', 'Dietrich Voss'] });

  const visionaryPromise = runSimulation(VISIONARY, KEY_PERSONNEL, { maxTurns, seed: SHARED_SEED, onEvent }).then(
    r => { broadcast('result', { leader: 'visionary', summary: { population: r.finalState?.colony?.population, morale: r.finalState?.colony?.morale, toolsForged: r.totalToolsForged, citations: r.totalCitations } }); },
    err => { broadcast('sim_error', { leader: 'visionary', error: String(err) }); },
  );

  const engineerPromise = runSimulation(ENGINEER, KEY_PERSONNEL, { maxTurns, seed: SHARED_SEED, onEvent }).then(
    r => { broadcast('result', { leader: 'engineer', summary: { population: r.finalState?.colony?.population, morale: r.finalState?.colony?.morale, toolsForged: r.totalToolsForged, citations: r.totalCitations } }); },
    err => { broadcast('sim_error', { leader: 'engineer', error: String(err) }); },
  );

  await Promise.all([visionaryPromise, engineerPromise]);

  broadcast('complete', { timestamp: new Date().toISOString() });
  console.log('\n  Simulations complete. Dashboard still serving at http://localhost:' + PORT);
}

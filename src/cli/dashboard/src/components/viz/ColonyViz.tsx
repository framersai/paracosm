import { useState, useCallback, useEffect, useRef } from 'react';
import type { GameState } from '../../hooks/useGameState';
import { useVizSnapshots } from './useVizSnapshots';
import { ColonyCanvas } from './ColonyCanvas';
import { VizControls } from './VizControls';

interface ColonyVizProps {
  state: GameState;
}

export function ColonyViz({ state }: ColonyVizProps) {
  const { a: snapsA, b: snapsB } = useVizSnapshots(state);
  const maxTurn = Math.max(snapsA.length, snapsB.length);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef<number>(0);

  // Auto-advance to latest turn when new snapshots arrive
  useEffect(() => {
    if (!playing && maxTurn > 0) {
      setCurrentTurn(maxTurn - 1);
    }
  }, [maxTurn, playing]);

  // Playback timer
  useEffect(() => {
    if (!playing) return;
    const interval = 2000 / speed;
    timerRef.current = window.setInterval(() => {
      setCurrentTurn(prev => {
        if (prev >= maxTurn - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, interval);
    return () => clearInterval(timerRef.current);
  }, [playing, speed, maxTurn]);

  const handlePlayPause = useCallback(() => {
    setPlaying(p => {
      if (!p && currentTurn >= maxTurn - 1) {
        setCurrentTurn(0);
      }
      return !p;
    });
  }, [currentTurn, maxTurn]);

  const handleStepBack = useCallback(() => {
    setPlaying(false);
    setCurrentTurn(t => Math.max(0, t - 1));
  }, []);

  const handleStepForward = useCallback(() => {
    setPlaying(false);
    setCurrentTurn(t => Math.min(maxTurn - 1, t + 1));
  }, [maxTurn]);

  const handleTurnChange = useCallback((turn: number) => {
    setPlaying(false);
    setCurrentTurn(turn);
  }, []);

  const snapA = snapsA[currentTurn];
  const snapB = snapsB[currentTurn];
  const year = snapA?.year || snapB?.year || 0;

  const leaderA = state.a.leader;
  const leaderB = state.b.leader;

  if (maxTurn === 0) {
    const hasActivity = state.isRunning || state.a.leader || state.b.leader || state.a.events.length > 0 || state.b.events.length > 0;
    const isWaiting = hasActivity && !state.isComplete;
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        flex: 1, color: 'var(--text-3)', fontSize: 13, gap: 8,
      }}>
        {isWaiting ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--rust)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
              Simulation Running
            </div>
            <div>Waiting for first turn to complete...</div>
            <div style={{ width: 24, height: 24, border: '2px solid var(--border)', borderTop: '2px solid var(--rust)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>
        ) : (
          'Run a simulation to see the colony visualization.'
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, flex: 1, padding: '8px 8px 0', overflow: 'hidden' }}>
        <ColonyCanvas
          snapshots={snapsA}
          currentTurn={currentTurn}
          leaderName={leaderA?.name || 'Leader A'}
          leaderArchetype={leaderA?.archetype || ''}
        />
        <ColonyCanvas
          snapshots={snapsB}
          currentTurn={currentTurn}
          leaderName={leaderB?.name || 'Leader B'}
          leaderArchetype={leaderB?.archetype || ''}
        />
      </div>

      <VizControls
        currentTurn={currentTurn}
        maxTurn={maxTurn}
        year={year}
        playing={playing}
        speed={speed}
        onTurnChange={handleTurnChange}
        onPlayPause={handlePlayPause}
        onStepBack={handleStepBack}
        onStepForward={handleStepForward}
        onSpeedChange={setSpeed}
      />
    </div>
  );
}

import { useCallback } from 'react';
import type { SimEvent } from './useSSE';

function storageKey(scenarioShortName: string, key: string) {
  return `${scenarioShortName}-${key}`;
}

interface GameData {
  config: Record<string, unknown> | null;
  events: SimEvent[];
  results: unknown[];
  startedAt: string;
  completedAt: string | null;
}

export function useGamePersistence(scenarioShortName: string) {
  const save = useCallback((events: SimEvent[], results: unknown[]) => {
    const data: GameData = {
      config: null,
      events,
      results,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${scenarioShortName}-${events.length}events.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [scenarioShortName]);

  const load = useCallback((): Promise<GameData | null> => {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result as string);
            if (!data.events?.length) { resolve(null); return; }
            resolve(data);
          } catch { resolve(null); }
        };
        reader.readAsText(file);
      };
      input.click();
    });
  }, []);

  const cacheEvents = useCallback((events: SimEvent[], results: unknown[]) => {
    try {
      localStorage.setItem(storageKey(scenarioShortName, 'game-data'), JSON.stringify({
        events, results, startedAt: new Date().toISOString(),
      }));
    } catch {}
  }, [scenarioShortName]);

  const restoreFromCache = useCallback((): GameData | null => {
    try {
      if (localStorage.getItem(storageKey(scenarioShortName, 'cleared'))) return null;
      const cached = localStorage.getItem(storageKey(scenarioShortName, 'game-data'));
      if (!cached) return null;
      const data = JSON.parse(cached);
      if (!data.events?.length) return null;
      return data;
    } catch {
      return null;
    }
  }, [scenarioShortName]);

  const clearCache = useCallback(() => {
    localStorage.removeItem(storageKey(scenarioShortName, 'game-data'));
    localStorage.setItem(storageKey(scenarioShortName, 'cleared'), Date.now().toString());
    fetch('/clear', { method: 'POST' }).catch(() => {});
  }, [scenarioShortName]);

  return { save, load, cacheEvents, restoreFromCache, clearCache };
}

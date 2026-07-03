import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  endProgressSession,
  getCurrentProgressSession,
  getProgressQueueNewestFirst,
  getProgressQueueOldestFirst,
  resetProgressStoreForTests,
  setProgressHideCompleted,
  startProgressSession,
  updateProgressSession,
  useProgressStore,
} from './useProgressStore';

describe('useProgressStore', () => {
  beforeEach(() => {
    resetProgressStoreForTests();
    vi.useFakeTimers();
    vi.setSystemTime(1000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts progress sessions and exposes the oldest active session as current', () => {
    const firstId = startProgressSession({ title: 'Scanning for Tests', source: 'Run', value: 20 });
    vi.setSystemTime(1200);
    const secondId = startProgressSession({ title: 'Parsing QML Files', source: 'Run', value: 10 });

    expect(firstId).toBe('progress-session-1');
    expect(secondId).toBe('progress-session-2');
    expect(getCurrentProgressSession()?.title).toBe('Scanning for Tests');
    expect(getProgressQueueOldestFirst().map((session) => session.title)).toEqual([
      'Scanning for Tests',
      'Parsing QML Files',
    ]);
  });

  it('returns hover sessions newest first', () => {
    startProgressSession({ id: 'progress-session-1', title: 'First', source: 'Run' });
    vi.setSystemTime(1500);
    startProgressSession({ id: 'progress-session-2', title: 'Second', source: 'Run' });
    vi.setSystemTime(2000);
    startProgressSession({ id: 'progress-session-3', title: 'Third', source: 'Run' });

    expect(getProgressQueueNewestFirst().map((session) => session.title)).toEqual(['Third', 'Second', 'First']);
  });

  it('uses numeric ids as a stable newest-first tiebreaker', () => {
    startProgressSession({ title: 'First', source: 'Run' });
    startProgressSession({ title: 'Second', source: 'Run' });
    startProgressSession({ title: 'Third', source: 'Run' });

    expect(getProgressQueueNewestFirst().map((session) => session.title)).toEqual(['Third', 'Second', 'First']);
  });

  it('updates progress values and clamps invalid ranges', () => {
    const id = startProgressSession({ title: 'Compile', source: 'Run', value: -5 });

    expect(useProgressStore.getState().sessions[0]?.value).toBe(0);

    updateProgressSession(id, { value: 140, message: 'Almost done' });

    expect(useProgressStore.getState().sessions[0]).toMatchObject({
      message: 'Almost done',
      value: 100,
    });
  });

  it('removes ended sessions immediately and keeps the latest completed summary', () => {
    const firstId = startProgressSession({ title: 'First', source: 'Run', value: 45 });
    vi.setSystemTime(1600);
    const secondId = startProgressSession({ title: 'Second', source: 'Run', value: 20 });

    endProgressSession(firstId);

    expect(useProgressStore.getState().sessions.map((session) => session.id)).toEqual([secondId]);
    expect(getCurrentProgressSession()?.title).toBe('Second');
    expect(useProgressStore.getState().lastCompletedSession).toMatchObject({
      id: firstId,
      title: 'First',
      value: 100,
    });
  });

  it('resets all session state for tests', () => {
    const id = startProgressSession({ title: 'Compile', source: 'Run', value: 70 });
    setProgressHideCompleted(false);
    endProgressSession(id);

    resetProgressStoreForTests();

    expect(useProgressStore.getState()).toMatchObject({
      hideCompleted: true,
      sessions: [],
      lastCompletedSession: null,
      nextSessionIndex: 1,
    });
  });
});

import { describe, expect, it, beforeEach } from 'vitest';
import { RTL_REGRESSION_GROUP_IDS } from './rtlRegressionMockData';
import { resetRtlRegressionStoreForTests, useRtlRegressionStore } from './useRtlRegressionStore';

function getStore() {
  return useRtlRegressionStore.getState();
}

describe('useRtlRegressionStore', () => {
  beforeEach(() => {
    resetRtlRegressionStoreForTests();
  });

  it('starts with all mock groups expanded and no active run', () => {
    expect(getStore().activeRun).toBeNull();
    expect(getStore().expandedGroups).toEqual({
      cpu: true,
      ip: true,
      perf: true,
    });
    expect(Object.keys(getStore().expandedGroups)).toEqual(RTL_REGRESSION_GROUP_IDS);
  });

  it('toggles groups independently', () => {
    getStore().toggleGroup('cpu');

    expect(getStore().expandedGroups.cpu).toBe(false);
    expect(getStore().expandedGroups.ip).toBe(true);
    expect(getStore().expandedGroups.perf).toBe(true);

    getStore().toggleGroup('cpu');

    expect(getStore().expandedGroups.cpu).toBe(true);
  });

  it('starts one test run at a time until the active run stops', () => {
    getStore().startTestRun('cpu-reset-vector', 'simulation');

    expect(getStore().activeRun).toEqual({
      mode: 'simulation',
      scope: 'test',
      testId: 'cpu-reset-vector',
    });

    getStore().startTestRun('cpu-reset-vector', 'debug');

    expect(getStore().activeRun).toEqual({
      mode: 'simulation',
      scope: 'test',
      testId: 'cpu-reset-vector',
    });
  });

  it('starts and stops one group simulation run', () => {
    getStore().startGroupRun('ip');

    expect(getStore().activeRun).toEqual({
      groupId: 'ip',
      mode: 'simulation',
      scope: 'group',
    });

    getStore().startTestRun('cpu-reset-vector', 'simulation');
    expect(getStore().activeRun).toEqual({
      groupId: 'ip',
      mode: 'simulation',
      scope: 'group',
    });

    getStore().stopGroupRun('cpu');
    expect(getStore().activeRun).toEqual({
      groupId: 'ip',
      mode: 'simulation',
      scope: 'group',
    });

    getStore().stopGroupRun('ip');
    expect(getStore().activeRun).toBeNull();
  });

  it('stops the active run only when the requested test matches', () => {
    getStore().startTestRun('cpu-reset-vector', 'simulation');
    getStore().stopTestRun('ip-uart-loopback');

    expect(getStore().activeRun).toEqual({
      mode: 'simulation',
      scope: 'test',
      testId: 'cpu-reset-vector',
    });

    getStore().stopTestRun('cpu-reset-vector');

    expect(getStore().activeRun).toBeNull();
  });

  it('resets all state to defaults', () => {
    getStore().toggleGroup('cpu');
    getStore().startTestRun('ip-uart-loopback', 'debug');

    resetRtlRegressionStoreForTests();

    expect(getStore().activeRun).toBeNull();
    expect(getStore().expandedGroups).toEqual({
      cpu: true,
      ip: true,
      perf: true,
    });
  });
});

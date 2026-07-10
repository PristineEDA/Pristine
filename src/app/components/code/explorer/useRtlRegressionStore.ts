import { create } from 'zustand';
import { RTL_REGRESSION_GROUP_IDS, type RtlRegressionGroupId } from './rtlRegressionMockData';

export type RtlRegressionRunMode = 'simulation' | 'debug';

export interface RtlRegressionTestRun {
  scope: 'test';
  mode: RtlRegressionRunMode;
  testId: string;
}

export interface RtlRegressionGroupRun {
  groupId: RtlRegressionGroupId;
  mode: 'simulation';
  scope: 'group';
}

export interface RtlRegressionAllRun {
  mode: 'simulation';
  scope: 'all';
}

export type RtlRegressionActiveRun = RtlRegressionAllRun | RtlRegressionGroupRun | RtlRegressionTestRun;

interface RtlRegressionState {
  activeRun: RtlRegressionActiveRun | null;
  expandedGroups: Record<RtlRegressionGroupId, boolean>;
}

interface RtlRegressionActions {
  resetRtlRegressionStoreForTests: () => void;
  startAllRun: () => void;
  startGroupRun: (groupId: RtlRegressionGroupId) => void;
  startTestRun: (testId: string, mode: RtlRegressionRunMode) => void;
  stopAllRun: () => void;
  stopGroupRun: (groupId?: RtlRegressionGroupId) => void;
  stopTestRun: (testId?: string) => void;
  toggleGroup: (groupId: RtlRegressionGroupId) => void;
}

export type RtlRegressionStore = RtlRegressionState & RtlRegressionActions;

function createDefaultExpandedGroups(): Record<RtlRegressionGroupId, boolean> {
  return RTL_REGRESSION_GROUP_IDS.reduce<Record<RtlRegressionGroupId, boolean>>((groups, groupId) => {
    groups[groupId] = true;
    return groups;
  }, {} as Record<RtlRegressionGroupId, boolean>);
}

function createDefaultRtlRegressionState(): RtlRegressionState {
  return {
    activeRun: null,
    expandedGroups: createDefaultExpandedGroups(),
  };
}

export const useRtlRegressionStore = create<RtlRegressionStore>((set) => ({
  ...createDefaultRtlRegressionState(),

  resetRtlRegressionStoreForTests: () => {
    set(createDefaultRtlRegressionState());
  },

  startAllRun: () => {
    set((state) => (
      state.activeRun
        ? state
        : { activeRun: { mode: 'simulation', scope: 'all' } }
    ));
  },

  startTestRun: (testId, mode) => {
    set((state) => (
      state.activeRun
        ? state
        : { activeRun: { mode, scope: 'test', testId } }
    ));
  },

  startGroupRun: (groupId) => {
    set((state) => (
      state.activeRun
        ? state
        : { activeRun: { groupId, mode: 'simulation', scope: 'group' } }
    ));
  },

  stopAllRun: () => {
    set((state) => {
      if (!state.activeRun || state.activeRun.scope !== 'all') {
        return state;
      }

      return { activeRun: null };
    });
  },

  stopTestRun: (testId) => {
    set((state) => {
      if (!state.activeRun || state.activeRun.scope !== 'test' || (testId && state.activeRun.testId !== testId)) {
        return state;
      }

      return { activeRun: null };
    });
  },

  stopGroupRun: (groupId) => {
    set((state) => {
      if (!state.activeRun || state.activeRun.scope !== 'group' || (groupId && state.activeRun.groupId !== groupId)) {
        return state;
      }

      return { activeRun: null };
    });
  },

  toggleGroup: (groupId) => {
    set((state) => ({
      expandedGroups: {
        ...state.expandedGroups,
        [groupId]: !state.expandedGroups[groupId],
      },
    }));
  },
}));

export function resetRtlRegressionStoreForTests(): void {
  useRtlRegressionStore.getState().resetRtlRegressionStoreForTests();
}

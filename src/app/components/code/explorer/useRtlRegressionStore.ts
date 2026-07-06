import { create } from 'zustand';
import { RTL_REGRESSION_GROUP_IDS, type RtlRegressionGroupId } from './rtlRegressionMockData';

export type RtlRegressionRunMode = 'simulation' | 'debug';

export interface RtlRegressionActiveRun {
  mode: RtlRegressionRunMode;
  testId: string;
}

interface RtlRegressionState {
  activeRun: RtlRegressionActiveRun | null;
  expandedGroups: Record<RtlRegressionGroupId, boolean>;
}

interface RtlRegressionActions {
  resetRtlRegressionStoreForTests: () => void;
  startTestRun: (testId: string, mode: RtlRegressionRunMode) => void;
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

  startTestRun: (testId, mode) => {
    set({ activeRun: { testId, mode } });
  },

  stopTestRun: (testId) => {
    set((state) => {
      if (!state.activeRun || (testId && state.activeRun.testId !== testId)) {
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

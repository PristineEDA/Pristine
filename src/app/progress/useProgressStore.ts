import { create } from 'zustand';

export interface ProgressSession {
  id: string;
  title: string;
  source: string;
  value: number;
  createdAt: number;
  updatedAt: number;
  message?: string;
}

export interface ProgressSessionInput {
  id?: string;
  message?: string;
  source?: string;
  title: string;
  value?: number;
}

export interface ProgressSessionPatch {
  message?: string;
  source?: string;
  title?: string;
  value?: number;
}

interface ProgressStoreState {
  hideCompleted: boolean;
  sessions: ProgressSession[];
  lastCompletedSession: ProgressSession | null;
  nextSessionIndex: number;
  endProgressSession: (id: string) => void;
  resetForTests: () => void;
  setHideCompleted: (hideCompleted: boolean) => void;
  startProgressSession: (input: ProgressSessionInput) => string;
  updateProgressSession: (id: string, patch: ProgressSessionPatch) => void;
}

function normalizeProgressValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function createProgressSession(input: ProgressSessionInput, id: string, now: number): ProgressSession {
  return {
    id,
    title: input.title.trim() || 'Progress',
    source: input.source?.trim() || 'Pristine',
    value: normalizeProgressValue(input.value),
    createdAt: now,
    updatedAt: now,
    ...(input.message?.trim() ? { message: input.message.trim() } : {}),
  };
}

function compareOldestFirst(left: ProgressSession, right: ProgressSession): number {
  const createdDelta = left.createdAt - right.createdAt;
  if (createdDelta !== 0) {
    return createdDelta;
  }

  return left.id.localeCompare(right.id, undefined, { numeric: true });
}

function compareNewestFirst(left: ProgressSession, right: ProgressSession): number {
  const createdDelta = right.createdAt - left.createdAt;
  if (createdDelta !== 0) {
    return createdDelta;
  }

  return right.id.localeCompare(left.id, undefined, { numeric: true });
}

function sortOldestFirst(sessions: ProgressSession[]): ProgressSession[] {
  return [...sessions].sort(compareOldestFirst);
}

function sortNewestFirst(sessions: ProgressSession[]): ProgressSession[] {
  return [...sessions].sort(compareNewestFirst);
}

export const useProgressStore = create<ProgressStoreState>((set, get) => ({
  hideCompleted: true,
  sessions: [],
  lastCompletedSession: null,
  nextSessionIndex: 1,
  setHideCompleted: (hideCompleted) => set({ hideCompleted }),
  startProgressSession: (input) => {
    const now = Date.now();
    const state = get();
    const id = input.id?.trim() || `progress-session-${state.nextSessionIndex}`;
    const session = createProgressSession(input, id, now);

    set({
      sessions: sortOldestFirst([
        ...state.sessions.filter((entry) => entry.id !== id),
        session,
      ]),
      nextSessionIndex: input.id ? state.nextSessionIndex : state.nextSessionIndex + 1,
    });

    return id;
  },
  updateProgressSession: (id, patch) => {
    const now = Date.now();
    set((state) => ({
      sessions: sortOldestFirst(state.sessions.map((session) => {
        if (session.id !== id) {
          return session;
        }

        return {
          ...session,
          ...(patch.title === undefined ? {} : { title: patch.title.trim() || session.title }),
          ...(patch.source === undefined ? {} : { source: patch.source.trim() || session.source }),
          ...(patch.message === undefined ? {} : patch.message.trim() ? { message: patch.message.trim() } : { message: undefined }),
          ...(patch.value === undefined ? {} : { value: normalizeProgressValue(patch.value) }),
          updatedAt: now,
        };
      })),
    }));
  },
  endProgressSession: (id) => {
    set((state) => {
      const completedSession = state.sessions.find((session) => session.id === id) ?? null;

      return {
        sessions: state.sessions.filter((session) => session.id !== id),
        lastCompletedSession: completedSession ? { ...completedSession, value: 100, updatedAt: Date.now() } : state.lastCompletedSession,
      };
    });
  },
  resetForTests: () => set({
    hideCompleted: true,
    sessions: [],
    lastCompletedSession: null,
    nextSessionIndex: 1,
  }),
}));

export function getProgressQueueOldestFirst(): ProgressSession[] {
  return sortOldestFirst(useProgressStore.getState().sessions);
}

export function getProgressQueueNewestFirst(): ProgressSession[] {
  return sortNewestFirst(useProgressStore.getState().sessions);
}

export function getCurrentProgressSession(): ProgressSession | null {
  return getProgressQueueOldestFirst()[0] ?? null;
}

export function startProgressSession(input: ProgressSessionInput): string {
  return useProgressStore.getState().startProgressSession(input);
}

export function updateProgressSession(id: string, patch: ProgressSessionPatch): void {
  useProgressStore.getState().updateProgressSession(id, patch);
}

export function endProgressSession(id: string): void {
  useProgressStore.getState().endProgressSession(id);
}

export function setProgressHideCompleted(hideCompleted: boolean): void {
  useProgressStore.getState().setHideCompleted(hideCompleted);
}

export function resetProgressStoreForTests(): void {
  useProgressStore.getState().resetForTests();
}

import { create } from 'zustand';
import type { NotificationPublishInput, NotificationRecord } from '../../../types/notification';

interface NotificationStoreState {
  history: NotificationRecord[];
  dismiss: (id: string) => Promise<void>;
  hydrate: (records: NotificationRecord[]) => void;
  publish: (input: NotificationPublishInput) => Promise<NotificationRecord | null>;
  resetForTests: () => void;
}

function sortNotificationHistory(records: NotificationRecord[]): NotificationRecord[] {
  return [...records].sort((left, right) => right.createdAt - left.createdAt);
}

export const useNotificationStore = create<NotificationStoreState>((set) => ({
  history: [],
  dismiss: async (id) => {
    await window.electronAPI?.notifications.dismiss(id);
    set((state) => ({
      history: state.history.filter((record) => record.id !== id),
    }));
  },
  hydrate: (records) => {
    set({ history: sortNotificationHistory(records) });
  },
  publish: async (input) => {
    const record = await window.electronAPI?.notifications.publish(input);
    if (!record) {
      return null;
    }

    set((state) => ({
      history: sortNotificationHistory([record, ...state.history.filter((entry) => entry.id !== record.id)]),
    }));
    return record;
  },
  resetForTests: () => set({ history: [] }),
}));

export function publishNotification(input: NotificationPublishInput): Promise<NotificationRecord | null> {
  return useNotificationStore.getState().publish(input);
}

export function hydrateNotificationHistory(records: NotificationRecord[]): void {
  useNotificationStore.getState().hydrate(records);
}

export function resetNotificationStoreForTests(): void {
  useNotificationStore.getState().resetForTests();
}

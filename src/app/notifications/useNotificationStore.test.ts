import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publishNotification, resetNotificationStoreForTests, useNotificationStore } from './useNotificationStore';

describe('useNotificationStore', () => {
  beforeEach(() => {
    resetNotificationStoreForTests();
    vi.mocked(window.electronAPI!.notifications.publish).mockReset();
    vi.mocked(window.electronAPI!.notifications.dismiss).mockReset();
  });

  it('hydrates notification history in newest-first order', () => {
    useNotificationStore.getState().hydrate([
      { id: 'older', level: 'info', title: 'Older', body: '', createdAt: 10, expiresAt: 20, variant: 'standard' },
      { id: 'newer', level: 'warning', title: 'Newer', body: '', createdAt: 30, expiresAt: 40, variant: 'standard' },
    ]);

    expect(useNotificationStore.getState().history.map((record) => record.id)).toEqual(['newer', 'older']);
  });

  it('publishes through electron API and inserts the record into history', async () => {
    vi.mocked(window.electronAPI!.notifications.publish).mockResolvedValueOnce({
      id: 'notification-1',
      level: 'error',
      title: 'Error notification',
      body: 'Failed',
      createdAt: 100,
      expiresAt: 5100,
      variant: 'standard',
    });

    await publishNotification({ level: 'error', title: 'Error notification', body: 'Failed' });

    expect(window.electronAPI!.notifications.publish).toHaveBeenCalledWith({
      level: 'error',
      title: 'Error notification',
      body: 'Failed',
    });
    expect(useNotificationStore.getState().history).toHaveLength(1);
    expect(useNotificationStore.getState().history[0]?.id).toBe('notification-1');
  });

  it('dismisses through electron API and removes the record locally', async () => {
    useNotificationStore.getState().hydrate([
      { id: 'notification-1', level: 'info', title: 'Info', body: '', createdAt: 1, expiresAt: 2, variant: 'standard' },
    ]);

    await useNotificationStore.getState().dismiss('notification-1');

    expect(window.electronAPI!.notifications.dismiss).toHaveBeenCalledWith('notification-1');
    expect(useNotificationStore.getState().history).toEqual([]);
  });
});

export type NotificationLevel = 'error' | 'info' | 'warning';
export type NotificationVariant = 'actions' | 'standard';
export type NotificationActionLabel = 'Delete' | 'Mark as Read';

export interface NotificationAction {
  label: NotificationActionLabel;
}

export interface NotificationPublishInput {
  actions?: NotificationAction[];
  body?: string;
  level: NotificationLevel;
  title: string;
  variant?: NotificationVariant;
}

export interface NotificationRecord {
  actions?: NotificationAction[];
  body: string;
  createdAt: number;
  expiresAt: number;
  id: string;
  level: NotificationLevel;
  title: string;
  variant: NotificationVariant;
}

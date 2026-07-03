type TerminalApi = NonNullable<typeof window.electronAPI>['terminal'];

export type TerminalProfile = 'default' | 'wsl-pristine-eda';

export interface TerminalSessionSnapshot {
  buffer: string;
  error: string | null;
  isStarting: boolean;
  pid: number | null;
  sessionId: string | null;
  shellLabel: string;
}

const BUFFER_LIMIT = 50000;
const DEFAULT_SESSION_KEY = 'default';

const defaultSnapshot = (): TerminalSessionSnapshot => ({
  buffer: '',
  error: null,
  isStarting: false,
  pid: null,
  sessionId: null,
  shellLabel: 'shell',
});

let unsubscribeData: (() => void) | null = null;
let unsubscribeExit: (() => void) | null = null;
const sessionRecords = new Map<string, TerminalSessionRecord>();
const sessionIdToKey = new Map<string, string>();

interface TerminalSessionRecord {
  snapshot: TerminalSessionSnapshot;
  createPromise: Promise<void> | null;
  listeners: Set<() => void>;
}

function getRecord(sessionKey = DEFAULT_SESSION_KEY) {
  let record = sessionRecords.get(sessionKey);

  if (!record) {
    record = {
      snapshot: defaultSnapshot(),
      createPromise: null,
      listeners: new Set<() => void>(),
    };
    sessionRecords.set(sessionKey, record);
  }

  return record;
}

function notify(record: TerminalSessionRecord) {
  record.listeners.forEach((listener) => listener());
}

function setSnapshot(record: TerminalSessionRecord, next: Partial<TerminalSessionSnapshot>) {
  const previousSessionId = record.snapshot.sessionId;
  record.snapshot = { ...record.snapshot, ...next };

  if (previousSessionId && previousSessionId !== record.snapshot.sessionId) {
    sessionIdToKey.delete(previousSessionId);
  }

  if (record.snapshot.sessionId) {
    sessionIdToKey.set(record.snapshot.sessionId, getSessionKeyForRecord(record));
  }

  notify(record);
}

function getSessionKeyForRecord(targetRecord: TerminalSessionRecord) {
  for (const [sessionKey, record] of sessionRecords.entries()) {
    if (record === targetRecord) {
      return sessionKey;
    }
  }

  return DEFAULT_SESSION_KEY;
}

function appendBuffer(record: TerminalSessionRecord, chunk: string) {
  record.snapshot = {
    ...record.snapshot,
    buffer: `${record.snapshot.buffer}${chunk}`.slice(-BUFFER_LIMIT),
  };
  notify(record);
}

function getTerminalApi(): TerminalApi | null {
  return window.electronAPI?.terminal ?? null;
}

function ensureBridge(api: TerminalApi) {
  if (!unsubscribeData) {
    unsubscribeData = api.onData((payload) => {
      const sessionKey = sessionIdToKey.get(payload.id);

      if (!sessionKey) {
        return;
      }

      appendBuffer(getRecord(sessionKey), payload.data);
    });
  }

  if (!unsubscribeExit) {
    unsubscribeExit = api.onExit((payload) => {
      const sessionKey = sessionIdToKey.get(payload.id);

      if (!sessionKey) {
        return;
      }

      const record = getRecord(sessionKey);
      const exitMessage = `\r\n[${record.snapshot.shellLabel} exited with code ${payload.exitCode}]\r\n`;
      sessionIdToKey.delete(payload.id);
      record.snapshot = {
        ...record.snapshot,
        buffer: `${record.snapshot.buffer}${exitMessage}`.slice(-BUFFER_LIMIT),
        isStarting: false,
        pid: null,
        sessionId: null,
      };
      notify(record);
    });
  }
}

export function getTerminalSessionSnapshot(sessionKey = DEFAULT_SESSION_KEY) {
  return getRecord(sessionKey).snapshot;
}

export function subscribeTerminalSession(listener: () => void): () => void;
export function subscribeTerminalSession(sessionKey: string, listener: () => void): () => void;
export function subscribeTerminalSession(sessionKeyOrListener: string | (() => void), maybeListener?: () => void) {
  const sessionKey = typeof sessionKeyOrListener === 'string' ? sessionKeyOrListener : DEFAULT_SESSION_KEY;
  const listener = typeof sessionKeyOrListener === 'function' ? sessionKeyOrListener : maybeListener;
  const record = getRecord(sessionKey);

  if (!listener) {
    return () => undefined;
  }

  record.listeners.add(listener);
  return () => {
    record.listeners.delete(listener);
  };
}

export async function ensureTerminalSession(options?: { cwd?: string; cols?: number; rows?: number; profile?: TerminalProfile }): Promise<void>;
export async function ensureTerminalSession(sessionKey: string, options?: { cwd?: string; cols?: number; rows?: number; profile?: TerminalProfile }): Promise<void>;
export async function ensureTerminalSession(
  sessionKeyOrOptions?: string | { cwd?: string; cols?: number; rows?: number; profile?: TerminalProfile },
  maybeOptions?: { cwd?: string; cols?: number; rows?: number; profile?: TerminalProfile },
) {
  const sessionKey = typeof sessionKeyOrOptions === 'string' ? sessionKeyOrOptions : DEFAULT_SESSION_KEY;
  const options = typeof sessionKeyOrOptions === 'string' ? maybeOptions : sessionKeyOrOptions;
  const record = getRecord(sessionKey);
  const api = getTerminalApi();

  if (!api) {
    setSnapshot(record, { error: 'Terminal backend is unavailable.', isStarting: false });
    return;
  }

  ensureBridge(api);

  if (record.snapshot.sessionId || record.createPromise) {
    await record.createPromise;
    return;
  }

  setSnapshot(record, { error: null, isStarting: true });

  record.createPromise = api.create(options).then((session) => {
    record.snapshot = {
      ...record.snapshot,
      error: null,
      isStarting: false,
      pid: session.pid,
      sessionId: session.id,
      shellLabel: session.shell,
    };
    sessionIdToKey.set(session.id, sessionKey);
    notify(record);
  }).catch((reason: unknown) => {
    const message = reason instanceof Error ? reason.message : 'Failed to start terminal session.';
    setSnapshot(record, { error: message, isStarting: false });
  }).finally(() => {
    record.createPromise = null;
  });

  await record.createPromise;
}

export async function writeTerminalSession(data: string): Promise<boolean>;
export async function writeTerminalSession(sessionKey: string, data: string): Promise<boolean>;
export async function writeTerminalSession(sessionKeyOrData: string, maybeData?: string) {
  const sessionKey = maybeData === undefined ? DEFAULT_SESSION_KEY : sessionKeyOrData;
  const data = maybeData === undefined ? sessionKeyOrData : maybeData;
  const record = getRecord(sessionKey);
  const api = getTerminalApi();
  if (!api || !record.snapshot.sessionId) {
    return false;
  }

  return api.write(record.snapshot.sessionId, data);
}

export async function resizeTerminalSession(cols: number, rows: number): Promise<boolean>;
export async function resizeTerminalSession(sessionKey: string, cols: number, rows: number): Promise<boolean>;
export async function resizeTerminalSession(sessionKeyOrCols: string | number, maybeCols?: number, maybeRows?: number) {
  const sessionKey = typeof sessionKeyOrCols === 'string' ? sessionKeyOrCols : DEFAULT_SESSION_KEY;
  const cols = typeof sessionKeyOrCols === 'string' ? maybeCols : sessionKeyOrCols;
  const rows = typeof sessionKeyOrCols === 'string' ? maybeRows : maybeCols;
  const record = getRecord(sessionKey);
  const api = getTerminalApi();
  if (!api || !record.snapshot.sessionId || typeof cols !== 'number' || typeof rows !== 'number') {
    return false;
  }

  return api.resize(record.snapshot.sessionId, cols, rows);
}

export async function terminateTerminalSession(sessionKey = DEFAULT_SESSION_KEY) {
  const record = getRecord(sessionKey);
  const api = getTerminalApi();

  if (record.createPromise) {
    await record.createPromise;
  }

  const sessionId = record.snapshot.sessionId;

  if (api && sessionId) {
    await api.kill(sessionId);
    sessionIdToKey.delete(sessionId);
  }

  record.snapshot = defaultSnapshot();
  notify(record);
}

export async function terminateAllTerminalSessions() {
  await Promise.all(Array.from(sessionRecords.keys(), (sessionKey) => terminateTerminalSession(sessionKey)));
}

export function resetTerminalSessionStoreForTests() {
  unsubscribeData?.();
  unsubscribeExit?.();
  unsubscribeData = null;
  unsubscribeExit = null;
  sessionRecords.clear();
  sessionIdToKey.clear();
}

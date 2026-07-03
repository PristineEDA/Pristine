import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LspProblem } from '../../../../lsp/lspProblems';
import { resetNotificationStoreForTests, useNotificationStore } from '../../../../notifications/useNotificationStore';
import { endProgressSession, resetProgressStoreForTests, startProgressSession } from '../../../../progress/useProgressStore';
import { StatusBar } from './StatusBar';

const HOVER_CARD_TEST_OPEN_DELAY_MS = 200;

function useHoverCardFakeTimers() {
  vi.useFakeTimers();
}

async function advanceHoverCardOpenDelay() {
  await act(async () => {
    vi.advanceTimersByTime(HOVER_CARD_TEST_OPEN_DELAY_MS);
  });
}

async function cleanupHoverCardTimers() {
  await act(async () => {
    vi.runOnlyPendingTimers();
  });

  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
}

const mockedGitStatus = {
  branchName: 'feature/git-ui',
  hasProjectFiles: true,
  isGitRepo: true,
  isLoading: false,
  pathStates: {},
};

const mockedProblemsByFile: Record<string, LspProblem[]> = {
  'rtl/tb/tb_cpu_top.sv': [
    {
      id: 'tb-error',
      severity: 'error',
      message: 'Top-level reset is undriven',
      file: 'tb_cpu_top.sv',
      fileId: 'rtl/tb/tb_cpu_top.sv',
      line: 12,
      column: 3,
    },
    {
      id: 'tb-warning',
      severity: 'warning',
      message: 'Potential latch inferred',
      file: 'tb_cpu_top.sv',
      fileId: 'rtl/tb/tb_cpu_top.sv',
      line: 18,
      column: 5,
    },
    {
      id: 'tb-info',
      severity: 'info',
      message: 'This info should not affect the status bar counts',
      file: 'tb_cpu_top.sv',
      fileId: 'rtl/tb/tb_cpu_top.sv',
      line: 22,
      column: 1,
    },
  ],
  'rtl/core/alu.v': [
    {
      id: 'alu-warning',
      severity: 'warning',
      message: 'Unused output',
      file: 'alu.v',
      fileId: 'rtl/core/alu.v',
      line: 9,
      column: 4,
    },
  ],
};

vi.mock('../../../../lsp/lspProblems', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lsp/lspProblems')>();
  return {
    ...actual,
    useLspProblems: (fileId?: string | null) => {
      if (!fileId) {
        return [];
      }

      return mockedProblemsByFile[fileId] ?? [];
    },
  };
});

vi.mock('../../../../git/workspaceGitStatus', () => ({
  useWorkspaceGitStatus: () => mockedGitStatus,
  getWorkspaceGitBranchLabel: (snapshot: typeof mockedGitStatus) => (
    snapshot.hasProjectFiles && snapshot.isGitRepo && snapshot.branchName ? snapshot.branchName : 'git'
  ),
}));

describe('StatusBar', () => {
  beforeEach(() => {
    resetNotificationStoreForTests();
    resetProgressStoreForTests();
    vi.mocked(window.electronAPI!.config.get).mockImplementation((key: string) => {
      if (key === 'progress.hideCompleted') {
        return true;
      }

      return undefined;
    });
    mockedGitStatus.branchName = 'feature/git-ui';
    mockedGitStatus.hasProjectFiles = true;
    mockedGitStatus.isGitRepo = true;
  });

  it('shows branch, diagnostics, cursor state, and inferred language from file paths', () => {
    render(
      <StatusBar activeFileId="rtl/tb/tb_cpu_top.sv" cursorLine={18} cursorCol={4} />,
    );

    expect(screen.getByTestId('status-bar-branch-label')).toHaveTextContent('feature/git-ui');
    expect(screen.getByText('Sync')).toBeInTheDocument();
    expect(screen.getByTestId('status-bar-cursor-icon').compareDocumentPosition(
      screen.getByTestId('status-bar-file-format-icon'),
    )).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByTestId('status-bar-file-format-icon').compareDocumentPosition(
      screen.getByTestId('status-bar-indentation-icon'),
    )).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByTestId('status-bar-indentation-icon').compareDocumentPosition(
      screen.getByTestId('status-bar-language-icon'),
    )).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByTestId('status-bar-cursor-icon')).toBeInTheDocument();
    expect(screen.getByText('18:4')).toBeInTheDocument();
    expect(screen.getByTestId('status-bar-file-format-icon')).toBeInTheDocument();
    expect(screen.getByText('LF:UTF-8')).toBeInTheDocument();
    expect(screen.getByTestId('status-bar-indentation-icon')).toBeInTheDocument();
    expect(screen.getByText('4 spaces')).toBeInTheDocument();
    expect(screen.getByTestId('status-bar-cursor-icon').closest('[data-slot="hover-card-trigger"]')).not.toHaveClass('w-[4.25rem]');
    expect(screen.queryByText('SystemVerilog')).not.toBeInTheDocument();
    expect(screen.getByTestId('status-bar-language-icon')).toHaveAttribute('data-icon-key', 'systemverilog');
    expect(screen.getByText('Verilator 5.024')).toBeInTheDocument();
    expect(screen.getByTestId('status-bar-error-count')).toHaveTextContent('1');
    expect(screen.getByTestId('status-bar-warning-count')).toHaveTextContent('1');
  });

  it('hides the progress widget when no progress is active by default', () => {
    render(
      <StatusBar activeFileId="" cursorLine={1} cursorCol={1} />,
    );

    expect(screen.queryByTestId('status-bar-progress-summary')).not.toBeInTheDocument();
  });

  it('shows the oldest active progress session in the status bar', () => {
    startProgressSession({ id: 'first', title: 'Scanning RTL Sources', source: 'Run', value: 25 });
    startProgressSession({ id: 'second', title: 'Resolving Module Hierarchy', source: 'Run', value: 60 });

    render(
      <StatusBar activeFileId="" cursorLine={1} cursorCol={1} />,
    );

    expect(screen.getByTestId('status-bar-progress-title')).toHaveTextContent('Scanning RTL Sources');
    expect(screen.getByTestId('status-bar-progress-value')).toHaveTextContent('25%');
    expect(screen.getByTestId('status-bar-progress-bar')).toHaveAttribute('aria-label', 'Scanning RTL Sources progress');
  });

  it('shows active progress sessions newest first on hover', async () => {
    useHoverCardFakeTimers();
    vi.setSystemTime(1000);
    startProgressSession({ id: 'first', title: 'Scanning RTL Sources', source: 'Run', value: 25 });
    vi.setSystemTime(2000);
    startProgressSession({ id: 'second', title: 'Resolving Module Hierarchy', source: 'Run', value: 60 });

    try {
      render(
        <StatusBar activeFileId="" cursorLine={1} cursorCol={1} />,
      );

      const progressTrigger = screen.getByTestId('status-bar-progress-summary').closest('[data-slot="hover-card-trigger"]');
      expect(progressTrigger).not.toBeNull();

      fireEvent.pointerEnter(progressTrigger as HTMLElement, { pointerType: 'mouse' });
      await advanceHoverCardOpenDelay();

      expect(screen.getByTestId('status-bar-progress-popover')).toBeInTheDocument();
      expect(screen.getByTestId('status-bar-progress-list')).toHaveClass('overflow-y-auto');
      expect(screen.getByTestId('status-bar-progress-card-title-second').compareDocumentPosition(
        screen.getByTestId('status-bar-progress-card-title-first'),
      )).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(screen.getByTestId('status-bar-progress-card-second')).toBeInTheDocument();
      expect(screen.getByTestId('status-bar-progress-card-first')).toBeInTheDocument();
    } finally {
      await cleanupHoverCardTimers();
    }
  });

  it('removes ended progress sessions and switches to the next active one', () => {
    const firstId = startProgressSession({ id: 'first', title: 'Scanning RTL Sources', source: 'Run', value: 25 });
    startProgressSession({ id: 'second', title: 'Resolving Module Hierarchy', source: 'Run', value: 60 });

    const { rerender } = render(
      <StatusBar activeFileId="" cursorLine={1} cursorCol={1} />,
    );

    endProgressSession(firstId);
    rerender(<StatusBar activeFileId="" cursorLine={1} cursorCol={1} />);

    expect(screen.getByTestId('status-bar-progress-title')).toHaveTextContent('Resolving Module Hierarchy');
    expect(screen.queryByText('Scanning RTL Sources')).not.toBeInTheDocument();
  });

  it('shows the completed progress summary when configured to keep it visible', () => {
    vi.mocked(window.electronAPI!.config.get).mockImplementation((key: string) => {
      if (key === 'progress.hideCompleted') {
        return false;
      }

      return undefined;
    });
    const id = startProgressSession({ id: 'first', title: 'Scanning RTL Sources', source: 'Run', value: 95 });
    endProgressSession(id);

    render(
      <StatusBar activeFileId="" cursorLine={1} cursorCol={1} />,
    );

    expect(screen.getByTestId('status-bar-progress-title')).toHaveTextContent('Done');
    expect(screen.getByTestId('status-bar-progress-value')).toHaveTextContent('100%');
  });

  it('uses the file tree icon mapping for config and script files used in the editor area', () => {
    const { rerender } = render(
      <StatusBar activeFileId="constraints/timing.xdc" cursorLine={1} cursorCol={1} />,
    );

    expect(screen.getByTestId('status-bar-language-icon')).toHaveAttribute('data-icon-key', 'fpga-constraint');

    rerender(<StatusBar activeFileId="scripts/build.tcl" cursorLine={1} cursorCol={1} />);
    expect(screen.getByTestId('status-bar-language-icon')).toHaveAttribute('data-icon-key', 'tcl');

    rerender(<StatusBar activeFileId="scripts/deploy.sh" cursorLine={1} cursorCol={1} />);
    expect(screen.getByTestId('status-bar-language-icon')).toHaveAttribute('data-icon-key', 'console');

    rerender(<StatusBar activeFileId="config/project.json" cursorLine={1} cursorCol={1} />);
    expect(screen.getByTestId('status-bar-language-icon')).toHaveAttribute('data-icon-key', 'json');

    rerender(<StatusBar activeFileId="startup/crt0.s" cursorLine={1} cursorCol={1} />);
    expect(screen.getByTestId('status-bar-language-icon')).toHaveAttribute('data-icon-key', 'assembly');

    rerender(<StatusBar activeFileId="build/Makefile" cursorLine={1} cursorCol={1} />);
    expect(screen.getByTestId('status-bar-language-icon')).toHaveAttribute('data-icon-key', 'makefile');
  });

  it('shows the inferred language label in the file icon hover card description', async () => {
    useHoverCardFakeTimers();

    try {
      render(
        <StatusBar activeFileId="rtl/tb/tb_cpu_top.sv" cursorLine={18} cursorCol={4} />,
      );

      const languageIconTrigger = screen.getByTestId('status-bar-language-icon').closest('[data-slot="hover-card-trigger"]');

      expect(languageIconTrigger).not.toBeNull();

      fireEvent.pointerEnter(languageIconTrigger as HTMLElement, { pointerType: 'mouse' });
      await advanceHoverCardOpenDelay();

      expect(screen.getByText('Language Mode')).toBeInTheDocument();
      expect(screen.getByText('SystemVerilog')).toBeInTheDocument();
    } finally {
      await cleanupHoverCardTimers();
    }
  });

  it('falls back to the generic git label when no project files are open or the workspace is not a git repo', () => {
    mockedGitStatus.branchName = '';
    mockedGitStatus.hasProjectFiles = false;
    mockedGitStatus.isGitRepo = false;

    const { rerender } = render(
      <StatusBar activeFileId="rtl/core/alu.v" cursorLine={9} cursorCol={3} />,
    );

    expect(screen.getByTestId('status-bar-branch-label')).toHaveTextContent('git');

    mockedGitStatus.branchName = 'feature/git-ui';
    mockedGitStatus.hasProjectFiles = true;
    mockedGitStatus.isGitRepo = true;

    rerender(<StatusBar activeFileId="rtl/core/alu.v" cursorLine={9} cursorCol={3} />);

    expect(screen.getByTestId('status-bar-branch-label')).toHaveTextContent('feature/git-ui');
  });

  it('shows diagnostics counts, keeps notifications, and hides editor-only right status items when no file is open', () => {
    render(
      <StatusBar activeFileId="" cursorLine={1} cursorCol={1} />,
    );

    expect(screen.getByTestId('status-bar-error-count')).toHaveTextContent('0');
    expect(screen.getByTestId('status-bar-warning-count')).toHaveTextContent('0');
    expect(screen.getByTestId('status-bar-notifications')).toBeInTheDocument();
    expect(screen.queryByText('Plain Text')).not.toBeInTheDocument();
    expect(screen.queryByText('1:1')).not.toBeInTheDocument();
    expect(screen.queryByText('4 spaces')).not.toBeInTheDocument();
    expect(screen.queryByText('LF:UTF-8')).not.toBeInTheDocument();
    expect(screen.queryByTestId('status-bar-cursor-icon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('status-bar-file-format-icon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('status-bar-indentation-icon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('status-bar-language-icon')).not.toBeInTheDocument();
    expect(screen.queryByText('UTF-8')).not.toBeInTheDocument();
    expect(screen.queryByText('LF')).not.toBeInTheDocument();
  });

  it('shows notification history cards and dismisses individual records', async () => {
    useHoverCardFakeTimers();
    vi.mocked(window.electronAPI!.notifications.dismiss).mockResolvedValue(undefined);
    useNotificationStore.getState().hydrate([
      {
        actions: [{ label: 'Mark as Read' }, { label: 'Delete' }],
        body: 'Timing path warning',
        createdAt: 200,
        expiresAt: 5200,
        id: 'warning-1',
        level: 'warning',
        title: 'Warning notification',
        variant: 'actions',
      },
      {
        body: 'Build info',
        createdAt: 100,
        expiresAt: 5100,
        id: 'info-1',
        level: 'info',
        title: 'Info notification',
        variant: 'standard',
      },
    ]);

    try {
      render(
        <StatusBar activeFileId="" cursorLine={1} cursorCol={1} />,
      );

      const notificationsTrigger = screen.getByTestId('status-bar-notifications').closest('[data-slot="hover-card-trigger"]');
      expect(notificationsTrigger).not.toBeNull();

      fireEvent.pointerEnter(notificationsTrigger as HTMLElement, { pointerType: 'mouse' });
      await advanceHoverCardOpenDelay();

      expect(screen.getByTestId('status-bar-notifications-popover')).toBeInTheDocument();
      expect(screen.getByText('Warning notification')).toBeInTheDocument();
      expect(screen.getByText('Info notification')).toBeInTheDocument();
      expect(screen.getByText('Warning notification').compareDocumentPosition(
        screen.getByText('Info notification'),
      )).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(screen.getByTestId('status-bar-notification-card-warning')).toBeInTheDocument();
      expect(screen.getByTestId('status-bar-notifications-list')).toHaveClass('overflow-y-auto');
      expect(screen.getByTestId('status-bar-notification-actions-warning-1')).toBeInTheDocument();
      expect(screen.getByTestId('status-bar-notification-action-warning-1-mark-as-read')).toHaveTextContent('Mark as Read');
      expect(screen.getByTestId('status-bar-notification-action-warning-1-delete')).toHaveTextContent('Delete');

      fireEvent.click(screen.getByTestId('status-bar-notification-action-warning-1-mark-as-read'));
      expect(window.electronAPI!.notifications.dismiss).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('status-bar-notification-dismiss-warning-1'));

      expect(window.electronAPI!.notifications.dismiss).toHaveBeenCalledWith('warning-1');
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.queryByText('Warning notification')).not.toBeInTheDocument();
    } finally {
      await cleanupHoverCardTimers();
    }
  });

  it('shows an empty notification history state', async () => {
    useHoverCardFakeTimers();

    try {
      render(
        <StatusBar activeFileId="" cursorLine={1} cursorCol={1} />,
      );

      const notificationsTrigger = screen.getByTestId('status-bar-notifications').closest('[data-slot="hover-card-trigger"]');
      expect(notificationsTrigger).not.toBeNull();

      fireEvent.pointerEnter(notificationsTrigger as HTMLElement, { pointerType: 'mouse' });
      await advanceHoverCardOpenDelay();

      expect(screen.getByTestId('status-bar-notifications-empty')).toHaveTextContent('No notifications yet.');
    } finally {
      await cleanupHoverCardTimers();
    }
  });

  it('adds stronger hover highlights, delays hover card open, and closes it immediately on leave', async () => {
    useHoverCardFakeTimers();

    try {
      render(
        <StatusBar
          activeFileId="rtl/tb/tb_cpu_top.sv"
          cursorLine={18}
          cursorCol={4}
          dirtyFileCount={2}
          savingFileCount={1}
          onSaveAll={vi.fn()}
        />,
      );

      const branchTrigger = screen.getByTestId('status-bar-branch-label').closest('[data-slot="hover-card-trigger"]');
      const savingTrigger = screen.getByTestId('status-bar-saving-summary').closest('[data-slot="hover-card-trigger"]');

      expect(branchTrigger).not.toBeNull();
      expect(branchTrigger).toHaveClass('hover:bg-[var(--status-bar-item-hover)]');
      expect(savingTrigger).not.toBeNull();
      expect(savingTrigger).toHaveClass('hover:bg-[var(--status-bar-item-hover)]');

      fireEvent.pointerEnter(branchTrigger as HTMLElement, { pointerType: 'mouse' });

      expect(screen.queryByText('Git Branch')).not.toBeInTheDocument();

      await advanceHoverCardOpenDelay();

      expect(screen.getByText('Git Branch')).toBeInTheDocument();
      expect(screen.getByText('Placeholder details about the current workspace branch.')).toBeInTheDocument();

      fireEvent.pointerLeave(branchTrigger as HTMLElement, { pointerType: 'mouse' });
      await act(async () => {
        vi.runOnlyPendingTimers();
      });
      expect(screen.queryByText('Git Branch')).not.toBeInTheDocument();

      fireEvent.pointerEnter(savingTrigger as HTMLElement, { pointerType: 'mouse' });

      expect(screen.queryByText('Save Progress')).not.toBeInTheDocument();

      await advanceHoverCardOpenDelay();

      expect(screen.getByText('Save Progress')).toBeInTheDocument();
    } finally {
      await cleanupHoverCardTimers();
    }
  });

  it('opens hover details when a status bar item receives keyboard focus', async () => {
    vi.useFakeTimers();

    try {
      render(
        <StatusBar activeFileId="rtl/tb/tb_cpu_top.sv" cursorLine={18} cursorCol={4} />,
      );

      const branchTrigger = screen.getByTestId('status-bar-branch-label').closest('[data-slot="hover-card-trigger"]');

      expect(branchTrigger).not.toBeNull();

      (branchTrigger as HTMLElement).focus();
      await advanceHoverCardOpenDelay();

      expect(screen.getByText('Git Branch')).toBeInTheDocument();
    } finally {
      await cleanupHoverCardTimers();
    }
  });

  it('shows unsaved summaries and exposes Save All and review actions', async () => {
    const user = userEvent.setup();
    const onOpenUnsavedFiles = vi.fn();
    const onSaveAll = vi.fn();

    render(
      <StatusBar
        activeFileId="rtl/core/alu.v"
        cursorLine={9}
        cursorCol={3}
        dirtyFileCount={2}
        failedSaveFileCount={1}
        savingFileCount={0}
        onOpenUnsavedFiles={onOpenUnsavedFiles}
        onSaveAll={onSaveAll}
      />,
    );

    expect(screen.getByTestId('status-bar-unsaved-summary')).toHaveTextContent('2 Unsaved');
    expect(screen.getByTestId('status-bar-save-error-summary')).toHaveTextContent('1 Save Failed');

    await user.click(screen.getByTestId('status-bar-unsaved-summary'));
    await user.click(screen.getByTestId('status-bar-save-error-summary'));
    await user.click(screen.getByTestId('status-bar-save-all'));

    expect(onOpenUnsavedFiles).toHaveBeenCalledTimes(2);
    expect(onSaveAll).toHaveBeenCalledTimes(1);
  });

  it('shows saving progress and disables Save All while files are being saved', async () => {
    const user = userEvent.setup();
    const onSaveAll = vi.fn();

    render(
      <StatusBar
        activeFileId="rtl/core/alu.v"
        cursorLine={9}
        cursorCol={3}
        dirtyFileCount={2}
        savingFileCount={1}
        onSaveAll={onSaveAll}
      />,
    );

    expect(screen.getByTestId('status-bar-unsaved-summary')).toHaveTextContent('2 Unsaved');
    expect(screen.getByTestId('status-bar-saving-summary')).toHaveTextContent('Saving 1');
    expect(screen.getByTestId('status-bar-save-all')).toBeDisabled();

    await user.click(screen.getByTestId('status-bar-save-all'));

    expect(onSaveAll).not.toHaveBeenCalled();
  });
});

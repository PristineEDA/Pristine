import {
  AuiIf,
  ActionBarPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  makeAssistantToolUI,
  useAuiState,
  useAssistantInstructions,
  unstable_useMentionAdapter,
  unstable_useSlashCommandAdapter,
  type ImageMessagePartProps,
  type ReasoningGroupProps,
  type SourceMessagePartProps,
} from '@assistant-ui/react';
import {
  ArrowDown,
  ArrowUpIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileCode2,
  LoaderIcon,
  Pencil,
  Play,
  RotateCcw,
  Shell,
  Sparkles,
  SquareIcon,
  ThumbsUp,
  ThumbsDown,
  Trash2,
} from 'lucide-react';
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type CompositionEvent,
  type KeyboardEvent,
  type PropsWithChildren,
  type ReactNode,
} from 'react';

import { useLazyRef } from '@/hooks/use-lazy-ref';
import { cn } from '@/lib/utils';
import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from '@/app/components/assistant-ui/attachment';
import { ComposerModeSelector } from '@/app/components/assistant-ui/composer-mode-selector';
import { ContextDisplay } from '@/app/components/assistant-ui/context-display';
import { ComposerTriggerPopover } from '@/app/components/assistant-ui/composer-trigger-popover';
import { DirectiveText } from '@/app/components/assistant-ui/directive-text';
import { File } from '@/app/components/assistant-ui/file';
import { Image } from '@/app/components/assistant-ui/image';
import { MarkdownText } from '@/app/components/assistant-ui/markdown-text';
import { ModelSelector } from '@/app/components/assistant-ui/model-selector';
import {
  ComposerQuotePreview,
  QuoteBlock,
  SelectionToolbar,
} from '@/app/components/assistant-ui/quote';
import { Reasoning } from '@/app/components/assistant-ui/reasoning';
import { Sources } from '@/app/components/assistant-ui/sources';
import { ToolFallback } from '@/app/components/assistant-ui/tool-fallback';
import { ToolGroup } from '@/app/components/assistant-ui/tool-group';
import {
  type PendingChangeKind,
  type PendingChangeStatus,
  type PendingFileChange,
  type PendingShellCommand,
  type ShellCommandStatus,
} from '@/app/components/code/explorer/agentApi';
import { useAgentApprovals } from '@/app/components/code/explorer/useAgentApprovals';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { TooltipIconButton } from "@/app/components/assistant-ui/tooltip-icon-button";
import {
  PRISTINE_CONTEXT_WINDOW,
  mockPristineContextUsage,
} from './pristineAssistantContext';
import {
  PRISTINE_DEFAULT_MODEL_ID,
  pristineModelProviders,
} from './pristineAssistantModels';
import {
  mockPristineMentionCategories,
  mockPristineSlashCommands,
} from './pristineAssistantTriggers';

type PristineAssistantThreadProps = {
  agentBaseUrl?: string;
  className?: string;
  isThreadLoading?: boolean;
};

type FileChangeToolArgs = {
  kind?: string;
  path?: string;
  targetPath?: string;
  summary?: string;
};

type FileChangeToolResult = {
  id?: string;
  kind?: string;
  path?: string;
  targetPath?: string;
  summary?: string;
  status?: string;
  unifiedDiff?: string;
};

type ShellCommandToolArgs = {
  command?: string;
  args?: string[];
  cwd?: string;
  summary?: string;
};

type ShellCommandToolResult = {
  id?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  summary?: string;
  status?: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
};

const userMessageSurfaceClassName = 'rounded-md border border-border bg-background px-3 py-2 shadow-xs';
const assistantMessageSurfaceClassName = 'rounded-md px-3 py-2';
const actionButtonClassName = 'inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50';
const composerSelectorTriggerClassName = '!h-7 !gap-1 !px-1.5 !text-[10px] [&>span]:!gap-1 [&>svg]:!size-3';

type TextareaValue = ComponentPropsWithoutRef<'textarea'>['value'];

function toTextareaString(value: TextareaValue | undefined): string {
  if (Array.isArray(value)) {
    return value.join('\n');
  }

  if (value === undefined || value === null) {
    return '';
  }

  return String(value);
}

const PristineComposerTextarea = forwardRef<HTMLTextAreaElement, ComponentPropsWithoutRef<'textarea'>>(
  ({ defaultValue, onChange, onCompositionEnd, onCompositionStart, onKeyDown, value, ...props }, ref) => {
    const [isComposing, setIsComposing] = useState(false);
    const [localValue, setLocalValue] = useState(() => toTextareaString(value ?? defaultValue));
    const lastControlledValueRef = useLazyRef(() => toTextareaString(value));
    const pendingCompositionValueRef = useRef<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const setTextareaRef = useCallback(
      (node: HTMLTextAreaElement | null) => {
        textareaRef.current = node;

        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref],
    );

    useLayoutEffect(() => {
      const textarea = textareaRef.current;

      if (!textarea) {
        return;
      }

      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }, [localValue]);

    useEffect(() => {
      const nextValue = toTextareaString(value);

      if (isComposing) {
        lastControlledValueRef.current = nextValue;
        return;
      }

      if (pendingCompositionValueRef.current !== null) {
        if (nextValue === pendingCompositionValueRef.current) {
          pendingCompositionValueRef.current = null;
        } else if (nextValue === lastControlledValueRef.current) {
          return;
        } else {
          pendingCompositionValueRef.current = null;
        }
      }

      lastControlledValueRef.current = nextValue;
      setLocalValue(nextValue);
    }, [isComposing, value]);

    const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
      setLocalValue(event.currentTarget.value);
      onChange?.(event);
    };

    const handleCompositionStart = (event: CompositionEvent<HTMLTextAreaElement>) => {
      setIsComposing(true);
      onCompositionStart?.(event);
    };

    const handleCompositionEnd = (event: CompositionEvent<HTMLTextAreaElement>) => {
      setIsComposing(false);
      pendingCompositionValueRef.current = event.currentTarget.value;
      setLocalValue(event.currentTarget.value);
      onCompositionEnd?.(event);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const nativeEvent = event.nativeEvent as KeyboardEvent<HTMLTextAreaElement>['nativeEvent'] & {
        isComposing?: boolean;
      };

      if (isComposing || nativeEvent.isComposing) {
        return;
      }

      onKeyDown?.(event);
    };

    return (
      <textarea
        {...props}
        ref={setTextareaRef}
        value={localValue}
        onChange={handleChange}
        onCompositionEnd={handleCompositionEnd}
        onCompositionStart={handleCompositionStart}
        onKeyDown={handleKeyDown}
      />
    );
  },
);

PristineComposerTextarea.displayName = 'PristineComposerTextarea';

const triggerIconMap = {
  context: FileCode2,
  tools: Shell,
  FileCode2,
  Shell,
  Sparkles,
};

function PreviewText({ value }: { value: string }) {
  return (
    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-2 font-mono text-[12px] leading-relaxed text-muted-foreground">
      {value}
    </pre>
  );
}

function ToolPanel({
  children,
  icon,
  status,
  title,
}: PropsWithChildren<{
  icon: ReactNode;
  status: string;
  title: string;
}>) {
  return (
    <div className="my-2 overflow-hidden rounded-md border border-border bg-muted/30 text-[12px] leading-relaxed">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-2 py-1.5 text-muted-foreground">
        {icon}
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{title}</span>
        <span className="rounded-sm border border-border bg-background px-1.5 py-0.5 text-[12px] leading-none uppercase tracking-normal text-muted-foreground">
          {status}
        </span>
      </div>
      <div className="space-y-2 p-2 text-muted-foreground">{children}</div>
    </div>
  );
}

function ToolMetaLine({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-[12px] leading-relaxed text-muted-foreground/70">{label}</span>
      <span className="min-w-0 truncate font-mono text-[12px] leading-relaxed text-foreground">{value}</span>
    </div>
  );
}

function formatToolStatus(status: { type: string }, hasResult: boolean): string {
  if (hasResult) {
    return 'ready';
  }

  return status.type;
}

type AgentApprovalContextValue = ReturnType<typeof useAgentApprovals>;

const AgentApprovalContext = createContext<AgentApprovalContextValue | null>(null);

function AgentApprovalProvider({ agentBaseUrl, children }: PropsWithChildren<{ agentBaseUrl?: string }>) {
  if (!agentBaseUrl) {
    return <>{children}</>;
  }

  return <AgentApprovalProviderInner baseUrl={agentBaseUrl}>{children}</AgentApprovalProviderInner>;
}

function AgentApprovalProviderInner({ baseUrl, children }: PropsWithChildren<{ baseUrl: string }>) {
  const approvals = useAgentApprovals(baseUrl);

  return (
    <AgentApprovalContext.Provider value={approvals}>
      {children}
    </AgentApprovalContext.Provider>
  );
}

function useAgentApprovalContext() {
  return useContext(AgentApprovalContext);
}

type FileChangeApprovalView = {
  id?: string;
  kind?: PendingChangeKind | string;
  path?: string;
  targetPath?: string;
  summary: string;
  status?: PendingChangeStatus | string;
  unifiedDiff?: string;
};

type ShellCommandApprovalView = {
  id?: string;
  command?: string;
  args: string[];
  cwd?: string;
  summary: string;
  status?: ShellCommandStatus | string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
};

function getFileChangeApprovalView(
  args: FileChangeToolArgs,
  result: FileChangeToolResult | undefined,
  changes: PendingFileChange[],
): FileChangeApprovalView {
  const storedChange = result?.id ? changes.find((change) => change.id === result.id) : undefined;

  return {
    id: storedChange?.id ?? result?.id,
    kind: storedChange?.kind ?? result?.kind ?? args.kind,
    path: storedChange?.path ?? result?.path ?? args.path,
    targetPath: storedChange?.targetPath ?? result?.targetPath ?? args.targetPath,
    summary: storedChange?.summary ?? result?.summary ?? args.summary ?? 'File change proposal',
    status: storedChange?.status ?? result?.status,
    unifiedDiff: storedChange?.unifiedDiff ?? result?.unifiedDiff,
  };
}

function getShellCommandApprovalView(
  args: ShellCommandToolArgs,
  result: ShellCommandToolResult | undefined,
  commands: PendingShellCommand[],
): ShellCommandApprovalView {
  const storedCommand = result?.id ? commands.find((command) => command.id === result.id) : undefined;

  return {
    id: storedCommand?.id ?? result?.id,
    command: storedCommand?.command ?? result?.command ?? args.command,
    args: storedCommand?.args ?? result?.args ?? args.args ?? [],
    cwd: storedCommand?.cwd ?? result?.cwd ?? args.cwd,
    summary: storedCommand?.summary ?? result?.summary ?? args.summary ?? 'Shell command proposal',
    status: storedCommand?.status ?? result?.status,
    exitCode: storedCommand?.exitCode ?? result?.exitCode,
    stdout: storedCommand?.stdout ?? result?.stdout,
    stderr: storedCommand?.stderr ?? result?.stderr,
  };
}

function formatApprovalStatus(runtimeStatus: { type: string }, approvalStatus: string | undefined, hasResult: boolean): string {
  return approvalStatus ?? formatToolStatus(runtimeStatus, hasResult);
}

function ApprovalError({ error }: { error?: string | null }) {
  if (!error) {
    return null;
  }

  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[12px] leading-relaxed text-destructive" role="alert">
      {error}
    </div>
  );
}

function ApprovalStatusBadge({ status }: { status?: string }) {
  if (!status) {
    return null;
  }

  return (
    <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[12px] leading-none font-normal text-muted-foreground">
      {status}
    </Badge>
  );
}

function FileChangeApprovalActions({
  approval,
  change,
}: {
  approval: AgentApprovalContextValue | null;
  change: FileChangeApprovalView;
}) {
  const changeId = change.id;

  if (!approval || !changeId || change.status !== 'pending') {
    return null;
  }

  const applyActionId = `change:${changeId}:apply`;
  const discardActionId = `change:${changeId}:discard`;
  const isBusy = approval.busyActionId === applyActionId || approval.busyActionId === discardActionId;

  return (
    <div className="flex justify-end gap-1.5">
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="h-6 text-muted-foreground"
        disabled={isBusy}
        aria-label="Discard file change"
        onClick={() => approval.discardChange(changeId)}
      >
        <Trash2 className="size-3" />
        Discard
      </Button>
      <Button
        type="button"
        size="xs"
        className="h-6"
        disabled={isBusy}
        aria-label="Apply file change"
        onClick={() => approval.applyChange(changeId)}
      >
        <Check className="size-3" />
        Apply
      </Button>
    </div>
  );
}

function ShellCommandApprovalActions({
  approval,
  command,
}: {
  approval: AgentApprovalContextValue | null;
  command: ShellCommandApprovalView;
}) {
  const commandId = command.id;

  if (!approval || !commandId || command.status !== 'pending') {
    return null;
  }

  const runActionId = `command:${commandId}:run`;
  const discardActionId = `command:${commandId}:discard`;
  const isBusy = approval.busyActionId === runActionId || approval.busyActionId === discardActionId;

  return (
    <div className="flex justify-end gap-1.5">
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="h-6 text-muted-foreground"
        disabled={isBusy}
        aria-label="Discard shell command"
        onClick={() => approval.discardCommand(commandId)}
      >
        <Trash2 className="size-3" />
        Discard
      </Button>
      <Button
        type="button"
        size="xs"
        className="h-6"
        disabled={isBusy}
        aria-label="Run shell command"
        onClick={() => approval.runCommand(commandId)}
      >
        <Play className="size-3" />
        Run
      </Button>
    </div>
  );
}

const ProposedFileChangeToolUI = makeAssistantToolUI<FileChangeToolArgs, FileChangeToolResult>({
  toolName: 'propose_file_change',
  render: ({ args, result, status }) => {
    const approval = useAgentApprovalContext();
    const change = getFileChangeApprovalView(args, result, approval?.snapshot.changes ?? []);

    return (
      <ToolPanel
        icon={<FileCode2 className="size-3" />}
        status={formatApprovalStatus(status, change.status, Boolean(result))}
        title={change.summary}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <ApprovalStatusBadge status={change.kind} />
          <ApprovalStatusBadge status={change.status} />
        </div>
        <ToolMetaLine label="path" value={change.path} />
        <ToolMetaLine label="target" value={change.targetPath} />
        {change.unifiedDiff && <PreviewText value={change.unifiedDiff} />}
        <ApprovalError error={change.id ? approval?.snapshot.error : null} />
        <FileChangeApprovalActions approval={approval} change={change} />
      </ToolPanel>
    );
  },
});

const ProposedShellCommandToolUI = makeAssistantToolUI<ShellCommandToolArgs, ShellCommandToolResult>({
  toolName: 'propose_shell_command',
  render: ({ args, result, status }) => {
    const approval = useAgentApprovalContext();
    const command = getShellCommandApprovalView(args, result, approval?.snapshot.commands ?? []);
    const commandLine = [command.command, ...command.args].filter(Boolean).join(' ');

    return (
      <ToolPanel
        icon={<Shell className="size-3" />}
        status={formatApprovalStatus(status, command.status, Boolean(result))}
        title={command.summary}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <ApprovalStatusBadge status={command.status} />
          {command.exitCode !== undefined && command.exitCode !== null && (
            <ApprovalStatusBadge status={`exit ${command.exitCode}`} />
          )}
        </div>
        <ToolMetaLine label="cmd" value={commandLine} />
        <ToolMetaLine label="cwd" value={command.cwd} />
        {command.stdout && <PreviewText value={command.stdout} />}
        {command.stderr && <PreviewText value={command.stderr} />}
        <ApprovalError error={command.id ? approval?.snapshot.error : null} />
        <ShellCommandApprovalActions approval={approval} command={command} />
      </ToolPanel>
    );
  },
});

function PristineAssistantInstructions() {
  useAssistantInstructions('You are embedded in the Pristine IDE right sidebar. Keep responses concise, cite workspace-relative paths when useful, and use buffered file/shell proposal tools for mutations.');
  return null;
}

export function PristineAssistantToolUIs() {
  return (
    <>
      <ProposedFileChangeToolUI />
      <ProposedShellCommandToolUI />
    </>
  );
}

function ThreadWelcome() {
  const suggestions = [
    'Inspect the current RTL project structure',
    'Find likely lint or synthesis issues',
    'Propose a focused test plan',
  ];

  return (
    <ThreadPrimitive.Empty>
      <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="flex size-9 items-center justify-center rounded-md border border-border bg-muted text-primary">
          <Sparkles className="size-4" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Pristine Agent</h3>
          <p className="max-w-56 text-[11px] leading-relaxed text-muted-foreground">
            Workspace-aware coding help with buffered changes and approved shell runs.
          </p>
        </div>
        <div className="flex w-full max-w-64 flex-col gap-1.5">
          {suggestions.map((prompt) => (
            <ThreadPrimitive.Suggestion
              key={prompt}
              prompt={prompt}
              className="min-h-8 rounded-md border border-border bg-background px-2 py-1.5 text-left text-[11px] font-normal text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              {prompt}
            </ThreadPrimitive.Suggestion>
          ))}
        </div>
      </div>
    </ThreadPrimitive.Empty>
  );
}

function ThreadMessagesSkeleton() {
  return (
    <div
      data-testid="assistant-thread-loading-skeleton"
      aria-busy="true"
      aria-label="Loading chat messages"
      className="flex min-h-full flex-col gap-4 px-1 py-2"
    >
      <div className="flex">
        <div className="flex w-full max-w-[88%] flex-col gap-2 rounded-md bg-background px-3 py-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      </div>
      <div className="flex justify-end">
        <div className="flex w-full max-w-[72%] flex-col gap-2 rounded-md border border-border bg-background px-3 py-2">
          <Skeleton className="h-3 w-20 self-end" />
          <Skeleton className="h-3 w-full" />
        </div>
      </div>
      <div className="flex">
        <div className="flex w-full max-w-[82%] flex-col gap-2 rounded-md bg-background px-3 py-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    </div>
  );
}

function MessageBranchPicker({ label }: { label: string }) {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className="ml-auto flex items-center gap-0.5 text-[11px] text-muted-foreground"
      aria-label={label}
    >
      <BranchPickerPrimitive.Previous className={actionButtonClassName} aria-label={`Previous ${label}`}>
        <ChevronLeft className="size-3" />
      </BranchPickerPrimitive.Previous>
      <span className="tabular-nums">
        <BranchPickerPrimitive.Number />
        <span className="px-0.5">/</span>
        <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next className={actionButtonClassName} aria-label={`Next ${label}`}>
        <ChevronRight className="size-3" />
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="group flex justify-end px-1 py-2">
      <div className="relative flex max-w-[88%] items-start">
        <ActionBarPrimitive.Root
          autohide="not-last"
          hideWhenRunning
          className="absolute right-full top-1 mr-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 data-[floating=true]:opacity-100"
          data-testid="user-message-edit-action"
        >
          <ActionBarPrimitive.Edit className={actionButtonClassName} aria-label="Edit message">
            <Pencil className="size-3" />
          </ActionBarPrimitive.Edit>
        </ActionBarPrimitive.Root>
        <div className="flex min-w-0 flex-1 flex-col items-end gap-2">
          <UserMessageAttachments />
          <div className={cn(userMessageSurfaceClassName, 'border-primary/20 bg-primary text-[12px] leading-relaxed text-primary-foreground')}>
            <MessagePrimitive.Quote>
              {(quote) => <QuoteBlock {...quote} />}
            </MessagePrimitive.Quote>
            <MessagePrimitive.Parts components={{ File, Image: PristineMessageImage, Text: DirectiveText }} />
          </div>
          <ActionBarPrimitive.Root
            autohide="not-last"
            hideWhenRunning
            className="absolute right-0 top-full z-10 mt-1 flex min-w-24 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 data-[floating=true]:opacity-100"
            data-testid="user-message-branch-action"
          >
            <MessageBranchPicker label="user message branch" />
          </ActionBarPrimitive.Root>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

function UserEditComposer() {
  return (
    <MessagePrimitive.Root className="flex justify-end px-1 py-2" data-testid="user-edit-composer-root">
      <ComposerPrimitive.Root
        className={cn(
          userMessageSurfaceClassName,
          'flex w-full max-w-[88%] flex-col border-primary/20 bg-primary text-primary-foreground',
        )}
        data-testid="user-edit-composer"
      >
        <ComposerPrimitive.Input asChild autoFocus submitMode="enter">
          <PristineComposerTextarea
            className="max-h-36 min-h-14 w-full resize-none bg-transparent px-3 py-2 text-[12px] leading-relaxed text-primary-foreground outline-none placeholder:text-primary-foreground/70"
            aria-label="Edit message input"
          />
        </ComposerPrimitive.Input>
        <div className="flex min-h-8 items-center justify-end gap-2 border-t border-primary-foreground/20 px-2 py-1">
          <ComposerPrimitive.Cancel asChild>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              Cancel
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button type="button" variant="secondary" size="xs">
              Update
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

function PristineMessageImage({ filename, image }: ImageMessagePartProps) {
  const alt = filename || 'Image content';

  return (
    <Image.Root size="sm" variant="outline">
      <Image.Zoom src={image} alt={alt}>
        <Image.Preview src={image} alt={alt} />
      </Image.Zoom>
      <Image.Filename>{filename}</Image.Filename>
    </Image.Root>
  );
}

function getSourceDisplayTitle(url: string, title?: string) {
  if (title) {
    return title;
  }

  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function PristineMessageSource({ sourceType, title, url }: SourceMessagePartProps) {
  if (sourceType !== 'url' || !url) {
    return null;
  }

  return (
    <Sources.Root href={url} variant="outline">
      <Sources.Icon url={url} />
      <Sources.Title>{getSourceDisplayTitle(url, title)}</Sources.Title>
    </Sources.Root>
  );
}

function PristineReasoningGroup({ children, endIndex, startIndex }: ReasoningGroupProps) {
  const isReasoningStreaming = useAuiState((state) => {
    if (state.message.status?.type !== 'running') {
      return false;
    }

    const lastIndex = state.message.parts.length - 1;
    if (lastIndex < 0) {
      return false;
    }

    const lastType = state.message.parts[lastIndex]?.type;
    if (lastType !== 'reasoning') {
      return false;
    }

    return lastIndex >= startIndex && lastIndex <= endIndex;
  });

  return (
    <Reasoning.Root defaultOpen={isReasoningStreaming} variant="muted">
      <Reasoning.Trigger active={isReasoningStreaming} />
      <Reasoning.Content aria-busy={isReasoningStreaming}>
        <Reasoning.Text>{children}</Reasoning.Text>
      </Reasoning.Content>
    </Reasoning.Root>
  );
}

function MessageError() {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="mt-2 rounded-md border border-destructive bg-destructive/10 p-2 text-[12px] leading-relaxed text-destructive dark:bg-destructive/5 dark:text-red-200">
        <ErrorPrimitive.Message className="line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="group flex px-1 py-2">
      <div className="flex w-full items-start" data-testid="assistant-message-container">
        <div className="relative min-w-0 flex-1">
          <div className={cn(assistantMessageSurfaceClassName, 'text-[12px] leading-relaxed')} data-testid="assistant-message-surface">
            <MessagePrimitive.Parts
              components={{
                File,
                Image: PristineMessageImage,
                Reasoning,
                ReasoningGroup: PristineReasoningGroup,
                Source: PristineMessageSource,
                Text: MarkdownText,
                ToolGroup,
                tools: { Fallback: ToolFallback },
              }}
            />
            <MessageError />
            <AuiIf condition={(s) => s.thread.isRunning && s.message.content.length === 0}>
              <div className="flex items-center gap-2 text-muted-foreground">
                <LoaderIcon className="size-4 animate-spin" />
                <span className="text-[12px]">Thinking...</span>
              </div>
            </AuiIf>
          </div>
          <ActionBarPrimitive.Root
            autohide="not-last"
            hideWhenRunning
            className="absolute left-0 top-full z-10 flex min-w-40 items-center opacity-0 transition-opacity group-hover:opacity-100 data-[floating=true]:opacity-100"
            data-testid="assistant-message-action"
          >
            <ActionBarPrimitive.Reload className={actionButtonClassName} aria-label="Regenerate response">
              <RotateCcw className="size-3" />
            </ActionBarPrimitive.Reload>
            <ActionBarPrimitive.Copy className={actionButtonClassName} aria-label="Copy response">
              <Copy className="size-3" />
            </ActionBarPrimitive.Copy>
            <ActionBarPrimitive.FeedbackPositive className={actionButtonClassName} aria-label="Good response">
              <ThumbsUp className="size-3" />
            </ActionBarPrimitive.FeedbackPositive>
            <ActionBarPrimitive.FeedbackNegative className={actionButtonClassName} aria-label="Bad response">
              <ThumbsDown className="size-3" />
            </ActionBarPrimitive.FeedbackNegative>
            <MessageBranchPicker label="assistant response branch" />
          </ActionBarPrimitive.Root>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

function SystemMessage() {
  return null;
}

function ThreadScrollToBottom() {
  return (
    <ThreadPrimitive.ScrollToBottom
      aria-label="Scroll to latest message"
      data-testid="thread-scroll-to-bottom"
      className="absolute -top-10 right-2 z-10 inline-flex size-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:hidden"
    >
      <ArrowDown className="size-3.5" />
    </ThreadPrimitive.ScrollToBottom>
  );
}

function Composer() {
  const mention = unstable_useMentionAdapter({ categories: mockPristineMentionCategories });
  const slash = unstable_useSlashCommandAdapter({ commands: mockPristineSlashCommands });

  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <ComposerPrimitive.Root className="relative rounded-md border border-border bg-background [--composer-padding:0.25rem] [--composer-radius:0.375rem] focus-within:border-ring focus-within:ring-[1px] focus-within:ring-ring/40">
        <ComposerPrimitive.AttachmentDropzone className="flex min-h-16 w-full flex-col rounded-md outline-none transition-colors data-[dragging=true]:bg-accent/30">
          <ComposerQuotePreview />
          <ComposerAttachments />
          <ComposerPrimitive.Input
            asChild
            autoFocus
            submitMode="enter"
          >
            <PristineComposerTextarea
              className="max-h-36 min-h-16 w-full resize-none bg-transparent px-3 py-2 text-[12px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="Type @ for context, / for commands..."
              aria-label="Message input"
            />
          </ComposerPrimitive.Input>
          <div className="flex min-h-8 items-center justify-between gap-2 border-t border-border/60 px-2 py-1">
            <div className="flex min-w-0 items-center gap-1">
              <div className="flex min-w-0 items-center gap-0.5">
                <ComposerModeSelector
                  defaultValue="agent"
                  variant="ghost"
                  size="sm"
                  className={composerSelectorTriggerClassName}
                />
                <ModelSelector
                  providers={pristineModelProviders}
                  defaultValue={PRISTINE_DEFAULT_MODEL_ID}
                  variant="ghost"
                  size="sm"
                  className={composerSelectorTriggerClassName}
                  contentClassName="min-w-64"
                />
              </div>
              <ContextDisplay.Ring
                modelContextWindow={PRISTINE_CONTEXT_WINDOW}
                usage={mockPristineContextUsage}
                side="top"
                className="size-6 rounded-md hover:bg-muted/10 hover:text-muted-foreground"
              />
            </div>
            <div className="flex items-center gap-1">
              <ComposerAddAttachment />
              <AuiIf condition={(s) => !s.thread.isRunning}>
                <ComposerPrimitive.Send asChild>
                  <TooltipIconButton
                    tooltip="Send message"
                    side="bottom"
                    variant="default"
                    size="icon"
                    className="size-6 rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
                    aria-label="Send message"
                  >
                    <ArrowUpIcon className="size-3" />
                  </TooltipIconButton>
                </ComposerPrimitive.Send>
              </AuiIf>

              <AuiIf condition={(s) => s.thread.isRunning}>
                <ComposerPrimitive.Cancel asChild>
                  <Button
                    type="button"
                    variant="default"
                    size="icon"
                    className="size-6 rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
                    aria-label="Stop generating"
                  >
                    <SquareIcon className="size-3" />
                  </Button>
                </ComposerPrimitive.Cancel>
              </AuiIf>
            </div>
          </div>
        </ComposerPrimitive.AttachmentDropzone>
        <ComposerTriggerPopover
          char="@"
          adapter={mention.adapter}
          directive={mention.directive}
          iconMap={triggerIconMap}
          fallbackIcon={Sparkles}
        />
        <ComposerTriggerPopover
          char="/"
          adapter={slash.adapter}
          action={slash.action}
          iconMap={triggerIconMap}
          fallbackIcon={Sparkles}
        />
      </ComposerPrimitive.Root>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  );
}

export function PristineAssistantThread({ agentBaseUrl, className, isThreadLoading = false }: PristineAssistantThreadProps) {
  return (
    <AgentApprovalProvider agentBaseUrl={agentBaseUrl}>
      <ThreadPrimitive.Root className={cn('relative flex min-h-0 flex-1 flex-col', className)}>
        <PristineAssistantInstructions />
        <PristineAssistantToolUIs />
        <ThreadPrimitive.Viewport className="pristine-assistant-scrollbar flex-1 overflow-y-auto px-2 py-1" autoScroll turnAnchor="bottom">
          {isThreadLoading ? (
            <ThreadMessagesSkeleton />
          ) : (
            <>
              <ThreadWelcome />
              <ThreadPrimitive.Messages
                components={{
                  AssistantMessage,
                  SystemMessage,
                  UserEditComposer,
                  UserMessage,
                }}
              />
            </>
          )}
        </ThreadPrimitive.Viewport>
        <SelectionToolbar />
        <div className="relative shrink-0 p-2">
          <ThreadScrollToBottom />
          <Composer />
        </div>
      </ThreadPrimitive.Root>
    </AgentApprovalProvider>
  );
}

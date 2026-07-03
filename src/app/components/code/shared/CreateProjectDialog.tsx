import { FolderOpen, PackagePlus } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import {
  commandSearchInputClassName,
  commandSearchInputForegroundStyle,
  commandSearchInputWrapperClassName,
} from '../../ui/command';
import { Separator } from '../../ui/separator';
import { cn } from '../../../../lib/utils';
import {
  defaultProjectConfigDraft,
  ProjectConfigForm,
  type ProjectConfigDraft,
} from './ProjectConfigForm';

export {
  projectManagementOptions,
  projectModeOptions,
  projectPadframeOptions,
  projectProcessOptions,
  projectTypeOptions,
} from './ProjectConfigForm';

const projectInputWrapperClassName = cn(
  commandSearchInputWrapperClassName,
  'h-8 rounded-md border border-ide-border bg-ide-tab-bg transition-colors focus-within:border-ide-accent',
);
const projectInputClassName = cn(commandSearchInputClassName, 'h-8 py-0 text-[12px] shadow-none');

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dialogStyle?: CSSProperties;
}

export function CreateProjectDialog({ open, onOpenChange, dialogStyle }: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [configDraft, setConfigDraft] = useState<ProjectConfigDraft>(defaultProjectConfigDraft);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleBrowseProjectPath = async () => {
    const result = await window.electronAPI?.dialog.showOpenProjectDirectoryDialog();
    if (!result || result.canceled || !result.filePath) {
      return;
    }

    setProjectPath(result.filePath);
  };

  const handleCreateProject = async () => {
    const projectApi = window.electronAPI?.project;
    if (!projectApi?.createProject || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await projectApi.createProject({
        name,
        path: projectPath,
        ...configDraft,
      });
      onOpenChange(false);
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create project.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="create-project-dialog"
        className="max-w-[520px] gap-4 border-ide-border bg-ide-bg p-0 text-ide-text shadow-2xl"
        style={dialogStyle}
      >
        <DialogHeader className="gap-2 px-5 pt-5 text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-ide-border bg-ide-tab-bg text-ide-accent">
              <PackagePlus size={17} />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-[15px] font-semibold leading-5 text-ide-text">
                New Project
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-[12px] text-ide-text-muted">
                Configure a Pristine project workspace.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Separator className="bg-ide-border" />

        <div className="grid gap-3 px-5" data-testid="create-project-form">
          <div className="grid gap-1.5">
            <label htmlFor="create-project-name" className="text-[11px] font-medium uppercase tracking-[0.08em] text-ide-text-muted">
              name
            </label>
            <div className={projectInputWrapperClassName} data-testid="create-project-name-wrapper">
              <input
                id="create-project-name"
                type="text"
                data-testid="create-project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Project name"
                className={projectInputClassName}
                style={commandSearchInputForegroundStyle}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="create-project-path" className="text-[11px] font-medium uppercase tracking-[0.08em] text-ide-text-muted">
              path
            </label>
            <div className="flex gap-2">
              <div className={`${projectInputWrapperClassName} min-w-0 flex-1`} data-testid="create-project-path-wrapper">
                <input
                  id="create-project-path"
                  type="text"
                  data-testid="create-project-path"
                  value={projectPath}
                  onChange={(event) => setProjectPath(event.target.value)}
                  placeholder="Select a project directory"
                  className={projectInputClassName}
                  style={commandSearchInputForegroundStyle}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                data-testid="create-project-browse"
                className="h-8 shrink-0 gap-1.5 border-ide-border bg-ide-tab-bg px-3 text-[12px] text-ide-text hover:bg-ide-hover"
                onClick={handleBrowseProjectPath}
              >
                <FolderOpen size={14} />
                Browse
              </Button>
            </div>
          </div>

          <ProjectConfigForm
            draft={configDraft}
            testIdPrefix="create-project"
            onDraftChange={setConfigDraft}
          />
          {errorMessage && (
            <p
              data-testid="create-project-error"
              className="rounded-md border border-ide-error/40 bg-ide-error/10 px-3 py-2 text-[12px] text-ide-error"
            >
              {errorMessage}
            </p>
          )}
        </div>

        <DialogFooter className="border-t border-ide-border bg-ide-bg px-5 py-4">
          <Button
            type="button"
            variant="outline"
            data-testid="create-project-cancel"
            className="h-8 border-ide-border px-3 text-[12px]"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="create-project-submit"
            className="h-8 bg-ide-accent px-3 text-[12px] text-primary-foreground hover:bg-ide-accent/90"
            disabled={isSubmitting}
            onClick={handleCreateProject}
          >
            {isSubmitting ? 'Creating...' : 'Create Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

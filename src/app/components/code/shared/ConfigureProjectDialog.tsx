import { Hammer } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { ProjectState } from '../../../../../types/project';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Separator } from '../../ui/separator';
import { ProjectConfigForm } from './ProjectConfigForm';
import { useProjectConfigureStore } from './useProjectConfigureStore';

interface ConfigureProjectDialogProps {
  currentProject: ProjectState | null;
  dialogStyle?: CSSProperties;
}

export function ConfigureProjectDialog({ currentProject, dialogStyle }: ConfigureProjectDialogProps) {
  const draft = useProjectConfigureStore((state) => state.draft);
  const errorMessage = useProjectConfigureStore((state) => state.errorMessage);
  const isOpen = useProjectConfigureStore((state) => state.isOpen);
  const isSubmitting = useProjectConfigureStore((state) => state.isSubmitting);
  const closeProjectConfigure = useProjectConfigureStore((state) => state.closeProjectConfigure);
  const setDraft = useProjectConfigureStore((state) => state.setDraft);
  const setErrorMessage = useProjectConfigureStore((state) => state.setErrorMessage);
  const setSubmitting = useProjectConfigureStore((state) => state.setSubmitting);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      closeProjectConfigure();
    }
  };

  const handleSave = async () => {
    const projectApi = window.electronAPI?.project;
    if (!currentProject || !projectApi?.updateProjectConfig || isSubmitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await projectApi.updateProjectConfig(draft);
      closeProjectConfigure();
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update project configuration.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="configure-project-dialog"
        className="max-w-[520px] gap-4 border-ide-border bg-ide-bg p-0 text-ide-text shadow-2xl"
        style={dialogStyle}
      >
        <DialogHeader className="gap-2 px-5 pt-5 text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-ide-border bg-ide-tab-bg text-ide-accent">
              <Hammer size={17} />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-[15px] font-semibold leading-5 text-ide-text">
                Configure Project
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-[12px] text-ide-text-muted">
                Update the current project configuration.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Separator className="bg-ide-border" />

        <div className="grid gap-3 px-5" data-testid="configure-project-form">
          <div className="rounded-md border border-ide-border bg-ide-tab-bg px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ide-text-muted">
              project
            </p>
            <p data-testid="configure-project-name" className="mt-1 truncate text-[12px] font-medium text-ide-text">
              {currentProject?.name ?? 'No project'}
            </p>
            <p data-testid="configure-project-root" className="mt-0.5 truncate text-[11px] text-ide-text-muted">
              {currentProject?.rootPath ?? 'Open a project to configure it.'}
            </p>
          </div>

          <ProjectConfigForm
            draft={draft}
            testIdPrefix="configure-project"
            onDraftChange={setDraft}
          />

          {errorMessage && (
            <p
              data-testid="configure-project-error"
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
            data-testid="configure-project-cancel"
            className="h-8 border-ide-border px-3 text-[12px]"
            onClick={closeProjectConfigure}
          >
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="configure-project-submit"
            className="h-8 bg-ide-accent px-3 text-[12px] text-primary-foreground hover:bg-ide-accent/90"
            disabled={!currentProject || isSubmitting}
            onClick={() => {
              void handleSave();
            }}
          >
            {isSubmitting ? 'Saving...' : 'Save Configuration'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

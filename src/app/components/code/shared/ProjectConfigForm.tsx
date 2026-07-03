import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';

export const projectModeOptions = ['rtl2gds', 'rtl'] as const;
export const projectProcessOptions = ['ics55', 'ihp130', 'sky130', 'gf180'] as const;
export const projectTypeOptions = ['retroSoC', 'ysyxSoC', 'Custom'] as const;
export const projectManagementOptions = ['none', 'item1', 'item2'] as const;
export const projectPadframeOptions = ['QFN32', 'QFN64', 'QFN88', 'QFN128'] as const;

export interface ProjectConfigDraft {
  mode: string;
  process: string;
  type: string;
  mgnt: string;
  padframe: string;
}

export const defaultProjectConfigDraft: ProjectConfigDraft = {
  mode: 'rtl2gds',
  process: 'ics55',
  type: 'retroSoC',
  mgnt: 'none',
  padframe: 'QFN32',
};

interface ProjectSelectFieldProps {
  label: string;
  value: string;
  options: readonly string[];
  testId: string;
  onValueChange: (value: string) => void;
}

function ProjectSelectField({ label, value, options, testId, onValueChange }: ProjectSelectFieldProps) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={testId} className="text-[11px] font-medium uppercase tracking-[0.08em] text-ide-text-muted">
        {label}
      </label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger
          id={testId}
          data-testid={testId}
          className="h-8 w-full border-ide-border bg-ide-tab-bg text-[12px] text-ide-text shadow-none"
          size="sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-ide-border bg-ide-bg text-ide-text">
          {options.map((option) => (
            <SelectItem key={option} value={option} className="text-[12px]">
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface ProjectConfigFormProps {
  draft: ProjectConfigDraft;
  testIdPrefix: string;
  onDraftChange: (draft: ProjectConfigDraft) => void;
}

export function ProjectConfigForm({ draft, testIdPrefix, onDraftChange }: ProjectConfigFormProps) {
  const updateDraft = (key: keyof ProjectConfigDraft, value: string) => {
    onDraftChange({
      ...draft,
      [key]: value,
    });
  };

  return (
    <>
      <ProjectSelectField
        label="mode"
        value={draft.mode}
        options={projectModeOptions}
        testId={`${testIdPrefix}-mode`}
        onValueChange={(value) => updateDraft('mode', value)}
      />
      <ProjectSelectField
        label="process"
        value={draft.process}
        options={projectProcessOptions}
        testId={`${testIdPrefix}-process`}
        onValueChange={(value) => updateDraft('process', value)}
      />
      <ProjectSelectField
        label="type"
        value={draft.type}
        options={projectTypeOptions}
        testId={`${testIdPrefix}-type`}
        onValueChange={(value) => updateDraft('type', value)}
      />
      <ProjectSelectField
        label="mgnt"
        value={draft.mgnt}
        options={projectManagementOptions}
        testId={`${testIdPrefix}-mgnt`}
        onValueChange={(value) => updateDraft('mgnt', value)}
      />
      <ProjectSelectField
        label="padframe"
        value={draft.padframe}
        options={projectPadframeOptions}
        testId={`${testIdPrefix}-padframe`}
        onValueChange={(value) => updateDraft('padframe', value)}
      />
    </>
  );
}

import { describe, expect, it } from 'vitest';
import { getEditorLanguage, getEditorLanguageLabel, isPdfWorkspaceFile } from './workspaceFiles';

describe('workspaceFiles language helpers', () => {
  it('routes Makefile and .mk files to the makefile editor language', () => {
    expect(getEditorLanguage('Makefile')).toBe('makefile');
    expect(getEditorLanguage('build/Makefile')).toBe('makefile');
    expect(getEditorLanguage('scripts/common.mk')).toBe('makefile');
  });

  it('routes .s and .S files to the assembly editor language', () => {
    expect(getEditorLanguage('startup/crt0.s')).toBe('assembly');
    expect(getEditorLanguage('startup/boot.S')).toBe('assembly');
  });

  it('routes shell, Tcl, and constraint files to dedicated editor languages', () => {
    expect(getEditorLanguage('scripts/deploy.sh')).toBe('shell');
    expect(getEditorLanguage('scripts/build.tcl')).toBe('tcl');
    expect(getEditorLanguage('linker/memory.ld')).toBe('linker-script');
    expect(getEditorLanguage('linker/memory.lds')).toBe('linker-script');
    expect(getEditorLanguage('sim/files.f')).toBe('filelist');
    expect(getEditorLanguage('sim/files.fl')).toBe('filelist');
    expect(getEditorLanguage('constraints/top.xdc')).toBe('constraints');
    expect(getEditorLanguage('constraints/top.sdc')).toBe('constraints');
  });

  it('returns Assembly as the status-bar label for .s and .S files', () => {
    expect(getEditorLanguageLabel('startup/crt0.s')).toBe('Assembly');
    expect(getEditorLanguageLabel('startup/boot.S')).toBe('Assembly');
  });

  it('returns Makefile as the status-bar label for Makefile and .mk files', () => {
    expect(getEditorLanguageLabel('Makefile')).toBe('Makefile');
    expect(getEditorLanguageLabel('build/Makefile')).toBe('Makefile');
    expect(getEditorLanguageLabel('scripts/common.mk')).toBe('Makefile');
  });

  it('returns specialized labels for shell, Tcl, linker script, file list, XDC, and SDC files', () => {
    expect(getEditorLanguageLabel('scripts/deploy.sh')).toBe('Shell');
    expect(getEditorLanguageLabel('scripts/build.tcl')).toBe('Tcl');
    expect(getEditorLanguageLabel('linker/memory.lds')).toBe('Linker Script');
    expect(getEditorLanguageLabel('sim/files.fl')).toBe('File List');
    expect(getEditorLanguageLabel('constraints/top.xdc')).toBe('XDC');
    expect(getEditorLanguageLabel('constraints/top.sdc')).toBe('SDC');
  });

  it('routes PDF files to the PDF viewer language and label', () => {
    expect(isPdfWorkspaceFile('docs/user-guide.pdf')).toBe(true);
    expect(isPdfWorkspaceFile('docs/user-guide.PDF')).toBe(true);
    expect(isPdfWorkspaceFile('docs/user-guide.pdf.bak')).toBe(false);
    expect(getEditorLanguage('docs/user-guide.pdf')).toBe('pdf');
    expect(getEditorLanguageLabel('docs/user-guide.pdf')).toBe('PDF');
  });
});

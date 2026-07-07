import { describe, expect, it } from 'vitest';
import { WORKSPACE_ROOT_PATH } from '../../../workspace/workspaceFiles';
import { resolveWorkspaceFileIcon, resolveWorkspaceFolderIcon } from './WorkspaceEntryIcon';

describe('resolveWorkspaceFileIcon', () => {
  it('prefers exact filenames and config patterns from Material Icon Theme', () => {
    expect(resolveWorkspaceFileIcon('README.md').key).toBe('readme');
    expect(resolveWorkspaceFileIcon('package.json').key).toBe('nodejs');
    expect(resolveWorkspaceFileIcon('pnpm-lock.yaml').key).toBe('pnpm');
    expect(resolveWorkspaceFileIcon('tsconfig.node.json').key).toBe('tsconfig');
    expect(resolveWorkspaceFileIcon('vite.config.web.ts').key).toBe('vite');
    expect(resolveWorkspaceFileIcon('playwright.config.ts').key).toBe('playwright');
    expect(resolveWorkspaceFileIcon('vitest.config.ts').key).toBe('vitest');
    expect(resolveWorkspaceFileIcon('eslint.config.mjs').key).toBe('eslint');
    expect(resolveWorkspaceFileIcon('wrangler.jsonc').key).toBe('wrangler');
  });

  it('supports exact full-path matches and longest suffix rules from Material Icon Theme', () => {
    expect(resolveWorkspaceFileIcon('.github/labeler.yml').key).toBe('label');
    expect(resolveWorkspaceFileIcon('.devcontainer/devcontainer.json').key).toBe('container');
    expect(resolveWorkspaceFileIcon('src/bashly.yaml').key).toBe('bashly');
    expect(resolveWorkspaceFileIcon('app/routes/user.routing.tsx').key).toBe('routing');
    expect(resolveWorkspaceFileIcon('types/api.d.ts').key).toBe('typescript-def');
    expect(resolveWorkspaceFileIcon('resources/views/welcome.blade.php').key).toBe('laravel');
  });

  it('matches extension-based icons and preserves the generic fallback for uncovered file types', () => {
    expect(resolveWorkspaceFileIcon('crt0.S').key).toBe('assembly');
    expect(resolveWorkspaceFileIcon('component.test.tsx').key).toBe('test-jsx');
    expect(resolveWorkspaceFileIcon('vite-env.d.ts').key).toBe('typescript-def');
    expect(resolveWorkspaceFileIcon('diagram.svg').key).toBe('svg');
    expect(resolveWorkspaceFileIcon('docs/user-guide.pdf').key).toBe('pdf');
    expect(resolveWorkspaceFileIcon('unknown.txt').key).toBe('document');
  });

  it('distinguishes RTL language and header variants by extension', () => {
    expect(resolveWorkspaceFileIcon('rtl/core/cpu_top.v').key).toBe('verilog');
    expect(resolveWorkspaceFileIcon('rtl/include/cpu_defs.vh').key).toBe('verilog-header');
    expect(resolveWorkspaceFileIcon('rtl/bus/axi_if.sv').key).toBe('systemverilog');
    expect(resolveWorkspaceFileIcon('rtl/include/axi_pkg.svh').key).toBe('systemverilog-header');
  });

  it('resolves retroSoC EDA, constraint, documentation, and tool file types', () => {
    const cases = [
      ['Hazard3/doc/hazard3.adoc', 'asciidoc'],
      ['Hazard3/doc/diagrams/debug_topology.drawio', 'drawio'],
      ['Hazard3/example_soc/fpga/fpga_arty_a7.f', 'eda-filelist'],
      ['rtl/filelist/pdk_sky130.fl', 'eda-filelist'],
      ['syn/demo/synth_retrosoc.ys', 'yosys'],
      ['Hazard3/test/sim/common/memmap.ld', 'linker-script'],
      ['crt/lds/xip.lds', 'linker-script'],
      ['sta/opensta/retrosoc.sdc', 'timing-constraint'],
      ['Hazard3/example_soc/synth_vivado/constraints_io.xdc', 'fpga-constraint'],
      ['Hazard3/example_soc/synth/fpga_icebreaker.pcf', 'fpga-constraint'],
      ['Hazard3/example_soc/synth/fpga_ulx3s.lpf', 'fpga-constraint'],
      ['syn/yosys/script/abc.constr', 'fpga-constraint'],
      ['Hazard3/example_soc/arty7-openocd.cfg', 'eda-config'],
      ['rtl/clusterip/archinfo/dv/smoke/xprop.config', 'eda-config'],
      ['Hazard3/test/sim/sw_testcases/amo_smoke.gtkw', 'gtkwave'],
      ['syn/yosys/script/filter_output.awk', 'awk'],
      ['syn/yosys/script/abc-opt.script', 'tool-script'],
      ['crt/ver.tmpl', 'template'],
      ['rtl/clusterip/common/.verible-format', 'verible'],
      ['rtl/clusterip/common/.verible-lint', 'verible'],
      ['rtl/mini/lint.msg', 'log-message'],
      ['Hazard3/test/sim/coremark/dist/barebones/core_portme.mak', 'makefile'],
      ['rtl/mini/mpw/__pycache__/common.cpython-313.pyc', 'python'],
      ['sdf-copy.svs2333', 'temp-file'],
      ['helllo.bad', 'bad-file'],
      ['Hazard3/test/sim/tb_cxxrtl/gdbinit', 'eda-config'],
      ['Hazard3/test/sim/sw_testcases/runtests', 'tool-script'],
    ] as const;

    for (const [fileName, iconKey] of cases) {
      expect(resolveWorkspaceFileIcon(fileName).key).toBe(iconKey);
    }
  });
});

describe('resolveWorkspaceFolderIcon', () => {
  it('resolves exact paths, exact names, token matches, and root folders to the expected Material icons', () => {
    expect(resolveWorkspaceFolderIcon({ name: 'src', path: 'src', isOpen: false }).key).toBe('folder-src');
    expect(resolveWorkspaceFolderIcon({ name: 'src', path: 'src', isOpen: true }).key).toBe('folder-src-open');
    expect(resolveWorkspaceFolderIcon({ name: 'workflows', path: '.github/workflows', isOpen: true }).key).toBe('folder-gh-workflows-open');
    expect(resolveWorkspaceFolderIcon({ name: 'schema', path: 'prisma/schema', isOpen: false }).key).toBe('folder-prisma');
    expect(resolveWorkspaceFolderIcon({ name: 'dist-electron', path: 'dist-electron', isOpen: true }).key).toBe('folder-dist-open');
    expect(resolveWorkspaceFolderIcon({ name: 'test-results', path: 'test-results', isOpen: false }).key).toBe('folder-test');
    expect(resolveWorkspaceFolderIcon({ name: '.git', path: '.git', isOpen: true }).key).toBe('folder-git-open');
    expect(resolveWorkspaceFolderIcon({ name: WORKSPACE_ROOT_PATH, path: WORKSPACE_ROOT_PATH, isOpen: true }).key).toBe('folder-root-open');
    expect(resolveWorkspaceFolderIcon({ name: 'misc', path: 'misc', isOpen: false }).key).toBe('folder-other');
  });
});

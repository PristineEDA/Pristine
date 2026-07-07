import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildNoticeMarkdown } from '../../../scripts/generate-notice';
import { formatAttributionsMarkdown, openSourceAttributionSections } from './attributions';

const directRuntimeDependencyAttributionIds = new Map([
  ['@ai-sdk/react', 'ai-sdk-react'],
  ['@assistant-ui/react', 'assistant-ui-react'],
  ['@assistant-ui/react-ai-sdk', 'assistant-ui-react-ai-sdk'],
  ['@assistant-ui/react-markdown', 'assistant-ui-react-markdown'],
  ['@assistant-ui/react-streamdown', 'assistant-ui-react-streamdown'],
  ['@monaco-editor/react', 'monaco-editor-react'],
  ['@preact/signals-core', 'preact-signals-core'],
  ['@toeverything/theme', 'toeverything-theme'],
  ['@xterm/addon-fit', 'xterm-addon-fit'],
  ['@xterm/xterm', 'xterm'],
  ['@xyflow/react', 'react-flow'],
  ['ai', 'ai-sdk'],
  ['better-sqlite3', 'better-sqlite3'],
  ['class-variance-authority', 'class-variance-authority'],
  ['clsx', 'clsx'],
  ['cmdk', 'cmdk'],
  ['echarts', 'echarts'],
  ['elkjs', 'elkjs'],
  ['ignore', 'ignore'],
  ['jsonc-parser', 'jsonc-parser'],
  ['lit', 'lit'],
  ['liveline', 'liveline'],
  ['lucide-react', 'lucide-react'],
  ['material-icon-theme', 'material-icon-theme'],
  ['mermaid', 'mermaid'],
  ['monaco-editor', 'monaco-editor'],
  ['node-pty', 'node-pty'],
  ['pdfjs-dist', 'pdfjs-dist'],
  ['pixi.js', 'pixi-js'],
  ['radix-ui', 'radix-ui'],
  ['react', 'react'],
  ['react-dom', 'react-dom'],
  ['react-shiki', 'react-shiki'],
  ['remark-gfm', 'remark-gfm'],
  ['rxjs', 'rxjs'],
  ['streamdown', 'streamdown'],
  ['tailwind-merge', 'tailwind-merge'],
  ['three', 'three-js'],
  ['tw-shimmer', 'tw-shimmer'],
  ['vscode-jsonrpc', 'vscode-jsonrpc'],
  ['zustand', 'zustand'],
]);

describe('attributions', () => {
  it('maps bundled SystemVerilog language support to pristine-engine', () => {
    const bundledResourcesSection = openSourceAttributionSections.find((section) => section.id === 'bundled-binaries-and-extra-resources');
    const bundledResourceIds = bundledResourcesSection?.items.map((item) => item.id) ?? [];

    expect(bundledResourcesSection?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'pristine-engine',
          name: 'pristine-engine',
          author: 'PristineEDA',
          license: 'Apache-2.0',
        }),
      ]),
    );
    expect(bundledResourceIds).not.toContain(['slang', 'server'].join('-'));
  });

  it('includes the bundled editor themes in the shared attribution data', () => {
    const bundledEditorThemesSection = openSourceAttributionSections.find((section) => section.id === 'bundled-editor-themes');

    expect(bundledEditorThemesSection?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'editor-theme-dracula',
          name: 'Dracula',
          author: 'Dracula Theme',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-dracula-soft',
          name: 'Dracula Theme Soft',
          author: 'Dracula Theme',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-dracula-at-night',
          name: 'Dracula At Night',
          author: 'Billy Ceskavich',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-om-theme-default-dracula-italic',
          name: 'OM Theme (Default Dracula Italic)',
          author: 'Otávio Miranda',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-pink-cat-boo',
          name: 'Pink Cat Boo',
          author: 'Fiona Fan',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-naruto-dark',
          name: 'NarutoDark',
          author: 'Thomaz',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-macos-modern-dark-ventura-xcode-default',
          name: 'MacOS Modern Dark - Ventura Xcode Default',
          author: 'David B. Waters',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-macos-modern-dark-ventura-xcode-civic',
          name: 'MacOS Modern Dark - Ventura Xcode Civic',
          author: 'David B. Waters',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-macos-modern-dark-ventura-xcode',
          name: 'MacOS Modern Dark - Ventura Xcode',
          author: 'David B. Waters',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-macos-modern-dark-xcode-civic',
          name: 'MacOS Modern Dark - Xcode Civic',
          author: 'David B. Waters',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-macos-modern-dark-xcode-modern',
          name: 'MacOS Modern Dark - Xcode Modern',
          author: 'David B. Waters',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-macos-modern-dark-xcode-default',
          name: 'MacOS Modern Dark - Xcode Default',
          author: 'David B. Waters',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-macos-modern-light-ventura-xcode',
          name: 'MacOS Modern Light - Ventura Xcode',
          author: 'David B. Waters',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-macos-modern-light-ventura-xcode-default',
          name: 'MacOS Modern Light - Ventura Xcode Default',
          author: 'David B. Waters',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-macos-modern-light-ventura-xcode-low-key',
          name: 'MacOS Modern Light - Ventura Xcode Low Key',
          author: 'David B. Waters',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-dobri-next-a00-black',
          name: 'Dobri Next -A00- Black',
          author: 'Sergio Dobri',
          license: 'Apache-2.0',
        }),
        expect.objectContaining({
          id: 'editor-theme-dobri-next-a01-dark',
          name: 'Dobri Next -A01- Dark',
          author: 'Sergio Dobri',
          license: 'Apache-2.0',
        }),
        expect.objectContaining({
          id: 'editor-theme-dobri-next-a03-mirage',
          name: 'Dobri Next -A03- Mirage',
          author: 'Sergio Dobri',
          license: 'Apache-2.0',
        }),
        expect.objectContaining({
          id: 'editor-theme-dobri-next-a04-cobalt',
          name: 'Dobri Next -A04- Cobalt',
          author: 'Sergio Dobri',
          license: 'Apache-2.0',
        }),
        expect.objectContaining({
          id: 'editor-theme-dobri-next-a09-arc-dark',
          name: 'Dobri Next -A09- Arc Dark',
          author: 'Sergio Dobri',
          license: 'Apache-2.0',
        }),
        expect.objectContaining({
          id: 'editor-theme-dobri-next-a10-adapta-nokto',
          name: 'Dobri Next -A10- Adapta Nokto',
          author: 'Sergio Dobri',
          license: 'Apache-2.0',
        }),
        expect.objectContaining({
          id: 'editor-theme-dobri-next-c02-indigo',
          name: 'Dobri Next -C02- Indigo',
          author: 'Sergio Dobri',
          license: 'Apache-2.0',
        }),
        expect.objectContaining({
          id: 'editor-theme-dobri-next-c03-cupcake',
          name: 'Dobri Next -C03- Cupcake',
          author: 'Sergio Dobri',
          license: 'Apache-2.0',
        }),
        expect.objectContaining({
          id: 'editor-theme-dobri-next-c09-eve',
          name: 'Dobri Next -C09- Eve',
          author: 'Sergio Dobri',
          license: 'Apache-2.0',
        }),
        expect.objectContaining({
          id: 'editor-theme-dobri-next-a05-jaguar',
          name: 'Dobri Next -A05- Jaguar',
          author: 'Sergio Dobri',
          license: 'Apache-2.0',
        }),
        expect.objectContaining({
          id: 'editor-theme-dobri-next-a06-amethyst',
          name: 'Dobri Next -A06- Amethyst',
          author: 'Sergio Dobri',
          license: 'Apache-2.0',
        }),
        expect.objectContaining({
          id: 'editor-theme-dobri-next-a07-oxford',
          name: 'Dobri Next -A07- Oxford',
          author: 'Sergio Dobri',
          license: 'Apache-2.0',
        }),
        expect.objectContaining({
          id: 'editor-theme-rainglow-allure',
          name: 'Allure (rainglow)',
          author: 'Dayle Rees',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-rainglow-allure-light',
          name: 'Allure Light (rainglow)',
          author: 'Dayle Rees',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-rainglow-arstotzka',
          name: 'Arstotzka (rainglow)',
          author: 'Dayle Rees',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-rainglow-arstotzka-contrast',
          name: 'Arstotzka Contrast (rainglow)',
          author: 'Dayle Rees',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-rainglow-arstotzka-light',
          name: 'Arstotzka Light (rainglow)',
          author: 'Dayle Rees',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-rainglow-peacock',
          name: 'Peacock (rainglow)',
          author: 'Dayle Rees',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-rainglow-peacock-light',
          name: 'Peacock Light (rainglow)',
          author: 'Dayle Rees',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-github-light-theme',
          name: 'Github Light Theme',
          author: 'Hyzeta',
          license: 'BSD-2-Clause',
        }),
        expect.objectContaining({
          id: 'editor-theme-github-light-theme-gray',
          name: 'Github Light Theme - Gray',
          author: 'Hyzeta',
          license: 'BSD-2-Clause',
        }),
        expect.objectContaining({
          id: 'editor-theme-github-dark',
          name: 'GitHub Dark',
          author: 'GitHub',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-catppuccin-mocha',
          name: 'Catppuccin Mocha',
          author: 'Catppuccin Organization',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-alabaster',
          name: 'Alabaster',
          author: 'Nikita Prokopov',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-synthwave-84',
          name: "Synthwave '84",
          author: 'Robb Owen',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-winter-is-coming-dark-blue',
          name: 'Winter is Coming (Dark Blue)',
          author: 'John Papa',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-monokai-night',
          name: 'Monokai Night',
          author: 'Fabio Spampinato',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-aura-soft-dark',
          name: 'Aura Soft Dark',
          author: 'Dalton Menezes',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-hackr-theme',
          name: 'Hackr.io Theme',
          author: 'Robert Johns',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-palenight-theme',
          name: 'Palenight Theme',
          author: 'Olaolu Olawuyi',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-palenight-operator',
          name: 'Palenight Operator',
          author: 'Olaolu Olawuyi',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-palenight-mild-contrast',
          name: 'Palenight (Mild Contrast)',
          author: 'Olaolu Olawuyi',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-darcula-theme',
          name: 'Darcula Theme',
          author: 'rokoroku',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-darcula-pycharm-dark-gui',
          name: 'Darcula Pycharm with Dark GUI',
          author: 'garytyler',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-darcula-pycharm-light-gui',
          name: 'Darcula Pycharm with Light GUI',
          author: 'garytyler',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-darcula-theme-from-intellij',
          name: 'Darcula Theme from IntelliJ',
          author: 'Minh Tri Nguyen',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-catppuccin-frappe',
          name: 'Catppuccin Frappe',
          author: 'Catppuccin Organization',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-tokyo-night-storm',
          name: 'Tokyo Night Storm',
          author: 'enkia',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-vue-theme',
          name: 'Vue Theme',
          author: 'Mario Rodeghiero',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-rose-pine-moon',
          name: 'Rose Pine Moon',
          author: 'Rose Pine',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-kanagawa',
          name: 'Kanagawa',
          author: 'barklan',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-hopscotch',
          name: 'Hopscotch',
          author: 'Jan T. Sott',
          license: 'CC0-1.0',
        }),
        expect.objectContaining({
          id: 'editor-theme-hopscotch-mono',
          name: 'Hopscotch Mono',
          author: 'Jan T. Sott',
          license: 'CC0-1.0',
        }),
        expect.objectContaining({
          id: 'editor-theme-hopscotch-proofreader',
          name: 'Hopscotch [proofreader]',
          author: 'Jan T. Sott',
          license: 'CC0-1.0',
        }),
        expect.objectContaining({
          id: 'editor-theme-monokai-plusplus',
          name: 'Monokai++',
          author: 'Davide Casella',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-monokai-plusplus-unified',
          name: 'Monokai++ Unified',
          author: 'Davide Casella',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-electron',
          name: 'Electron',
          author: 'Kus Cámara',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-dark-plus-syntax',
          name: 'dark-plus-syntax',
          author: 'dunstontc',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-light-plus-syntax',
          name: 'light-plus-syntax',
          author: 'dunstontc',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-light-plus-syntax-high-contrast',
          name: 'light-plus-syntax (high contrast)',
          author: 'dunstontc',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-gruvbox-material-dark',
          name: 'Gruvbox Material Dark',
          author: 'sainnhe',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-gruvbox-material-light',
          name: 'Gruvbox Material Light',
          author: 'sainnhe',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-atom-material-theme',
          name: 'Atom Material Theme',
          author: 'tobiasalthoff',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-moonlight',
          name: 'Moonlight',
          author: 'atomiks',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-monokai-dark-soda',
          name: 'Monokai Dark Soda',
          author: 'Adam Caviness',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-mayukai-dark',
          name: 'Mayukai Dark',
          author: 'Gulajava Ministudio',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-mayukai-mirage-gruvbox-darktooth',
          name: 'Mayukai Mirage Gruvbox Darktooth',
          author: 'Gulajava Ministudio',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-mayukai-midnight',
          name: 'Mayukai Midnight',
          author: 'Gulajava Ministudio',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-deepdark-material-theme',
          name: 'Deepdark Material Theme',
          author: 'Nimda',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-deepdark-material-theme-full-black',
          name: 'Deepdark Material Theme | Full Black Version',
          author: 'Nimda',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-hack-the-box',
          name: 'Hack The Box',
          author: 'silofy',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-hack-the-box-lite',
          name: 'Hack The Box-Lite',
          author: 'silofy',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-github-dark-dimmed',
          name: 'GitHub Dark Dimmed',
          author: 'GitHub',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-winter-is-coming-dark-black',
          name: 'Winter is Coming (Dark Black)',
          author: 'John Papa',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-copilot-theme',
          name: 'Copilot Theme',
          author: 'Benjamin Benais',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-tokyo-night-light',
          name: 'Tokyo Night Light',
          author: 'enkia',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-vue-theme-high-contrast',
          name: 'Vue Theme High Contrast',
          author: 'Mario Rodeghiero',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-github-dark-default',
          name: 'GitHub Dark Default',
          author: 'GitHub',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-github-light-default',
          name: 'GitHub Light Default',
          author: 'GitHub',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-github-light-high-contrast',
          name: 'GitHub Light High Contrast',
          author: 'GitHub',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-github-dark-high-contrast',
          name: 'GitHub Dark High Contrast',
          author: 'GitHub',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-github-light-colorblind',
          name: 'GitHub Light Colorblind',
          author: 'GitHub',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-github-dark-colorblind',
          name: 'GitHub Dark Colorblind',
          author: 'GitHub',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-visual-studio-dark-cpp',
          name: 'Dark (Visual Studio - C/C++)',
          author: 'Microsoft',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-visual-studio-2017-light-cpp',
          name: '2017 Light (Visual Studio - C/C++)',
          author: 'Microsoft',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-powershell-ise',
          name: 'PowerShell ISE',
          author: 'Microsoft',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-jellyfish',
          name: 'JellyFish',
          author: 'Pawel Borkar',
          license: 'Apache-2.0',
        }),
        expect.objectContaining({
          id: 'editor-theme-spinel',
          name: 'Spinel',
          author: 'Shopify',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-spinel-light',
          name: 'Spinel Light',
          author: 'Shopify',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-visual-studio-2017-dark-cpp',
          name: '2017 Dark (Visual Studio - C/C++)',
          author: 'Microsoft',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-visual-studio-light-cpp',
          name: 'Light (Visual Studio - C/C++)',
          author: 'Microsoft',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-copilot-theme-higher-contrast',
          name: 'Copilot Theme - Higher Contrast',
          author: 'Benjamin Benais',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-one-dark-pro-flat',
          name: 'One Dark Pro Flat',
          author: 'Binaryify',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-one-dark-pro-darker',
          name: 'One Dark Pro Darker',
          author: 'Binaryify',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-one-dark-pro-mix',
          name: 'One Dark Pro Mix',
          author: 'Binaryify',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-one-dark-pro-night-flat',
          name: 'One Dark Pro Night Flat',
          author: 'Binaryify',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-theme',
          name: 'Theme',
          author: 'Mhammed Talhaouy',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-theme-flat',
          name: 'Theme Flat',
          author: 'Mhammed Talhaouy',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-theme-mix',
          name: 'Theme Mix',
          author: 'Mhammed Talhaouy',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-theme-darker',
          name: 'Theme Darker',
          author: 'Mhammed Talhaouy',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-gruvbox-dark-medium',
          name: 'Gruvbox Dark Medium',
          author: 'jdinhify',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-gruvbox-dark-soft',
          name: 'Gruvbox Dark Soft',
          author: 'jdinhify',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-gruvbox-light-medium',
          name: 'Gruvbox Light Medium',
          author: 'jdinhify',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-gruvbox-light-soft',
          name: 'Gruvbox Light Soft',
          author: 'jdinhify',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-ayu-mirage-bordered',
          name: 'Ayu Mirage Bordered',
          author: 'teabyii',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-ayu-light-bordered',
          name: 'Ayu Light Bordered',
          author: 'teabyii',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-ayu-dark-bordered',
          name: 'Ayu Dark Bordered',
          author: 'teabyii',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-noctis-azureus',
          name: 'Noctis Azureus',
          author: 'Liviu Schera',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-noctis-bordo',
          name: 'Noctis Bordo',
          author: 'Liviu Schera',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-noctis-obscuro',
          name: 'Noctis Obscuro',
          author: 'Liviu Schera',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-noctis-sereno',
          name: 'Noctis Sereno',
          author: 'Liviu Schera',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-noctis-uva',
          name: 'Noctis Uva',
          author: 'Liviu Schera',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-noctis-minimus',
          name: 'Noctis Minimus',
          author: 'Liviu Schera',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-noctis-hibernus',
          name: 'Noctis Hibernus',
          author: 'Liviu Schera',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-noctis-lilac',
          name: 'Noctis Lilac',
          author: 'Liviu Schera',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-andromeda-bordered',
          name: 'Andromeda Bordered',
          author: 'Eliver Lara',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-andromeda-colorizer',
          name: 'Andromeda Colorizer',
          author: 'Eliver Lara',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-light-owl',
          name: 'Light Owl',
          author: 'Sarah Drasner',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-atom-one-light',
          name: 'Atom One Light',
          author: 'akamud',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-slack-dark-mode',
          name: 'Slack Theme Dark Mode',
          author: 'Felipe Mendes',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-slack-aubergine',
          name: 'Slack Theme Aubergine',
          author: 'Felipe Mendes',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-slack-aubergine-dark',
          name: 'Slack Theme Aubergine (Dark Base)',
          author: 'Felipe Mendes',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-slack-aubergine-dark-editor',
          name: 'Slack Theme Aubergine Dark',
          author: 'Felipe Mendes',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-slack-monument',
          name: 'Slack Theme Monument',
          author: 'Felipe Mendes',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-slack-hoth',
          name: 'Slack Theme Hoth',
          author: 'Felipe Mendes',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-slack-choco-mint',
          name: 'Slack Theme Choco Mint',
          author: 'Felipe Mendes',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-slack-ochin',
          name: 'Slack Theme Ochin',
          author: 'Felipe Mendes',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-slack-protanopia-deuteranopia',
          name: 'Slack Theme Protanopia & Deuteranopia',
          author: 'Felipe Mendes',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-slack-work-hard',
          name: 'Slack Theme Work Hard',
          author: 'Felipe Mendes',
          license: 'MIT',
        }),
        expect.objectContaining({
          id: 'editor-theme-slack-tritanopia',
          name: 'Slack Theme Tritanopia',
          author: 'Felipe Mendes',
          license: 'MIT',
        }),
      ]),
    );
  });

  it('keeps ATTRIBUTIONS.md in sync with the shared attribution data', () => {
    const expectedMarkdown = formatAttributionsMarkdown();
    const actualMarkdown = fs.readFileSync(path.resolve(process.cwd(), 'ATTRIBUTIONS.md'), 'utf8').replace(/\r\n/g, '\n');

    expect(actualMarkdown).toBe(expectedMarkdown);
  });

  it('keeps NOTICE in sync with the shared attribution data', () => {
    const expectedMarkdown = buildNoticeMarkdown();
    const actualMarkdown = fs.readFileSync(path.resolve(process.cwd(), 'NOTICE'), 'utf8').replace(/\r\n/g, '\n');

    expect(actualMarkdown).toBe(expectedMarkdown);
  });

  it('includes full-text license and font notice sections in NOTICE', () => {
    const noticeMarkdown = buildNoticeMarkdown();

    expect(noticeMarkdown).toContain('### Apache License 2.0');
    expect(noticeMarkdown).toContain('### BSD 3-Clause License');
    expect(noticeMarkdown).toContain('### Mozilla Public License 2.0');
    expect(noticeMarkdown).toContain('### SIL Open Font License 1.1');
    expect(noticeMarkdown).toContain('### Ubuntu Font Licence 1.0');
    expect(noticeMarkdown).toContain('### Bitstream Vera / Arev / Public Domain Notices');
    expect(noticeMarkdown).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(noticeMarkdown).toContain('UBUNTU FONT LICENCE Version 1.0');
    expect(noticeMarkdown).toContain('Bitstream Vera Fonts Copyright');
    expect(noticeMarkdown).toContain('Mozilla Public License Version 2.0');
  });

  it('covers every direct runtime dependency with an explicit attribution mapping', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const packageDependencies = Object.keys(manifest.dependencies ?? {}).sort();
    const mappedDependencies = [...directRuntimeDependencyAttributionIds.keys()].sort();
    const attributionIds = new Set(openSourceAttributionSections.flatMap((section) => section.items.map((item) => item.id)));
    const missingAttributionEntries = [...directRuntimeDependencyAttributionIds.entries()]
      .filter(([, attributionId]) => !attributionIds.has(attributionId))
      .map(([dependencyName, attributionId]) => `${dependencyName} -> ${attributionId}`);

    expect(mappedDependencies).toEqual(packageDependencies);
    expect(missingAttributionEntries).toEqual([]);
  });
});

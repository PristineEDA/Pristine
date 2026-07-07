import { editorThemeOptions } from '../editor/editorSettings';

export type AttributionItem = {
  id: string;
  name: string;
  url: string;
  author: string;
  license: string;
};

export type AttributionSection = {
  id: string;
  title: string;
  items: AttributionItem[];
};

export const ATTRIBUTIONS_DOCUMENT_TITLE = 'Open Source Attributions';
export const ATTRIBUTIONS_DOCUMENT_DESCRIPTION =
  'Pristine includes the following runtime open-source frameworks and packaged resources. Packaged desktop builds also ship bundled copies of LICENSE, ATTRIBUTIONS.md, and NOTICE under resources/licenses.';

const bundledEditorThemeItems: AttributionItem[] = editorThemeOptions.map((option) => ({
  id: `editor-theme-${option.value}`,
  name: option.label,
  url: option.sourceUrl,
  author: option.author,
  license: option.license,
}));

export const openSourceAttributionSections: AttributionSection[] = [
  {
    id: 'desktop-runtime-and-editors',
    title: 'Desktop Runtime & Editors',
    items: [
      {
        id: 'electron',
        name: 'Electron',
        url: 'https://github.com/electron/electron',
        author: 'Electron Community',
        license: 'MIT',
      },
      {
        id: 'react',
        name: 'React',
        url: 'https://github.com/facebook/react',
        author: 'Meta',
        license: 'MIT',
      },
      {
        id: 'react-dom',
        name: 'React DOM',
        url: 'https://github.com/facebook/react',
        author: 'Meta',
        license: 'MIT',
      },
      {
        id: 'monaco-editor',
        name: 'Monaco Editor',
        url: 'https://github.com/microsoft/monaco-editor',
        author: 'Microsoft',
        license: 'MIT',
      },
      {
        id: 'monaco-editor-react',
        name: '@monaco-editor/react',
        url: 'https://github.com/suren-atoyan/monaco-react',
        author: 'Suren Atoyan',
        license: 'MIT',
      },
      {
        id: 'pdfjs-dist',
        name: 'PDF.js',
        url: 'https://github.com/mozilla/pdf.js',
        author: 'Mozilla',
        license: 'Apache-2.0',
      },
      {
        id: 'blocksuite-affine',
        name: '@blocksuite/affine',
        url: 'https://github.com/toeverything/AFFiNE/tree/v0.26.3/blocksuite',
        author: 'TOEVERYTHING',
        license: 'MIT',
      },
      {
        id: 'xterm',
        name: 'xterm.js',
        url: 'https://github.com/xtermjs/xterm.js',
        author: 'xterm.js',
        license: 'MIT',
      },
      {
        id: 'xterm-addon-fit',
        name: 'xterm-addon-fit',
        url: 'https://github.com/xtermjs/xterm.js/tree/master/addons/addon-fit',
        author: 'xterm.js',
        license: 'MIT',
      },
    ],
  },
  {
    id: 'bundled-editor-themes',
    title: 'Bundled Editor Themes',
    items: bundledEditorThemeItems,
  },
  {
    id: 'ui-components-and-styling',
    title: 'UI Components & Styling',
    items: [
      {
        id: 'shadcn-ui',
        name: 'shadcn/ui',
        url: 'https://github.com/shadcn-ui/ui',
        author: 'shadcn',
        license: 'MIT',
      },
      {
        id: 'radix-ui',
        name: 'Radix UI',
        url: 'https://github.com/radix-ui/primitives',
        author: 'Radix UI',
        license: 'MIT',
      },
      {
        id: 'tailwind-css',
        name: 'Tailwind CSS',
        url: 'https://github.com/tailwindlabs/tailwindcss',
        author: 'Tailwind Labs',
        license: 'MIT',
      },
      {
        id: 'react-flow',
        name: 'React Flow',
        url: 'https://github.com/xyflow/xyflow',
        author: 'xyflow',
        license: 'MIT',
      },
      {
        id: 'lucide-react',
        name: 'Lucide React',
        url: 'https://github.com/lucide-icons/lucide',
        author: 'Lucide',
        license: 'ISC',
      },
      {
        id: 'material-icon-theme',
        name: 'Material Icon Theme',
        url: 'https://github.com/material-extensions/vscode-material-icon-theme',
        author: 'Material Extensions',
        license: 'MIT',
      },
      {
        id: 'cmdk',
        name: 'cmdk',
        url: 'https://github.com/pacocoursey/cmdk',
        author: 'Paco Coursey',
        license: 'MIT',
      },
      {
        id: 'class-variance-authority',
        name: 'class-variance-authority',
        url: 'https://github.com/joe-bell/cva',
        author: 'Joe Bell',
        license: 'Apache-2.0',
      },
      {
        id: 'clsx',
        name: 'clsx',
        url: 'https://github.com/lukeed/clsx',
        author: 'Luke Edwards',
        license: 'MIT',
      },
      {
        id: 'tailwind-merge',
        name: 'tailwind-merge',
        url: 'https://github.com/dcastil/tailwind-merge',
        author: 'dcastil',
        license: 'MIT',
      },
      {
        id: 'lit',
        name: 'Lit',
        url: 'https://github.com/lit/lit',
        author: 'Google LLC',
        license: 'BSD-3-Clause',
      },
      {
        id: 'toeverything-theme',
        name: '@toeverything/theme',
        url: 'https://github.com/toeverything/design',
        author: 'TOEVERYTHING',
        license: 'MPL-2.0',
      },
    ],
  },
  {
    id: 'runtime-services-and-utilities',
    title: 'Runtime Services & Utilities',
    items: [
      {
        id: 'node-pty',
        name: 'node-pty',
        url: 'https://github.com/microsoft/node-pty',
        author: 'Microsoft',
        license: 'MIT',
      },
      {
        id: 'better-sqlite3',
        name: 'better-sqlite3',
        url: 'https://github.com/WiseLibs/better-sqlite3',
        author: 'WiseLibs',
        license: 'MIT',
      },
      {
        id: 'vscode-jsonrpc',
        name: 'vscode-jsonrpc',
        url: 'https://github.com/microsoft/vscode-languageserver-node',
        author: 'Microsoft',
        license: 'MIT',
      },
      {
        id: 'ignore',
        name: 'ignore',
        url: 'https://github.com/kaelzhang/node-ignore',
        author: 'kaelzhang',
        license: 'MIT',
      },
      {
        id: 'jsonc-parser',
        name: 'jsonc-parser',
        url: 'https://github.com/microsoft/node-jsonc-parser',
        author: 'Microsoft',
        license: 'MIT',
      },
      {
        id: 'preact-signals-core',
        name: '@preact/signals-core',
        url: 'https://github.com/preactjs/signals',
        author: 'Preact',
        license: 'MIT',
      },
      {
        id: 'rxjs',
        name: 'RxJS',
        url: 'https://github.com/ReactiveX/rxjs',
        author: 'ReactiveX',
        license: 'Apache-2.0',
      },
    ],
  },
  {
    id: 'ai-agent-frameworks',
    title: 'AI Agent Frameworks',
    items: [
      {
        id: 'assistant-ui-react',
        name: '@assistant-ui/react',
        url: 'https://github.com/assistant-ui/assistant-ui',
        author: 'AgentbaseAI Inc.',
        license: 'MIT',
      },
      {
        id: 'assistant-ui-react-ai-sdk',
        name: '@assistant-ui/react-ai-sdk',
        url: 'https://github.com/assistant-ui/assistant-ui',
        author: 'AgentbaseAI Inc.',
        license: 'MIT',
      },
      {
        id: 'assistant-ui-react-markdown',
        name: '@assistant-ui/react-markdown',
        url: 'https://github.com/assistant-ui/assistant-ui',
        author: 'AgentbaseAI Inc.',
        license: 'MIT',
      },
      {
        id: 'assistant-ui-react-streamdown',
        name: '@assistant-ui/react-streamdown',
        url: 'https://github.com/assistant-ui/assistant-ui',
        author: 'AgentbaseAI Inc.',
        license: 'MIT',
      },
      {
        id: 'ai-sdk',
        name: 'AI SDK',
        url: 'https://github.com/vercel/ai',
        author: 'Vercel',
        license: 'Apache-2.0',
      },
      {
        id: 'ai-sdk-react',
        name: '@ai-sdk/react',
        url: 'https://github.com/vercel/ai',
        author: 'Vercel',
        license: 'Apache-2.0',
      },
      {
        id: 'zod',
        name: 'Zod',
        url: 'https://github.com/colinhacks/zod',
        author: 'Colin McDonnell',
        license: 'MIT',
      },
    ],
  },
  {
    id: 'content-rendering-diagrams-and-state',
    title: 'Content Rendering, Diagrams & State',
    items: [
      {
        id: 'mermaid',
        name: 'Mermaid',
        url: 'https://github.com/mermaid-js/mermaid',
        author: 'Knut Sveidqvist',
        license: 'MIT',
      },
      {
        id: 'echarts',
        name: 'Apache ECharts',
        url: 'https://github.com/apache/echarts',
        author: 'The Apache Software Foundation',
        license: 'Apache-2.0',
      },
      {
        id: 'pixi-js',
        name: 'PixiJS',
        url: 'https://github.com/pixijs/pixijs',
        author: 'PixiJS Team',
        license: 'MIT',
      },
      {
        id: 'three-js',
        name: 'Three.js',
        url: 'https://github.com/mrdoob/three.js',
        author: 'Three.js Authors',
        license: 'MIT',
      },
      {
        id: 'elkjs',
        name: 'elkjs',
        url: 'https://github.com/kieler/elkjs',
        author: 'Ulf Rüegg',
        license: 'EPL-2.0',
      },
      {
        id: 'liveline',
        name: 'Liveline',
        url: 'https://github.com/benjitaylor/liveline',
        author: 'Benji Taylor',
        license: 'MIT',
      },
      {
        id: 'react-shiki',
        name: 'react-shiki',
        url: 'https://github.com/AVGVSTVS96/react-shiki',
        author: 'Bassim Shahidy',
        license: 'MIT',
      },
      {
        id: 'remark-gfm',
        name: 'remark-gfm',
        url: 'https://github.com/remarkjs/remark-gfm',
        author: 'Titus Wormer',
        license: 'MIT',
      },
      {
        id: 'streamdown',
        name: 'streamdown',
        url: 'https://github.com/vercel/streamdown',
        author: 'Hayden Bleasel',
        license: 'Apache-2.0',
      },
      {
        id: 'tw-shimmer',
        name: 'tw-shimmer',
        url: 'https://github.com/assistant-ui/assistant-ui',
        author: 'AgentbaseAI Inc.',
        license: 'MIT',
      },
      {
        id: 'zustand',
        name: 'zustand',
        url: 'https://github.com/pmndrs/zustand',
        author: 'Paul Henschel',
        license: 'MIT',
      },
    ],
  },
  {
    id: 'bundled-font-packages',
    title: 'Bundled Font Packages (Fontsource)',
    items: [
      {
        id: 'fontsource-jetbrains-mono',
        name: 'JetBrains Mono',
        url: 'https://github.com/fontsource/fontsource/tree/main/packages/jetbrains-mono',
        author: 'Fontsource',
        license: 'OFL-1.1',
      },
      {
        id: 'fontsource-anonymous-pro',
        name: 'Anonymous Pro',
        url: 'https://github.com/fontsource/fontsource/tree/main/packages/anonymous-pro',
        author: 'Fontsource',
        license: 'OFL-1.1',
      },
      {
        id: 'fontsource-cascadia-code',
        name: 'Cascadia Code',
        url: 'https://github.com/fontsource/fontsource/tree/main/packages/cascadia-code',
        author: 'Fontsource',
        license: 'OFL-1.1',
      },
      {
        id: 'fontsource-comic-mono',
        name: 'Comic Mono',
        url: 'https://github.com/fontsource/fontsource/tree/main/packages/comic-mono',
        author: 'Fontsource',
        license: 'MIT',
      },
      {
        id: 'fontsource-cousine',
        name: 'Cousine',
        url: 'https://github.com/fontsource/fontsource/tree/main/packages/cousine',
        author: 'Fontsource',
        license: 'OFL-1.1',
      },
      {
        id: 'fontsource-fira-code',
        name: 'Fira Code',
        url: 'https://github.com/fontsource/fontsource/tree/main/packages/fira-code',
        author: 'Fontsource',
        license: 'OFL-1.1',
      },
      {
        id: 'fontsource-ibm-plex-mono',
        name: 'IBM Plex Mono',
        url: 'https://github.com/fontsource/fontsource/tree/main/packages/ibm-plex-mono',
        author: 'Fontsource',
        license: 'OFL-1.1',
      },
      {
        id: 'fontsource-inconsolata',
        name: 'Inconsolata',
        url: 'https://github.com/fontsource/fontsource/tree/main/packages/inconsolata',
        author: 'Fontsource',
        license: 'OFL-1.1',
      },
      {
        id: 'fontsource-iosevka',
        name: 'Iosevka',
        url: 'https://github.com/fontsource/fontsource/tree/main/packages/iosevka',
        author: 'Fontsource',
        license: 'OFL-1.1',
      },
      {
        id: 'fontsource-mononoki',
        name: 'Mononoki',
        url: 'https://github.com/fontsource/fontsource/tree/main/packages/mononoki',
        author: 'Fontsource',
        license: 'OFL-1.1',
      },
      {
        id: 'fontsource-noto-sans-mono',
        name: 'Noto Sans Mono',
        url: 'https://github.com/fontsource/fontsource/tree/main/packages/noto-sans-mono',
        author: 'Fontsource',
        license: 'OFL-1.1',
      },
      {
        id: 'fontsource-source-code-pro',
        name: 'Source Code Pro',
        url: 'https://github.com/fontsource/fontsource/tree/main/packages/source-code-pro',
        author: 'Fontsource',
        license: 'OFL-1.1',
      },
      {
        id: 'fontsource-space-mono',
        name: 'Space Mono',
        url: 'https://github.com/fontsource/fontsource/tree/main/packages/space-mono',
        author: 'Fontsource',
        license: 'OFL-1.1',
      },
      {
        id: 'fontsource-ubuntu-mono',
        name: 'Ubuntu Mono',
        url: 'https://github.com/fontsource/fontsource/tree/main/packages/ubuntu-mono',
        author: 'Fontsource',
        license: 'UFL-1.0',
      },
      {
        id: 'fontsource-victor-mono',
        name: 'Victor Mono',
        url: 'https://github.com/fontsource/fontsource/tree/main/packages/victor-mono',
        author: 'Fontsource',
        license: 'OFL-1.1',
      },
    ],
  },
  {
    id: 'bundled-font-assets',
    title: 'Bundled Font Assets',
    items: [
      {
        id: '0xproto',
        name: '0xProto',
        url: 'https://github.com/0xType/0xProto',
        author: '0xType',
        license: 'OFL-1.1',
      },
      {
        id: 'agave',
        name: 'Agave',
        url: 'https://github.com/blobject/agave',
        author: 'blobject',
        license: 'MIT',
      },
      {
        id: 'dejavu-sans-mono',
        name: 'DejaVu Sans Mono',
        url: 'https://github.com/dejavu-fonts/dejavu-fonts',
        author: 'DejaVu Fonts',
        license: 'Bitstream Vera / Arev / Public Domain Notices',
      },
      {
        id: 'fantasque-sans-mono',
        name: 'Fantasque Sans Mono',
        url: 'https://github.com/belluzj/fantasque-sans',
        author: 'Jany Belluz',
        license: 'OFL-1.1',
      },
      {
        id: 'hack',
        name: 'Hack',
        url: 'https://github.com/source-foundry/Hack',
        author: 'Source Foundry',
        license: 'MIT / Bitstream Vera',
      },
      {
        id: 'hasklig',
        name: 'Hasklig',
        url: 'https://github.com/i-tu/Hasklig',
        author: 'Ian Tuomi',
        license: 'OFL-1.1',
      },
      {
        id: 'juliamono',
        name: 'JuliaMono',
        url: 'https://github.com/cormullion/juliamono',
        author: 'Cormullion',
        license: 'OFL-1.1',
      },
      {
        id: 'liberation-mono',
        name: 'Liberation Mono',
        url: 'https://github.com/liberationfonts/liberation-fonts',
        author: 'Red Hat',
        license: 'OFL-1.1',
      },
      {
        id: 'm-plus-code-latin',
        name: 'M PLUS Code Latin',
        url: 'https://github.com/coz-m/MPLUS_FONTS',
        author: 'M+ FONTS Project',
        license: 'OFL-1.1',
      },
      {
        id: 'meslo-font',
        name: 'Meslo Font',
        url: 'https://github.com/andreberg/Meslo-Font',
        author: 'Andre Berg',
        license: 'Apache-2.0',
      },
      {
        id: 'monaspace',
        name: 'Monaspace',
        url: 'https://github.com/githubnext/monaspace',
        author: 'GitHub Next',
        license: 'OFL-1.1',
      },
      {
        id: 'monoid',
        name: 'Monoid',
        url: 'https://github.com/larsenwork/monoid',
        author: 'Andreas Larsen',
        license: 'MIT / OFL-1.1',
      },
    ],
  },
  {
    id: 'bundled-binaries-and-extra-resources',
    title: 'Bundled Binaries & Extra Resources',
    items: [
      {
        id: 'pristine-engine',
        name: 'pristine-engine',
        url: 'https://github.com/PristineEDA/pristine-engine',
        author: 'PristineEDA',
        license: 'Apache-2.0',
      },
      {
        id: 'pristine-res',
        name: 'pristine-res',
        url: 'https://github.com/PristineEDA/pristine-res',
        author: 'PristineEDA',
        license: 'Apache-2.0',
      },
    ],
  },
];

export function formatAttributionLine(item: AttributionItem): string {
  return `${item.name}（${item.url}）${item.author} ${item.license}`;
}

export function formatAttributionsMarkdown(sections: AttributionSection[] = openSourceAttributionSections): string {
  const renderedSections = sections.map((section) => [
    `## ${section.title}`,
    '',
    ...section.items.map((item) => formatAttributionLine(item)),
  ].join('\n')).join('\n\n');

  return [
    `# ${ATTRIBUTIONS_DOCUMENT_TITLE}`,
    '',
    ATTRIBUTIONS_DOCUMENT_DESCRIPTION,
    '',
    renderedSections,
    '',
  ].join('\n');
}

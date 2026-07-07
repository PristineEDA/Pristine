export const DEFAULT_WORKSPACE_ROOT_NAME = 'Project';
export const WORKSPACE_ROOT_PATH = '.';

const UNTITLED_FILE_ID_PATTERN = /^untitled-\d+$/i;
const WINDOWS_RESERVED_NAME_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const WINDOWS_INVALID_FILE_NAME_CHARS = /[\\/:*?"<>|]/;

export interface WorkspaceTreeNode {
  id: string;
  path: string;
  name: string;
  type: 'file' | 'folder';
  isDraft?: boolean;
  children?: WorkspaceTreeNode[];
  hasLoadedChildren: boolean;
  isLoading: boolean;
}

export interface WorkspaceDirectoryEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

export type WorkspaceEntryType = 'file' | 'folder';

export type WorkspaceClipboardMode = 'copy' | 'cut';

export interface WorkspaceClipboardState {
  sourcePath: string;
  entryType: WorkspaceEntryType;
  mode: WorkspaceClipboardMode;
}

export type ExplorerSelectedNodeType = 'file' | 'folder' | 'root';
export type ExplorerSelectedNodeSource = 'real' | 'draft';
export type ExplorerTreeEditMode = 'rename' | 'create-file' | 'create-folder';

export interface ExplorerSelectedNode {
  id: string;
  path: string;
  type: ExplorerSelectedNodeType;
  source: ExplorerSelectedNodeSource;
}

export interface ExplorerTreeEditSession {
  mode: ExplorerTreeEditMode;
  targetNodeId: string;
  targetPath: string;
  parentPath: string;
  entryType: 'file' | 'folder';
  source: ExplorerSelectedNodeSource;
  value: string;
  isSubmitting: boolean;
  submitError: string | null;
}

export interface WorkspaceEntryNameValidationResult {
  isValid: boolean;
  errorMessage: string | null;
  normalizedName: string;
  nextPath: string | null;
}

interface ValidateWorkspaceEntryNameOptions {
  value: string;
  parentPath: string;
  rootNodes: WorkspaceTreeNode[];
  currentPath?: string | null;
}

export function normalizeWorkspacePath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  return normalized.length === 0 ? WORKSPACE_ROOT_PATH : normalized;
}

export function joinWorkspacePath(parentPath: string, name: string): string {
  if (parentPath === WORKSPACE_ROOT_PATH) {
    return normalizeWorkspacePath(name);
  }

  return normalizeWorkspacePath(`${parentPath}/${name}`);
}

export function getWorkspaceBaseName(filePath: string): string {
  const normalized = normalizeWorkspacePath(filePath);

  if (normalized === WORKSPACE_ROOT_PATH) {
    return DEFAULT_WORKSPACE_ROOT_NAME;
  }

  const segments = normalized.split('/');
  return segments[segments.length - 1] ?? normalized;
}

export function getPathBaseName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? filePath;
}

export function splitWorkspaceEntryName(name: string): { stem: string; extension: string } {
  const lastDotIndex = name.lastIndexOf('.');

  if (lastDotIndex <= 0) {
    return {
      stem: name,
      extension: '',
    };
  }

  return {
    stem: name.slice(0, lastDotIndex),
    extension: name.slice(lastDotIndex),
  };
}

export function createWorkspaceCopyName(name: string, entryType: WorkspaceEntryType, copyIndex = 1): string {
  const suffix = copyIndex <= 1 ? '-copy' : `-copy-${copyIndex}`;

  if (entryType === 'folder') {
    return `${name}${suffix}`;
  }

  const { stem, extension } = splitWorkspaceEntryName(name);
  return `${stem}${suffix}${extension}`;
}

export function getWorkspaceParentPath(filePath: string): string {
  const normalized = normalizeWorkspacePath(filePath);

  if (normalized === WORKSPACE_ROOT_PATH) {
    return WORKSPACE_ROOT_PATH;
  }

  const segments = normalized.split('/');
  return segments.length <= 1 ? WORKSPACE_ROOT_PATH : segments.slice(0, -1).join('/');
}

export function isUntitledFileId(filePath: string): boolean {
  return UNTITLED_FILE_ID_PATTERN.test(filePath);
}

export function isAbsoluteFilePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith('//') || normalized.startsWith('/');
}

export function isWorkspaceRelativeFilePath(filePath: string): boolean {
  return !isUntitledFileId(filePath) && !isAbsoluteFilePath(filePath);
}

export function isPdfWorkspaceFile(filePath: string): boolean {
  return normalizeWorkspacePath(filePath).toLowerCase().endsWith('.pdf');
}

export function getWorkspaceSegments(filePath: string, rootName = DEFAULT_WORKSPACE_ROOT_NAME): string[] {
  const normalized = normalizeWorkspacePath(filePath);

  if (normalized === WORKSPACE_ROOT_PATH) {
    return [rootName];
  }

  return [rootName, ...normalized.split('/')];
}

export function getDisplayPathSegments(filePath: string, displayName?: string): string[] {
  if (isUntitledFileId(filePath)) {
    return [displayName ?? filePath];
  }

  if (isAbsoluteFilePath(filePath)) {
    const normalized = filePath.replace(/\\/g, '/');
    return normalized.split('/').filter(Boolean);
  }

  return getWorkspaceSegments(filePath);
}

export function getWorkspaceAncestorPaths(filePath: string): string[] {
  const normalized = normalizeWorkspacePath(filePath);

  if (normalized === WORKSPACE_ROOT_PATH) {
    return [WORKSPACE_ROOT_PATH];
  }

  const folders = normalized.split('/').slice(0, -1);
  const ancestorPaths = [WORKSPACE_ROOT_PATH];

  for (let index = 0; index < folders.length; index += 1) {
    ancestorPaths.push(folders.slice(0, index + 1).join('/'));
  }

  return ancestorPaths;
}

export function getEditorLanguage(filePath: string): string {
  const normalized = normalizeWorkspacePath(filePath);
  const lowerCased = normalized.toLowerCase();

  if (lowerCased === 'makefile' || lowerCased.endsWith('/makefile') || lowerCased.endsWith('.mk')) {
    return 'makefile';
  }

  if (lowerCased.endsWith('.s')) {
    return 'assembly';
  }

  if (lowerCased.endsWith('.sh')) {
    return 'shell';
  }

  if (lowerCased.endsWith('.tcl')) {
    return 'tcl';
  }

  if (lowerCased.endsWith('.ld') || lowerCased.endsWith('.lds')) {
    return 'linker-script';
  }

  if (lowerCased.endsWith('.f') || lowerCased.endsWith('.fl')) {
    return 'filelist';
  }

  if (lowerCased.endsWith('.sdc') || lowerCased.endsWith('.xdc')) {
    return 'constraints';
  }

  if (lowerCased.endsWith('.sv') || lowerCased.endsWith('.svh')) {
    return 'systemverilog';
  }

  if (lowerCased.endsWith('.v') || lowerCased.endsWith('.vh')) {
    return 'verilog';
  }

  if (lowerCased.endsWith('.md')) {
    return 'markdown';
  }

  if (lowerCased.endsWith('.pdf')) {
    return 'pdf';
  }

  if (lowerCased.endsWith('.c') || lowerCased.endsWith('.h')) {
    return 'c';
  }

  if (lowerCased.endsWith('.cpp') || lowerCased.endsWith('.hpp')) {
    return 'cpp';
  }

  if (lowerCased.endsWith('.json')) {
    return 'json';
  }

  if (lowerCased.endsWith('.yml') || lowerCased.endsWith('.yaml')) {
    return 'yaml';
  }

  if (lowerCased.endsWith('.xml')) {
    return 'xml';
  }

  if (lowerCased.endsWith('.ts') || lowerCased.endsWith('.tsx')) {
    return 'typescript';
  }

  if (lowerCased.endsWith('.js') || lowerCased.endsWith('.jsx')) {
    return 'javascript';
  }

  if (lowerCased.endsWith('.py')) {
    return 'python';
  }

  return 'plaintext';
}

export function getEditorLanguageLabel(filePath: string): string {
  const normalized = normalizeWorkspacePath(filePath).toLowerCase();

  if (normalized === 'makefile' || normalized.endsWith('/makefile') || normalized.endsWith('.mk')) {
    return 'Makefile';
  }

  if (normalized.endsWith('.s')) {
    return 'Assembly';
  }

  if (normalized.endsWith('.sh')) {
    return 'Shell';
  }

  if (normalized.endsWith('.xdc')) {
    return 'XDC';
  }

  if (normalized.endsWith('.sdc')) {
    return 'SDC';
  }

  if (normalized.endsWith('.tcl')) {
    return 'Tcl';
  }

  if (normalized.endsWith('.ld') || normalized.endsWith('.lds')) {
    return 'Linker Script';
  }

  if (normalized.endsWith('.f') || normalized.endsWith('.fl')) {
    return 'File List';
  }

  const language = getEditorLanguage(filePath);

  if (language === 'systemverilog') {
    return 'SystemVerilog';
  }

  if (language === 'verilog') {
    return 'Verilog';
  }

  if (language === 'markdown') {
    return 'Markdown';
  }

  if (language === 'pdf') {
    return 'PDF';
  }

  if (language === 'json') {
    return 'JSON';
  }

  if (language === 'yaml') {
    return 'YAML';
  }

  if (language === 'xml') {
    return 'XML';
  }

  if (language === 'tcl') {
    return 'Tcl';
  }

  if (language === 'constraints') {
    return 'Constraints';
  }

  if (language === 'typescript') {
    return 'TypeScript';
  }

  if (language === 'javascript') {
    return 'JavaScript';
  }

  if (language === 'python') {
    return 'Python';
  }

  if (language === 'c') {
    return 'C';
  }

  if (language === 'cpp') {
    return 'C++';
  }

  return 'Plain Text';
}

export function toTreeTestId(path: string): string {
  const normalized = normalizeWorkspacePath(path);

  if (normalized === WORKSPACE_ROOT_PATH) {
    return 'root';
  }

  return normalized.replace(/[/.]/g, '_').replace(/[^A-Za-z0-9_-]/g, '-');
}

function getSortableWorkspaceNodeName(node: WorkspaceTreeNode): string {
  if (node.isDraft && node.name.trim().length === 0) {
    return '\uffff';
  }

  return node.name;
}

export function sortWorkspaceNodes(nodes: WorkspaceTreeNode[]): WorkspaceTreeNode[] {
  return [...nodes].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'folder' ? -1 : 1;
    }

    return getSortableWorkspaceNodeName(left).localeCompare(
      getSortableWorkspaceNodeName(right),
      undefined,
      { numeric: true, sensitivity: 'base' },
    );
  });
}

export function createExplorerDraftId(parentPath: string, entryType: 'file' | 'folder'): string {
  return `draft:${entryType}:${normalizeWorkspacePath(parentPath)}`;
}

export function createExplorerDraftNode(
  parentPath: string,
  entryType: 'file' | 'folder',
  draftId: string,
  name = '',
): WorkspaceTreeNode {
  const fallbackSegment = entryType === 'folder' ? '__draft_folder__' : '__draft_file__';

  return {
    id: draftId,
    path: joinWorkspacePath(parentPath, name.trim() || fallbackSegment),
    name,
    type: entryType,
    isDraft: true,
    children: entryType === 'folder' ? [] : undefined,
    hasLoadedChildren: entryType !== 'folder',
    isLoading: false,
  };
}

export function mergeWorkspaceChildrenWithDraft(
  children: WorkspaceTreeNode[] | undefined,
  draftNode?: WorkspaceTreeNode | null,
): WorkspaceTreeNode[] {
  const nextChildren = children ? [...children] : [];

  if (draftNode) {
    nextChildren.push(draftNode);
  }

  return sortWorkspaceNodes(nextChildren);
}

export function findWorkspaceNode(
  rootNodes: WorkspaceTreeNode[] | WorkspaceTreeNode | null,
  targetPath: string,
): WorkspaceTreeNode | null {
  if (!rootNodes) {
    return null;
  }

  const nodes = Array.isArray(rootNodes) ? rootNodes : [rootNodes];

  for (const node of nodes) {
    if (node.path === targetPath) {
      return node;
    }

    if (!node.children?.length) {
      continue;
    }

    const match = findWorkspaceNode(node.children, targetPath);
    if (match) {
      return match;
    }
  }

  return null;
}

export function getWorkspaceChildrenForPath(
  rootNodes: WorkspaceTreeNode[],
  parentPath: string,
): WorkspaceTreeNode[] {
  if (parentPath === WORKSPACE_ROOT_PATH) {
    return rootNodes[0]?.children ?? [];
  }

  const parentNode = findWorkspaceNode(rootNodes, parentPath);
  return parentNode?.children ?? [];
}

export function isWithinWorkspacePath(path: string, prefixPath: string): boolean {
  const normalizedPath = normalizeWorkspacePath(path);
  const normalizedPrefixPath = normalizeWorkspacePath(prefixPath);

  if (normalizedPrefixPath === WORKSPACE_ROOT_PATH) {
    return normalizedPath !== WORKSPACE_ROOT_PATH;
  }

  return normalizedPath === normalizedPrefixPath || normalizedPath.startsWith(`${normalizedPrefixPath}/`);
}

export function replaceWorkspacePathPrefix(path: string, currentPrefix: string, nextPrefix: string): string {
  const normalizedPath = normalizeWorkspacePath(path);
  const normalizedCurrentPrefix = normalizeWorkspacePath(currentPrefix);
  const normalizedNextPrefix = normalizeWorkspacePath(nextPrefix);

  if (normalizedPath === normalizedCurrentPrefix) {
    return normalizedNextPrefix;
  }

  if (normalizedCurrentPrefix === WORKSPACE_ROOT_PATH) {
    return joinWorkspacePath(normalizedNextPrefix, normalizedPath);
  }

  const suffix = normalizedPath.slice(normalizedCurrentPrefix.length + 1);
  return joinWorkspacePath(normalizedNextPrefix, suffix);
}

export function validateWorkspaceEntryName({
  value,
  parentPath,
  rootNodes,
  currentPath,
}: ValidateWorkspaceEntryNameOptions): WorkspaceEntryNameValidationResult {
  const normalizedName = value.trim();

  if (currentPath && normalizeWorkspacePath(currentPath) === WORKSPACE_ROOT_PATH) {
    return {
      isValid: false,
      errorMessage: 'The workspace root cannot be renamed.',
      normalizedName,
      nextPath: null,
    };
  }

  if (normalizedName.length === 0) {
    return {
      isValid: false,
      errorMessage: 'A name is required.',
      normalizedName,
      nextPath: null,
    };
  }

  if (normalizedName === '.' || normalizedName === '..') {
    return {
      isValid: false,
      errorMessage: 'Reserved path segments are not allowed.',
      normalizedName,
      nextPath: null,
    };
  }

  if (WINDOWS_INVALID_FILE_NAME_CHARS.test(normalizedName)) {
    return {
      isValid: false,
      errorMessage: 'Windows reserved characters are not allowed.',
      normalizedName,
      nextPath: null,
    };
  }

  if (/[. ]$/.test(normalizedName)) {
    return {
      isValid: false,
      errorMessage: 'Names cannot end with a period or a space.',
      normalizedName,
      nextPath: null,
    };
  }

  if (WINDOWS_RESERVED_NAME_PATTERN.test(normalizedName)) {
    return {
      isValid: false,
      errorMessage: 'Windows reserved device names are not allowed.',
      normalizedName,
      nextPath: null,
    };
  }

  const nextPath = joinWorkspacePath(parentPath, normalizedName);
  const nextPathKey = normalizeWorkspacePath(nextPath).toLowerCase();
  const currentPathKey = currentPath ? normalizeWorkspacePath(currentPath).toLowerCase() : null;
  const siblingPaths = new Set(
    getWorkspaceChildrenForPath(rootNodes, parentPath)
      .map((child) => normalizeWorkspacePath(child.path).toLowerCase()),
  );

  if (currentPathKey) {
    siblingPaths.delete(currentPathKey);
  }

  if (siblingPaths.has(nextPathKey)) {
    return {
      isValid: false,
      errorMessage: 'An entry with the same name already exists.',
      normalizedName,
      nextPath: null,
    };
  }

  return {
    isValid: true,
    errorMessage: null,
    normalizedName,
    nextPath,
  };
}

export function sortDirectoryEntries(entries: WorkspaceDirectoryEntry[]): WorkspaceDirectoryEntry[] {
  return [...entries].sort((left, right) => {
    if (left.isDirectory !== right.isDirectory) {
      return left.isDirectory ? -1 : 1;
    }

    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export function createWorkspaceNode(
  parentPath: string,
  entry: WorkspaceDirectoryEntry,
): WorkspaceTreeNode {
  const nextPath = joinWorkspacePath(parentPath, entry.name);
  const isFolder = entry.isDirectory;

  return {
    id: nextPath,
    path: nextPath,
    name: entry.name,
    type: isFolder ? 'folder' : 'file',
    children: isFolder ? [] : undefined,
    hasLoadedChildren: !isFolder,
    isLoading: false,
  };
}

export function createRootNode(children: WorkspaceTreeNode[], name = DEFAULT_WORKSPACE_ROOT_NAME): WorkspaceTreeNode {
  return {
    id: WORKSPACE_ROOT_PATH,
    path: WORKSPACE_ROOT_PATH,
    name,
    type: 'folder',
    children,
    hasLoadedChildren: true,
    isLoading: false,
  };
}

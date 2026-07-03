import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getWorkspaceAncestorPaths,
  WORKSPACE_ROOT_PATH,
  WorkspaceTreeNode,
  createRootNode,
  createWorkspaceNode,
  sortDirectoryEntries,
} from './workspaceFiles';
import { useLazyRef } from '@/hooks/use-lazy-ref';
import { useExplorerTreeSessionStore } from './useExplorerTreeSessionStore';

const HIDDEN_ROOT_DIRECTORY_NAMES = new Set(['.pristine', '.prstine']);

export interface WorkspaceRevealRequest {
  path: string;
  token: number;
}

export interface UseWorkspaceTreeOptions {
  enabled?: boolean;
  rootName?: string;
}

function updateNode(
  node: WorkspaceTreeNode,
  targetPath: string,
  updater: (current: WorkspaceTreeNode) => WorkspaceTreeNode,
): WorkspaceTreeNode {
  if (node.path === targetPath) {
    return updater(node);
  }

  if (node.type === 'file' || !node.children || node.children.length === 0) {
    return node;
  }

  let changed = false;
  const nextChildren = node.children.map((child) => {
    const nextChild = updateNode(child, targetPath, updater);
    if (nextChild !== child) {
      changed = true;
    }
    return nextChild;
  });

  if (!changed) {
    return node;
  }

  return { ...node, children: nextChildren };
}

function findNode(node: WorkspaceTreeNode | null, targetPath: string): WorkspaceTreeNode | null {
  if (!node) {
    return null;
  }

  if (node.path === targetPath) {
    return node;
  }

  if (!node.children) {
    return null;
  }

  for (const child of node.children) {
    const match = findNode(child, targetPath);
    if (match) {
      return match;
    }
  }

  return null;
}

function preserveFolderState(
  currentNode: WorkspaceTreeNode | undefined,
  nextNode: WorkspaceTreeNode,
): WorkspaceTreeNode {
  if (!currentNode || currentNode.type !== 'folder' || nextNode.type !== 'folder') {
    return nextNode;
  }

  return {
    ...nextNode,
    children: currentNode.children ?? [],
    hasLoadedChildren: currentNode.hasLoadedChildren,
    isLoading: currentNode.isLoading,
  };
}

function mergeDirectoryChildren(
  currentChildren: WorkspaceTreeNode[] | undefined,
  nextChildren: WorkspaceTreeNode[],
): WorkspaceTreeNode[] {
  const currentChildrenByPath = new Map((currentChildren ?? []).map((child) => [child.path, child]));

  return nextChildren.map((child) => preserveFolderState(currentChildrenByPath.get(child.path), child));
}

export function useWorkspaceTree(
  revealRequest?: WorkspaceRevealRequest | null,
  refreshToken = 0,
  options?: UseWorkspaceTreeOptions,
) {
  const enabled = options?.enabled ?? true;
  const rootName = options?.rootName;
  const [rootNode, setRootNode] = useState<WorkspaceTreeNode | null>(null);
  const [workspaceAvailable, setWorkspaceAvailable] = useState<boolean | null>(null);
  const expandedFolderPaths = useExplorerTreeSessionStore((state) => state.expandedPaths);
  const setExpandedFolders = useExplorerTreeSessionStore((state) => state.setExpandedFolders);
  const addExpandedFolders = useExplorerTreeSessionStore((state) => state.addExpandedFolders);
  const toggleExpandedFolder = useExplorerTreeSessionStore((state) => state.toggleExpandedFolder);
  const expandedFolders = useMemo(() => new Set(expandedFolderPaths), [expandedFolderPaths]);
  const rootNodeRef = useRef<WorkspaceTreeNode | null>(null);
  const workspaceAvailableRef = useRef<boolean | null>(null);
  const expandedFoldersRef = useLazyRef(() => new Set([WORKSPACE_ROOT_PATH]));

  rootNodeRef.current = rootNode;
  workspaceAvailableRef.current = workspaceAvailable;
  expandedFoldersRef.current = expandedFolders;

  const loadDirectory = useCallback(async (dirPath: string) => {
    const fsApi = window.electronAPI?.fs;
    if (!fsApi) {
      setWorkspaceAvailable(false);
      return;
    }

    if (dirPath !== WORKSPACE_ROOT_PATH) {
      setRootNode((current) => {
        if (!current) {
          return current;
        }

        return updateNode(current, dirPath, (node) => ({ ...node, isLoading: true }));
      });
    }

    try {
      const entries = sortDirectoryEntries(await fsApi.readDir(dirPath))
        .filter((entry) => (
          dirPath !== WORKSPACE_ROOT_PATH
          || !entry.isDirectory
          || !HIDDEN_ROOT_DIRECTORY_NAMES.has(entry.name)
        ));
      const children = entries.map((entry) => createWorkspaceNode(dirPath, entry));

      if (dirPath === WORKSPACE_ROOT_PATH) {
        setRootNode((current) => {
          const mergedChildren = mergeDirectoryChildren(current?.children, children);

          if (!current) {
            return createRootNode(mergedChildren, rootName);
          }

          return {
            ...current,
            name: rootName ?? current.name,
            children: mergedChildren,
            hasLoadedChildren: true,
            isLoading: false,
          };
        });
        addExpandedFolders([WORKSPACE_ROOT_PATH]);
        setWorkspaceAvailable(true);
        return;
      }

      setRootNode((current) => {
        if (!current) {
          return current;
        }

        const nextRootNode = updateNode(current, dirPath, (node) => ({
          ...node,
          children: mergeDirectoryChildren(node.children, children),
          hasLoadedChildren: true,
          isLoading: false,
        }));
        return nextRootNode;
      });
    } catch {
      if (dirPath === WORKSPACE_ROOT_PATH) {
        setRootNode(null);
        setWorkspaceAvailable(false);
        setExpandedFolders(new Set([WORKSPACE_ROOT_PATH]));
        return;
      }

      setRootNode((current) => {
        if (!current) {
          return current;
        }

        const nextRootNode = updateNode(current, dirPath, (node) => ({
          ...node,
          children: [],
          hasLoadedChildren: true,
          isLoading: false,
        }));
        return nextRootNode;
      });
    }
  }, [addExpandedFolders, rootName]);

  const initializeTree = useCallback(async () => {
    if (!enabled) {
      setWorkspaceAvailable(false);
      setRootNode(null);
      setExpandedFolders([WORKSPACE_ROOT_PATH]);
      return;
    }

    const fsApi = window.electronAPI?.fs;
    if (!fsApi) {
      setWorkspaceAvailable(false);
      setRootNode(null);
      return;
    }

    try {
      const exists = await fsApi.exists(WORKSPACE_ROOT_PATH);
      if (!exists) {
        setWorkspaceAvailable(false);
        setRootNode(null);
        setExpandedFolders([WORKSPACE_ROOT_PATH]);
        return;
      }

      await loadDirectory(WORKSPACE_ROOT_PATH);
    } catch {
      setWorkspaceAvailable(false);
      setRootNode(null);
      setExpandedFolders([WORKSPACE_ROOT_PATH]);
    }
  }, [enabled, loadDirectory, setExpandedFolders]);

  useEffect(() => {
    void initializeTree();
  }, [initializeTree]);

  const refreshExpandedTree = useCallback(async () => {
    if (!enabled) {
      setWorkspaceAvailable(false);
      setRootNode(null);
      setExpandedFolders([WORKSPACE_ROOT_PATH]);
      return;
    }

    const fsApi = window.electronAPI?.fs;
    if (!fsApi) {
      setWorkspaceAvailable(false);
      setRootNode(null);
      return;
    }

    try {
      const exists = await fsApi.exists(WORKSPACE_ROOT_PATH);
      if (!exists) {
        setWorkspaceAvailable(false);
        setRootNode(null);
        setExpandedFolders([WORKSPACE_ROOT_PATH]);
        return;
      }

      if (workspaceAvailableRef.current !== true || !rootNodeRef.current) {
        await loadDirectory(WORKSPACE_ROOT_PATH);
        return;
      }

      await loadDirectory(WORKSPACE_ROOT_PATH);

      const expandedPaths = Array.from(expandedFoldersRef.current).filter((path) => path !== WORKSPACE_ROOT_PATH);
      for (const expandedPath of expandedPaths) {
        await loadDirectory(expandedPath);
      }
    } catch {
      setWorkspaceAvailable(false);
      setRootNode(null);
      setExpandedFolders([WORKSPACE_ROOT_PATH]);
    }
  }, [enabled, loadDirectory, setExpandedFolders]);

  useEffect(() => {
    if (refreshToken === 0) {
      return;
    }

    void refreshExpandedTree();
  }, [refreshExpandedTree, refreshToken]);

  useEffect(() => {
    if (!rootNode || workspaceAvailable !== true) {
      return;
    }

    const pathsToLoad = Array.from(expandedFolders).filter((expandedPath) => {
      if (expandedPath === WORKSPACE_ROOT_PATH) {
        return false;
      }

      const expandedNode = findNode(rootNode, expandedPath);
      return Boolean(
        expandedNode
        && expandedNode.type === 'folder'
        && !expandedNode.hasLoadedChildren
        && !expandedNode.isLoading,
      );
    });

    pathsToLoad.forEach((expandedPath) => {
      void loadDirectory(expandedPath);
    });
  }, [expandedFolders, loadDirectory, rootNode, workspaceAvailable]);

  useEffect(() => {
    if (!revealRequest?.path || workspaceAvailable !== true) {
      return;
    }

    const ancestorPaths = getWorkspaceAncestorPaths(revealRequest.path);

    addExpandedFolders(ancestorPaths);
  }, [addExpandedFolders, revealRequest, workspaceAvailable]);

  const toggleFolder = useCallback((path: string) => {
    toggleExpandedFolder(path);

    const currentNode = findNode(rootNode, path);
    if (currentNode && currentNode.type === 'folder' && !currentNode.hasLoadedChildren && !currentNode.isLoading) {
      void loadDirectory(path);
    }
  }, [loadDirectory, rootNode, toggleExpandedFolder]);

  const refreshTree = useCallback(() => {
    void initializeTree();
  }, [initializeTree]);

  const collapseAll = useCallback(() => {
    setExpandedFolders([WORKSPACE_ROOT_PATH]);
  }, [setExpandedFolders]);

  const treeNodes = useMemo(() => (rootNode ? [rootNode] : []), [rootNode]);

  return {
    treeNodes,
    workspaceAvailable,
    expandedFolders,
    toggleFolder,
    refreshTree,
    collapseAll,
  };
}

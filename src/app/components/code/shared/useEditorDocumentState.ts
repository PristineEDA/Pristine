import { useEffect, useRef, useState } from 'react';
import { useLazyRef } from '@/hooks/use-lazy-ref';
import { isAbsoluteFilePath, isUntitledFileId } from '../../../workspace/workspaceFiles';

interface EditorDocumentTab {
  id: string;
  name: string;
}

interface UseEditorDocumentStateOptions {
  tabs: EditorDocumentTab[];
  activeTabId: string;
  documentTabId?: string;
  contentCache?: Record<string, string>;
  loadingFiles?: Record<string, boolean>;
  loadErrors?: Record<string, string>;
  onLoadFile?: (fileId: string) => void;
  onContentChange?: (fileId: string, content: string) => void;
}

export function useEditorDocumentState({
  tabs,
  activeTabId,
  documentTabId,
  contentCache,
  loadingFiles,
  loadErrors,
  onLoadFile,
  onContentChange,
}: UseEditorDocumentStateOptions) {
  const [localContentCache, setLocalContentCache] = useState<Record<string, string>>({});
  const [localLoadingFiles, setLocalLoadingFiles] = useState<Record<string, boolean>>({});
  const [localLoadErrors, setLocalLoadErrors] = useState<Record<string, string>>({});
  const inFlightLoadsRef = useLazyRef(() => new Set<string>());
  const isMountedRef = useRef(true);
  const effectiveTabId = documentTabId ?? activeTabId;

  const resolvedContentCache = contentCache ?? localContentCache;
  const resolvedLoadingFiles = loadingFiles ?? localLoadingFiles;
  const resolvedLoadErrors = loadErrors ?? localLoadErrors;
  const activeTabContent = effectiveTabId ? resolvedContentCache[effectiveTabId] : undefined;
  const activeLoadError = effectiveTabId ? resolvedLoadErrors[effectiveTabId] : undefined;
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs.find((tab) => tab.id === effectiveTabId);
  const isActiveTabReady = Boolean(effectiveTabId) && activeTabContent !== undefined;
  const code = activeTabContent ?? '';
  const placeholderText = effectiveTabId
    ? activeLoadError
      ? `// Failed to load ${activeTab?.name ?? effectiveTabId}\n// ${activeLoadError}\n`
      : resolvedLoadingFiles[effectiveTabId] || activeTabContent === undefined
      ? `// ${activeTab?.name ?? effectiveTabId}\n// Loading file contents...\n`
      : ''
    : '';

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  useEffect(() => {
    if (!effectiveTabId || activeTabContent !== undefined || inFlightLoadsRef.current.has(effectiveTabId)) {
      return;
    }

    if (isUntitledFileId(effectiveTabId)) {
      if (onLoadFile) {
        onLoadFile(effectiveTabId);
        return;
      }

      setLocalContentCache((current) => ({ ...current, [effectiveTabId]: '' }));
      setLocalLoadingFiles((current) => ({ ...current, [effectiveTabId]: false }));
      return;
    }

    if (onLoadFile) {
      onLoadFile(effectiveTabId);
      return;
    }

    const fsApi = window.electronAPI?.fs;
    if (!fsApi) {
      setLocalLoadErrors((current) => ({ ...current, [effectiveTabId]: 'Filesystem API unavailable' }));
      return;
    }

    const readFile = isAbsoluteFilePath(effectiveTabId) ? fsApi.readFileAbsolute : fsApi.readFile;
    if (!readFile) {
      setLocalLoadErrors((current) => ({ ...current, [effectiveTabId]: 'Filesystem API unavailable' }));
      return;
    }

    inFlightLoadsRef.current.add(effectiveTabId);
    setLocalLoadingFiles((current) => ({ ...current, [effectiveTabId]: true }));
    void readFile(effectiveTabId, 'utf-8')
      .then((content) => {
        if (!isMountedRef.current) {
          return;
        }

        setLocalContentCache((current) => ({ ...current, [effectiveTabId]: content }));
        setLocalLoadErrors((current) => {
          if (!current[effectiveTabId]) {
            return current;
          }

          const next = { ...current };
          delete next[effectiveTabId];
          return next;
        });
      })
      .catch((error: unknown) => {
        if (!isMountedRef.current) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Unable to load file';
        setLocalLoadErrors((current) => ({ ...current, [effectiveTabId]: message }));
      })
      .finally(() => {
        inFlightLoadsRef.current.delete(effectiveTabId);

        if (!isMountedRef.current) {
          return;
        }

        setLocalLoadingFiles((current) => ({ ...current, [effectiveTabId]: false }));
      });
  }, [activeTabContent, effectiveTabId, onLoadFile]);

  const updateContent = (value: string) => {
    if (!effectiveTabId) {
      return;
    }

    if (onContentChange) {
      onContentChange(effectiveTabId, value);
      return;
    }

    setLocalContentCache((current) => ({ ...current, [effectiveTabId]: value }));
  };

  return {
    activeTab,
    activeLoadError,
    code,
    isActiveTabReady,
    placeholderText,
    updateContent,
  };
}

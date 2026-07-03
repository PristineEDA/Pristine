import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLazyRef } from '@/hooks/use-lazy-ref';
import { refreshWorkspaceGitStatus } from '../git/workspaceGitStatus';
import {
  isAbsoluteFilePath,
  isWithinWorkspacePath,
  isWorkspaceRelativeFilePath,
  replaceWorkspacePathPrefix,
} from '../workspace/workspaceFiles';

export interface SaveFilesResult {
  savedFileIds: string[];
  failedFileIds: string[];
}

interface SaveFileContentOptions {
  absolute?: boolean;
  content?: string;
  targetPath?: string;
}

interface AdoptFileStateOptions {
  content?: string;
  removeSource?: boolean;
  savedContent?: string;
}

function removeKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) {
    return record;
  }

  const nextRecord = { ...record };
  delete nextRecord[key];
  return nextRecord;
}

function renameKey<T>(record: Record<string, T>, currentKey: string, nextKey: string): Record<string, T> {
  if (currentKey === nextKey || !(currentKey in record)) {
    return record;
  }

  const nextRecord = { ...record };
  const currentValue = nextRecord[currentKey]!;
  delete nextRecord[currentKey];
  nextRecord[nextKey] = currentValue;
  return nextRecord;
}

function renameWorkspacePathKeys<T>(
  record: Record<string, T>,
  currentPrefix: string,
  nextPrefix: string,
): Record<string, T> {
  let changed = false;
  const nextRecord: Record<string, T> = {};

  Object.entries(record).forEach(([key, value]) => {
    if (isWorkspaceRelativeFilePath(key) && isWithinWorkspacePath(key, currentPrefix)) {
      nextRecord[replaceWorkspacePathPrefix(key, currentPrefix, nextPrefix)] = value;
      changed = true;
      return;
    }

    nextRecord[key] = value;
  });

  return changed ? nextRecord : record;
}

function removeWorkspacePathKeys<T>(record: Record<string, T>, targetPrefix: string): Record<string, T> {
  let changed = false;
  const nextRecord: Record<string, T> = {};

  Object.entries(record).forEach(([key, value]) => {
    if (isWorkspaceRelativeFilePath(key) && isWithinWorkspacePath(key, targetPrefix)) {
      changed = true;
      return;
    }

    nextRecord[key] = value;
  });

  return changed ? nextRecord : record;
}

export function useWorkspaceFileStore() {
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [savedFileContents, setSavedFileContents] = useState<Record<string, string>>({});
  const [loadingFiles, setLoadingFiles] = useState<Record<string, boolean>>({});
  const [savingFiles, setSavingFiles] = useState<Record<string, boolean>>({});
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const fileContentsRef = useRef<Record<string, string>>({});
  const savedFileContentsRef = useRef<Record<string, string>>({});
  const inFlightLoadsRef = useLazyRef(() => new Set<string>());
  const isMountedRef = useRef(true);

  const loadFileContent = useCallback((fileId: string) => {
    if (!fileId || fileContentsRef.current[fileId] !== undefined || inFlightLoadsRef.current.has(fileId)) {
      return;
    }

    const fsApi = window.electronAPI?.fs;
    if (!fsApi) {
      setLoadErrors((current) => ({ ...current, [fileId]: 'Filesystem API unavailable' }));
      return;
    }

    const readFile = isAbsoluteFilePath(fileId) ? fsApi.readFileAbsolute : fsApi.readFile;
    if (!readFile) {
      setLoadErrors((current) => ({ ...current, [fileId]: 'Filesystem API unavailable' }));
      return;
    }

    inFlightLoadsRef.current.add(fileId);
    setLoadingFiles((current) => ({ ...current, [fileId]: true }));

    void readFile(fileId, 'utf-8')
      .then((content) => {
        if (!isMountedRef.current) {
          return;
        }

        setFileContents((current) => {
          if (current[fileId] === content) {
            return current;
          }

          const next = { ...current, [fileId]: content };
          fileContentsRef.current = next;
          return next;
        });
        setSavedFileContents((current) => {
          if (current[fileId] === content) {
            return current;
          }

          const next = { ...current, [fileId]: content };
          savedFileContentsRef.current = next;
          return next;
        });
        setLoadErrors((current) => {
          if (!current[fileId]) {
            return current;
          }

          const next = { ...current };
          delete next[fileId];
          return next;
        });
        setSaveErrors((current) => {
          if (!current[fileId]) {
            return current;
          }

          const next = { ...current };
          delete next[fileId];
          return next;
        });
      })
      .catch((error: unknown) => {
        if (!isMountedRef.current) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Unable to load file';
        setLoadErrors((current) => ({ ...current, [fileId]: message }));
      })
      .finally(() => {
        inFlightLoadsRef.current.delete(fileId);
        if (!isMountedRef.current) {
          return;
        }

        setLoadingFiles((current) => ({ ...current, [fileId]: false }));
      });
  }, []);

  const initializeFile = useCallback((fileId: string, content: string, savedContent = content) => {
    if (!fileId) {
      return;
    }

    setFileContents((current) => {
      if (current[fileId] === content) {
        return current;
      }

      const next = { ...current, [fileId]: content };
      fileContentsRef.current = next;
      return next;
    });

    setSavedFileContents((current) => {
      if (current[fileId] === savedContent) {
        return current;
      }

      const next = { ...current, [fileId]: savedContent };
      savedFileContentsRef.current = next;
      return next;
    });

    setLoadErrors((current) => removeKey(current, fileId));
    setSaveErrors((current) => removeKey(current, fileId));
    setLoadingFiles((current) => {
      if (current[fileId] !== false) {
        return { ...current, [fileId]: false };
      }

      return current;
    });
    setSavingFiles((current) => {
      if (current[fileId] !== false) {
        return { ...current, [fileId]: false };
      }

      return current;
    });
  }, []);

  const adoptFileState = useCallback((currentFileId: string, nextFileId: string, options?: AdoptFileStateOptions) => {
    if (!currentFileId || !nextFileId) {
      return;
    }

    const nextContent = options?.content ?? fileContentsRef.current[currentFileId] ?? '';
    const nextSavedContent = options?.savedContent ?? savedFileContentsRef.current[currentFileId] ?? nextContent;
    const removeSource = options?.removeSource ?? false;

    setFileContents((current) => {
      const next = {
        ...current,
        [nextFileId]: nextContent,
      };

      if (removeSource && currentFileId !== nextFileId) {
        delete next[currentFileId];
      }

      fileContentsRef.current = next;
      return next;
    });

    setSavedFileContents((current) => {
      const next = {
        ...current,
        [nextFileId]: nextSavedContent,
      };

      if (removeSource && currentFileId !== nextFileId) {
        delete next[currentFileId];
      }

      savedFileContentsRef.current = next;
      return next;
    });

    setLoadErrors((current) => {
      const next = removeSource && currentFileId !== nextFileId
        ? removeKey(current, currentFileId)
        : { ...current };
      delete next[nextFileId];
      return next;
    });

    setSaveErrors((current) => {
      const next = removeSource && currentFileId !== nextFileId
        ? removeKey(current, currentFileId)
        : { ...current };
      delete next[nextFileId];
      return next;
    });

    setLoadingFiles((current) => {
      const next = { ...current, [nextFileId]: false };
      if (removeSource && currentFileId !== nextFileId) {
        delete next[currentFileId];
      }
      return next;
    });

    setSavingFiles((current) => {
      const next = { ...current, [nextFileId]: false };
      if (removeSource && currentFileId !== nextFileId) {
        delete next[currentFileId];
      }
      return next;
    });
  }, []);

  const renameFileState = useCallback((currentFileId: string, nextFileId: string) => {
    if (!currentFileId || !nextFileId || currentFileId === nextFileId) {
      return;
    }

    setFileContents((current) => {
      const next = renameKey(current, currentFileId, nextFileId);
      if (next !== current) {
        fileContentsRef.current = next;
      }
      return next;
    });

    setSavedFileContents((current) => {
      const next = renameKey(current, currentFileId, nextFileId);
      if (next !== current) {
        savedFileContentsRef.current = next;
      }
      return next;
    });

    setLoadErrors((current) => renameKey(current, currentFileId, nextFileId));
    setSaveErrors((current) => renameKey(current, currentFileId, nextFileId));
    setLoadingFiles((current) => renameKey(current, currentFileId, nextFileId));
    setSavingFiles((current) => renameKey(current, currentFileId, nextFileId));
  }, []);

  const renameWorkspacePaths = useCallback((currentPrefix: string, nextPrefix: string) => {
    if (!currentPrefix || !nextPrefix || currentPrefix === nextPrefix) {
      return;
    }

    setFileContents((current) => {
      const next = renameWorkspacePathKeys(current, currentPrefix, nextPrefix);
      if (next !== current) {
        fileContentsRef.current = next;
      }
      return next;
    });

    setSavedFileContents((current) => {
      const next = renameWorkspacePathKeys(current, currentPrefix, nextPrefix);
      if (next !== current) {
        savedFileContentsRef.current = next;
      }
      return next;
    });

    setLoadErrors((current) => renameWorkspacePathKeys(current, currentPrefix, nextPrefix));
    setSaveErrors((current) => renameWorkspacePathKeys(current, currentPrefix, nextPrefix));
    setLoadingFiles((current) => renameWorkspacePathKeys(current, currentPrefix, nextPrefix));
    setSavingFiles((current) => renameWorkspacePathKeys(current, currentPrefix, nextPrefix));
  }, []);

  const removeFile = useCallback((fileId: string) => {
    if (!fileId) {
      return;
    }

    setFileContents((current) => {
      const next = removeKey(current, fileId);
      if (next === current) {
        return current;
      }

      fileContentsRef.current = next;
      return next;
    });

    setSavedFileContents((current) => {
      const next = removeKey(current, fileId);
      if (next === current) {
        return current;
      }

      savedFileContentsRef.current = next;
      return next;
    });

    setLoadErrors((current) => removeKey(current, fileId));
    setSaveErrors((current) => removeKey(current, fileId));
    setLoadingFiles((current) => removeKey(current, fileId));
    setSavingFiles((current) => removeKey(current, fileId));
  }, []);

  const removeWorkspacePaths = useCallback((targetPrefix: string) => {
    if (!targetPrefix) {
      return;
    }

    setFileContents((current) => {
      const next = removeWorkspacePathKeys(current, targetPrefix);
      if (next !== current) {
        fileContentsRef.current = next;
      }
      return next;
    });

    setSavedFileContents((current) => {
      const next = removeWorkspacePathKeys(current, targetPrefix);
      if (next !== current) {
        savedFileContentsRef.current = next;
      }
      return next;
    });

    setLoadErrors((current) => removeWorkspacePathKeys(current, targetPrefix));
    setSaveErrors((current) => removeWorkspacePathKeys(current, targetPrefix));
    setLoadingFiles((current) => removeWorkspacePathKeys(current, targetPrefix));
    setSavingFiles((current) => removeWorkspacePathKeys(current, targetPrefix));
  }, []);

  const updateFileContent = useCallback((fileId: string, content: string) => {
    setFileContents((current) => {
      if (current[fileId] === content) {
        return current;
      }

      const next = { ...current, [fileId]: content };
      fileContentsRef.current = next;
      return next;
    });

    setSaveErrors((current) => {
      if (!current[fileId]) {
        return current;
      }

      const next = { ...current };
      delete next[fileId];
      return next;
    });
  }, []);

  const discardFiles = useCallback((fileIds: string[]) => {
    const uniqueFileIds = Array.from(new Set(fileIds.filter(Boolean)));
    if (uniqueFileIds.length === 0) {
      return;
    }

    setFileContents((current) => {
      let changed = false;
      const next = { ...current };

      uniqueFileIds.forEach((fileId) => {
        const savedContent = savedFileContentsRef.current[fileId];
        if (savedContent === undefined) {
          return;
        }

        if (next[fileId] === savedContent) {
          return;
        }

        next[fileId] = savedContent;
        changed = true;
      });

      if (!changed) {
        return current;
      }

      fileContentsRef.current = next;
      return next;
    });

    setSaveErrors((current) => {
      let changed = false;
      const next = { ...current };

      uniqueFileIds.forEach((fileId) => {
        if (!next[fileId]) {
          return;
        }

        delete next[fileId];
        changed = true;
      });

      return changed ? next : current;
    });
  }, []);

  const saveFileContentInternal = useCallback(async (
    fileId: string,
    refreshGitStatusAfterSuccess: boolean,
    options?: SaveFileContentOptions,
  ) => {
    if (!fileId) {
      return false;
    }

    const targetPath = options?.targetPath ?? fileId;
    const currentContent = options?.content ?? fileContentsRef.current[fileId];
    const savedContent = savedFileContentsRef.current[fileId];
    if (currentContent === undefined) {
      return false;
    }

    if (targetPath === fileId && currentContent === savedContent) {
      setSaveErrors((current) => {
        if (!current[fileId]) {
          return current;
        }

        const next = { ...current };
        delete next[fileId];
        return next;
      });
      return true;
    }

    const fsApi = window.electronAPI?.fs;
    if (!fsApi) {
      setSaveErrors((current) => ({ ...current, [fileId]: 'Filesystem API unavailable' }));
      return false;
    }

    const shouldWriteAbsolutePath = options?.absolute ?? isAbsoluteFilePath(targetPath);
    const writeFile = shouldWriteAbsolutePath ? fsApi.writeFileAbsolute : fsApi.writeFile;
    if (!writeFile) {
      setSaveErrors((current) => ({ ...current, [fileId]: 'Filesystem API unavailable' }));
      return false;
    }

    setSavingFiles((current) => ({ ...current, [fileId]: true }));
    setSaveErrors((current) => {
      if (!current[fileId]) {
        return current;
      }

      const next = { ...current };
      delete next[fileId];
      return next;
    });

    try {
      await writeFile(targetPath, currentContent);

      if (!isMountedRef.current) {
        return true;
      }

      if (targetPath === fileId) {
        setSavedFileContents((current) => {
          if (current[fileId] === currentContent) {
            return current;
          }

          const next = { ...current, [fileId]: currentContent };
          savedFileContentsRef.current = next;
          return next;
        });

        if (options?.content !== undefined) {
          setFileContents((current) => {
            if (current[fileId] === currentContent) {
              return current;
            }

            const next = { ...current, [fileId]: currentContent };
            fileContentsRef.current = next;
            return next;
          });
        }
      }

      if (refreshGitStatusAfterSuccess) {
        refreshWorkspaceGitStatus();
      }

      return true;
    } catch (error: unknown) {
      if (isMountedRef.current) {
        const message = error instanceof Error ? error.message : 'Unable to save file';
        setSaveErrors((current) => ({ ...current, [fileId]: message }));
      }

      return false;
    } finally {
      if (!isMountedRef.current) {
        return;
      }

      setSavingFiles((current) => ({ ...current, [fileId]: false }));
    }
  }, []);

  const saveFileContent = useCallback(async (fileId: string, options?: SaveFileContentOptions) => {
    return saveFileContentInternal(fileId, true, options);
  }, [saveFileContentInternal]);

  const saveFiles = useCallback(async (fileIds: string[]): Promise<SaveFilesResult> => {
    const uniqueFileIds = Array.from(new Set(fileIds.filter(Boolean)));
    if (uniqueFileIds.length === 0) {
      return {
        savedFileIds: [],
        failedFileIds: [],
      };
    }

    const results = await Promise.all(uniqueFileIds.map(async (fileId) => ({
      fileId,
      saved: await saveFileContentInternal(fileId, false),
    })));

    if (results.some((result) => result.saved)) {
      refreshWorkspaceGitStatus();
    }

    return {
      savedFileIds: results.filter((result) => result.saved).map((result) => result.fileId),
      failedFileIds: results.filter((result) => !result.saved).map((result) => result.fileId),
    };
  }, [saveFileContentInternal]);

  const dirtyFiles = useMemo(() => {
    const dirtyEntries = new Set([
      ...Object.keys(fileContents),
      ...Object.keys(savedFileContents),
    ]);

    return Array.from(dirtyEntries).reduce<Record<string, boolean>>((current, fileId) => {
      current[fileId] = fileContents[fileId] !== undefined && fileContents[fileId] !== savedFileContents[fileId];
      return current;
    }, {});
  }, [fileContents, savedFileContents]);

  const dirtyFileIds = useMemo(
    () => Object.keys(dirtyFiles).filter((fileId) => dirtyFiles[fileId]),
    [dirtyFiles],
  );

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  useEffect(() => {
    fileContentsRef.current = fileContents;
  }, [fileContents]);

  useEffect(() => {
    savedFileContentsRef.current = savedFileContents;
  }, [savedFileContents]);

  const resetFileStore = useCallback(() => {
    inFlightLoadsRef.current.clear();
    fileContentsRef.current = {};
    savedFileContentsRef.current = {};
    setFileContents({});
    setSavedFileContents({});
    setLoadingFiles({});
    setSavingFiles({});
    setLoadErrors({});
    setSaveErrors({});
  }, []);

  return {
    adoptFileState,
    dirtyFileIds,
    dirtyFiles,
    discardFiles,
    fileContents,
    initializeFile,
    loadErrors,
    loadFileContent,
    loadingFiles,
    removeFile,
    removeWorkspacePaths,
    renameFileState,
    renameWorkspacePaths,
    resetFileStore,
    saveErrors,
    saveFileContent,
    saveFiles,
    savingFiles,
    updateFileContent,
  };
}

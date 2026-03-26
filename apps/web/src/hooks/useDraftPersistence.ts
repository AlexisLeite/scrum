import { DraftDto, DraftEntityType } from "@scrum/contracts";
import React from "react";
import { apiClient } from "../api/client";

const DRAFT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const REMOTE_SAVE_INTERVAL_MS = 15_000;
const STORAGE_PREFIX = "scrum:draft:";

type StoredDraft<T> = {
  payload: T;
  updatedAt: string;
};

function buildStorageKey(userId: string, entityType: DraftEntityType, entityId: string) {
  return `${STORAGE_PREFIX}${userId}:${entityType}:${entityId}`;
}

function cleanupExpiredLocalDrafts() {
  if (typeof window === "undefined") {
    return;
  }

  const now = Date.now();
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(STORAGE_PREFIX)) {
      continue;
    }

    try {
      const rawValue = window.localStorage.getItem(key);
      if (!rawValue) {
        continue;
      }
      const parsed = JSON.parse(rawValue) as StoredDraft<unknown>;
      const updatedAt = parsed?.updatedAt ? new Date(parsed.updatedAt).getTime() : 0;
      if (!updatedAt || now - updatedAt > DRAFT_RETENTION_MS) {
        window.localStorage.removeItem(key);
      }
    } catch {
      window.localStorage.removeItem(key);
    }
  }
}

function readLocalDraft<T>(storageKey: string): StoredDraft<T> | null {
  if (typeof window === "undefined") {
    return null;
  }

  cleanupExpiredLocalDrafts();
  const rawValue = window.localStorage.getItem(storageKey);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as StoredDraft<T>;
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
}

function writeLocalDraft<T>(storageKey: string, payload: T): string {
  const updatedAt = new Date().toISOString();
  if (typeof window !== "undefined") {
    cleanupExpiredLocalDrafts();
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        payload,
        updatedAt
      } satisfies StoredDraft<T>)
    );
  }
  return updatedAt;
}

function deleteLocalDraft(storageKey: string) {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(storageKey);
  }
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildDraftPath(entityType: DraftEntityType, entityId: string, productId?: string) {
  const params = new URLSearchParams();
  if (productId) {
    params.set("productId", productId);
  }
  const query = params.toString();
  return `/drafts/${entityType}/${entityId}${query ? `?${query}` : ""}`;
}

export function useDraftPersistence<T extends Record<string, unknown>>(options: {
  userId?: string;
  entityType: DraftEntityType;
  entityId: string;
  initialValue: T;
  productId?: string;
  enabled?: boolean;
}) {
  const { userId, entityType, entityId, initialValue, productId, enabled = true } = options;
  const initialValueJson = JSON.stringify(initialValue);
  const initialSnapshot = React.useMemo(() => JSON.parse(initialValueJson) as T, [initialValueJson]);
  const [value, setValue] = React.useState<T>(initialSnapshot);
  const [isHydratingRemote, setIsHydratingRemote] = React.useState(false);
  const [saveError, setSaveError] = React.useState("");
  const storageKey = React.useMemo(
    () => (userId ? buildStorageKey(userId, entityType, entityId) : null),
    [entityId, entityType, userId]
  );
  const lastSavedJsonRef = React.useRef(JSON.stringify(initialSnapshot));
  const isMountedRef = React.useRef(false);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    const nextJson = JSON.stringify(initialSnapshot);
    lastSavedJsonRef.current = nextJson;

    if (!enabled || !userId || !storageKey) {
      setValue(initialSnapshot);
      setIsHydratingRemote(false);
      setSaveError("");
      return;
    }

    const localDraft = readLocalDraft<T>(storageKey);
    setValue(localDraft?.payload ? cloneValue(localDraft.payload) : initialSnapshot);
    setSaveError("");
    setIsHydratingRemote(true);

    let active = true;
    void (async () => {
      try {
        const remoteDraft = await apiClient.get<DraftDto | null>(buildDraftPath(entityType, entityId, productId));
        if (!active) {
          return;
        }

        const localUpdatedAt = localDraft?.updatedAt ? new Date(localDraft.updatedAt).getTime() : 0;
        const remoteUpdatedAt = remoteDraft?.updatedAt ? new Date(remoteDraft.updatedAt).getTime() : 0;
        const remotePayloadJson = remoteDraft ? JSON.stringify(remoteDraft.payload) : JSON.stringify(initialSnapshot);
        const chosenPayload =
          remoteDraft && remoteUpdatedAt > localUpdatedAt
            ? (remoteDraft.payload as T)
            : (localDraft?.payload ?? initialSnapshot);

        setValue(cloneValue(chosenPayload));
        lastSavedJsonRef.current =
          remoteDraft && remoteUpdatedAt > localUpdatedAt
            ? JSON.stringify(chosenPayload)
            : remotePayloadJson;

        if (remoteDraft && remoteUpdatedAt > localUpdatedAt && storageKey) {
          writeLocalDraft(storageKey, chosenPayload);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setSaveError(error instanceof Error ? error.message : "No se pudo recuperar el borrador remoto.");
      } finally {
        if (active) {
          setIsHydratingRemote(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [enabled, entityId, entityType, initialSnapshot, productId, storageKey, userId]);

  React.useEffect(() => {
    if (!enabled || !storageKey || !userId || isHydratingRemote) {
      return;
    }
    writeLocalDraft(storageKey, value);
  }, [enabled, isHydratingRemote, storageKey, userId, value]);

  React.useEffect(() => {
    if (!enabled || !userId || !storageKey || isHydratingRemote) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const nextJson = JSON.stringify(value);
      if (nextJson === lastSavedJsonRef.current) {
        return;
      }

      void (async () => {
        try {
          const response = await apiClient.patch<DraftDto>(buildDraftPath(entityType, entityId), {
            payload: value,
            productId
          });
          if (!isMountedRef.current) {
            return;
          }
          lastSavedJsonRef.current = JSON.stringify(response.payload);
          setSaveError("");
          writeLocalDraft(storageKey, response.payload as T);
        } catch (error) {
          if (!isMountedRef.current) {
            return;
          }
          setSaveError(error instanceof Error ? error.message : "No se pudo guardar el borrador remoto.");
        }
      })();
    }, REMOTE_SAVE_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [enabled, entityId, entityType, isHydratingRemote, productId, storageKey, userId, value]);

  const clearDraft = React.useCallback(async () => {
    if (!enabled || !userId || !storageKey) {
      return;
    }

    deleteLocalDraft(storageKey);
    lastSavedJsonRef.current = JSON.stringify(initialSnapshot);

    try {
      await apiClient.del(buildDraftPath(entityType, entityId, productId));
      setSaveError("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo eliminar el borrador remoto.");
    }
  }, [enabled, entityId, entityType, initialSnapshot, productId, storageKey, userId]);

  return {
    value,
    setValue,
    isHydratingRemote,
    saveError,
    clearDraft
  };
}

import * as Y from "yjs";
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
  removeAwarenessStates
} from "y-protocols/awareness";

const MESSAGE_UPDATE = 0;
const MESSAGE_AWARENESS = 1;

type ProviderStatus = "connecting" | "connected" | "disconnected";
type StatusListener = (status: ProviderStatus) => void;
type SyncedListener = () => void;

export type CollaborationDocumentType =
  | "PRODUCT_DESCRIPTION"
  | "STORY_DESCRIPTION"
  | "TASK_DESCRIPTION"
  | "SPRINT_GOAL"
  | "TASK_MESSAGE_BODY";

export type RichDescriptionCollaboration = {
  documentType: CollaborationDocumentType;
  entityId: string;
};

export class ScrumYjsProvider {
  readonly awareness: Awareness;
  private socket: WebSocket | null = null;
  private readonly statusListeners = new Set<StatusListener>();
  private readonly syncedListeners = new Set<SyncedListener>();
  private synced = false;
  private destroyed = false;

  constructor(
    private readonly documentName: string,
    private readonly doc: Y.Doc
  ) {
    this.awareness = new Awareness(doc);
    this.handleDocUpdate = this.handleDocUpdate.bind(this);
    this.handleAwarenessUpdate = this.handleAwarenessUpdate.bind(this);
    this.doc.on("update", this.handleDocUpdate);
    this.awareness.on("update", this.handleAwarenessUpdate);
    this.connect();
  }

  onStatus(listener: StatusListener) {
    this.statusListeners.add(listener);
    listener(this.socket?.readyState === WebSocket.OPEN ? "connected" : "connecting");
    return () => this.statusListeners.delete(listener);
  }

  onSynced(listener: SyncedListener) {
    this.syncedListeners.add(listener);
    if (this.synced) {
      listener();
    }
    return () => this.syncedListeners.delete(listener);
  }

  setLocalUser(user: { id?: string; name?: string; email?: string; color?: string } | null | undefined) {
    if (!user?.id) {
      this.awareness.setLocalState(null);
      return;
    }

    this.awareness.setLocalStateField("user", {
      id: user.id,
      name: user.name || user.email || "Usuario",
      email: user.email,
      color: user.color || colorFromString(user.id)
    });
  }

  destroy() {
    this.destroyed = true;
    removeAwarenessStates(this.awareness, [this.doc.clientID], this);
    this.doc.off("update", this.handleDocUpdate);
    this.awareness.off("update", this.handleAwarenessUpdate);
    const socket = this.socket;
    this.socket = null;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.close();
    } else if (socket?.readyState === WebSocket.CONNECTING) {
      socket.addEventListener("open", () => socket.close(), { once: true });
    }
    this.statusListeners.clear();
    this.syncedListeners.clear();
  }

  private connect() {
    const socket = new WebSocket(buildCollaborationUrl(this.documentName));
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    this.emitStatus("connecting");

    socket.addEventListener("open", () => {
      if (this.destroyed || this.socket !== socket) {
        socket.close();
        return;
      }
      this.emitStatus("connected");
      this.send(MESSAGE_UPDATE, Y.encodeStateAsUpdate(this.doc));
      const localState = this.awareness.getLocalState();
      if (localState) {
        this.send(MESSAGE_AWARENESS, encodeAwarenessUpdate(this.awareness, [this.doc.clientID]));
      }
    });

    socket.addEventListener("message", (event) => {
      if (this.destroyed || this.socket !== socket) {
        return;
      }
      const message = normalizeMessage(event.data);
      if (!message) {
        return;
      }
      if (message.type === MESSAGE_UPDATE) {
        Y.applyUpdate(this.doc, message.payload, this);
        if (!this.synced) {
          this.synced = true;
          this.syncedListeners.forEach((listener) => listener());
        }
        return;
      }
      if (message.type === MESSAGE_AWARENESS) {
        applyAwarenessUpdate(this.awareness, message.payload, this);
      }
    });

    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) {
        return;
      }
      this.emitStatus("disconnected");
      this.socket = null;
      if (!this.destroyed && event.code !== 1008) {
        window.setTimeout(() => this.connect(), 1200);
      }
    });
  }

  private handleDocUpdate(update: Uint8Array, origin: unknown) {
    if (origin === this) {
      return;
    }
    this.send(MESSAGE_UPDATE, update);
  }

  private handleAwarenessUpdate({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) {
    if (origin === this) {
      return;
    }
    const changedClients = added.concat(updated, removed);
    if (changedClients.length > 0) {
      this.send(MESSAGE_AWARENESS, encodeAwarenessUpdate(this.awareness, changedClients));
    }
  }

  private send(type: number, payload: Uint8Array) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(encodeMessage(type, payload));
  }

  private emitStatus(status: ProviderStatus) {
    this.statusListeners.forEach((listener) => listener(status));
  }
}

export function buildDocumentName(collaboration: RichDescriptionCollaboration) {
  return `${collaboration.documentType}:${collaboration.entityId}`;
}

function buildCollaborationUrl(documentName: string) {
  const configuredBase = import.meta.env.VITE_API_BASE as string | undefined;
  const apiBase = configuredBase || `${window.location.protocol}//${window.location.hostname}:5444/api/v1`;
  const url = new URL(apiBase);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/collaboration`;
  url.searchParams.set("document", documentName);
  return url.toString();
}

function normalizeMessage(data: unknown): { type: number; payload: Uint8Array } | null {
  const bytes = data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : data instanceof Blob
      ? null
      : typeof data === "string"
        ? new TextEncoder().encode(data)
        : null;
  if (!bytes || bytes.length === 0) {
    return null;
  }
  return {
    type: bytes[0],
    payload: bytes.slice(1)
  };
}

function encodeMessage(type: number, payload: Uint8Array) {
  const message = new Uint8Array(payload.length + 1);
  message[0] = type;
  message.set(payload, 1);
  return message;
}

function colorFromString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return hslToHex(hue, 72, 48);
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const normalizedSaturation = saturation / 100;
  const normalizedLightness = lightness / 100;
  const chroma = (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const secondLargestComponent = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const lightnessMatch = normalizedLightness - chroma / 2;
  const [red, green, blue] = hue < 60
    ? [chroma, secondLargestComponent, 0]
    : hue < 120
      ? [secondLargestComponent, chroma, 0]
      : hue < 180
        ? [0, chroma, secondLargestComponent]
        : hue < 240
          ? [0, secondLargestComponent, chroma]
          : hue < 300
            ? [secondLargestComponent, 0, chroma]
            : [chroma, 0, secondLargestComponent];

  return `#${[red, green, blue]
    .map((component) => Math.round((component + lightnessMatch) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { SprintStatus } from "@prisma/client";
import { IncomingMessage, Server as HttpServer } from "node:http";
import WebSocket, { RawData, WebSocketServer } from "ws";
import * as Y from "yjs";
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
  removeAwarenessStates
} from "y-protocols/awareness";
import { AuthUser } from "../common/current-user.decorator";
import { PermissionsService } from "../permissions/permissions.service";
import { PrismaService } from "../prisma/prisma.service";

const COLLABORATION_PATH = "/api/v1/collaboration";
const YDOC_FRAGMENT_NAME = "prosemirror";
const MESSAGE_UPDATE = 0;
const MESSAGE_AWARENESS = 1;
const CollaborativeDocumentType = {
  PRODUCT_DESCRIPTION: "PRODUCT_DESCRIPTION",
  STORY_DESCRIPTION: "STORY_DESCRIPTION",
  TASK_DESCRIPTION: "TASK_DESCRIPTION",
  SPRINT_GOAL: "SPRINT_GOAL",
  TASK_MESSAGE_BODY: "TASK_MESSAGE_BODY"
} as const;

type CollaborativeDocumentType = (typeof CollaborativeDocumentType)[keyof typeof CollaborativeDocumentType];

type CollaborationConnection = WebSocket & {
  user?: AuthUser;
  roomName?: string;
  awarenessClientIds?: Set<number>;
  canEditDocument?: boolean;
};

type CollaborationRoom = {
  name: string;
  documentType: CollaborativeDocumentType;
  entityId: string;
  productId?: string;
  ydoc: Y.Doc;
  awareness: Awareness;
  connections: Set<CollaborationConnection>;
};

type AwarenessUpdate = {
  added: number[];
  updated: number[];
  removed: number[];
};

@Injectable()
export class CollaborationService {
  private readonly rooms = new Map<string, Promise<CollaborationRoom>>();
  private server: WebSocketServer | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
    private readonly jwtService: JwtService
  ) {}

  attach(httpServer: HttpServer) {
    if (this.server) {
      return;
    }

    this.server = new WebSocketServer({
      server: httpServer,
      path: COLLABORATION_PATH
    });

    this.server.on("connection", (socket, request) => {
      void this.handleConnection(socket as CollaborationConnection, request);
    });
  }

  private async handleConnection(socket: CollaborationConnection, request: IncomingMessage) {
    try {
      const user = await this.resolveUser(request);
      const documentName = this.resolveDocumentName(request);
      const descriptor = parseDocumentName(documentName);
      const access = await this.resolveDocumentAccess(user, descriptor.documentType, descriptor.entityId);
      const room = await this.getRoom(documentName, descriptor.documentType, descriptor.entityId, access.productId);

      socket.user = user;
      socket.roomName = documentName;
      socket.awarenessClientIds = new Set();
      socket.canEditDocument = access.canEdit;
      room.connections.add(socket);

      socket.send(encodeMessage(MESSAGE_UPDATE, Y.encodeStateAsUpdate(room.ydoc)));
      const awarenessClientIds = Array.from(room.awareness.getStates().keys());
      if (awarenessClientIds.length > 0) {
        socket.send(encodeMessage(MESSAGE_AWARENESS, encodeAwarenessUpdate(room.awareness, awarenessClientIds)));
      }

      socket.on("message", (data) => {
        this.handleMessage(room, socket, data);
      });
      socket.on("close", () => {
        this.releaseConnection(room, socket);
      });
      socket.on("error", () => {
        this.releaseConnection(room, socket);
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Collaboration connection rejected";
      socket.close(1008, reason.slice(0, 120));
    }
  }

  private handleMessage(room: CollaborationRoom, socket: CollaborationConnection, data: RawData) {
    const message = normalizeMessage(data);
    if (!message || message.payload.length === 0 && message.type !== MESSAGE_UPDATE) {
      return;
    }

    if (message.type === MESSAGE_UPDATE) {
      if (!socket.canEditDocument) {
        return;
      }
      Y.applyUpdate(room.ydoc, message.payload, socket);
      return;
    }

    if (message.type === MESSAGE_AWARENESS) {
      applyAwarenessUpdate(room.awareness, message.payload, socket);
      return;
    }

    // Collaborative edits intentionally stay in the live room until the user invokes
    // the existing Save action for the entity. The persisted entity remains the source of truth.
  }

  private releaseConnection(room: CollaborationRoom, socket: CollaborationConnection) {
    if (!room.connections.delete(socket)) {
      return;
    }

    const clientIds = Array.from(socket.awarenessClientIds ?? []);
    if (clientIds.length > 0) {
      removeAwarenessStates(room.awareness, clientIds, socket);
    }
    if (room.connections.size === 0) {
      this.rooms.delete(room.name);
      room.ydoc.destroy();
    }
  }

  private async getRoom(
    name: string,
    documentType: CollaborativeDocumentType,
    entityId: string,
    productId?: string
  ) {
    const existing = this.rooms.get(name);
    if (existing) {
      return existing;
    }

    const roomPromise = this.createRoom(name, documentType, entityId, productId).catch((error) => {
      this.rooms.delete(name);
      throw error;
    });
    this.rooms.set(name, roomPromise);
    return roomPromise;
  }

  private async createRoom(
    name: string,
    documentType: CollaborativeDocumentType,
    entityId: string,
    productId?: string
  ): Promise<CollaborationRoom> {
    const ydoc = new Y.Doc();
    ydoc.getXmlFragment(YDOC_FRAGMENT_NAME);

    const room: CollaborationRoom = {
      name,
      documentType,
      entityId,
      productId,
      ydoc,
      awareness: new Awareness(ydoc),
      connections: new Set()
    };

    room.ydoc.on("update", (update: Uint8Array, origin: unknown) => {
      const sender = isConnection(origin) ? origin : null;
      this.broadcast(room, MESSAGE_UPDATE, update, sender);
    });

    room.awareness.on("update", ({ added, updated, removed }: AwarenessUpdate, origin: unknown) => {
      if (isConnection(origin)) {
        added.concat(updated).forEach((clientId) => origin.awarenessClientIds?.add(clientId));
        removed.forEach((clientId) => origin.awarenessClientIds?.delete(clientId));
      }
      const changedClients = added.concat(updated, removed);
      if (changedClients.length === 0) {
        return;
      }
      this.broadcast(room, MESSAGE_AWARENESS, encodeAwarenessUpdate(room.awareness, changedClients), null);
    });

    return room;
  }

  private broadcast(
    room: CollaborationRoom,
    type: number,
    payload: Uint8Array,
    except: CollaborationConnection | null
  ) {
    const message = encodeMessage(type, payload);
    room.connections.forEach((connection) => {
      if (connection === except || connection.readyState !== WebSocket.OPEN) {
        return;
      }
      connection.send(message);
    });
  }

  private async resolveUser(request: IncomingMessage): Promise<AuthUser> {
    const authHeader = request.headers.authorization;
    const cookies = parseCookieHeader(request.headers.cookie);
    const cookieToken = cookies.accessToken;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : cookieToken;
    if (!token) {
      throw new ForbiddenException("Missing access token");
    }

    const payload = this.jwtService.verify<{ sub?: string }>(token, {
      secret: process.env.JWT_ACCESS_SECRET ?? "change-me-access"
    });
    if (!payload.sub) {
      throw new ForbiddenException("Invalid access token");
    }

    const user = await this.permissionsService.buildAuthUser(payload.sub);
    if (!user) {
      throw new ForbiddenException("User not found");
    }
    return user;
  }

  private resolveDocumentName(request: IncomingMessage) {
    const url = new URL(request.url ?? "", "http://localhost");
    const documentName = url.searchParams.get("document")?.trim();
    if (!documentName) {
      throw new BadRequestException("Missing collaborative document name");
    }
    return documentName;
  }

  private async resolveDocumentAccess(
    user: AuthUser,
    documentType: CollaborativeDocumentType,
    entityId: string
  ): Promise<{ productId?: string; canEdit: boolean }> {
    if (documentType === CollaborativeDocumentType.PRODUCT_DESCRIPTION) {
      const product = await this.prisma.product.findUnique({
        where: { id: entityId },
        select: { id: true, isSystem: true }
      });
      if (!product || product.isSystem) {
        throw new NotFoundException("Product not found");
      }
      if (
        !this.permissionsService.hasSystemPermission(user, "system.administration.products.update")
        && !this.permissionsService.hasProductPermission(user, product.id, "product.admin.workflow.update")
      ) {
        throw new ForbiddenException("Insufficient product permission");
      }
      return { productId: product.id, canEdit: true };
    }

    if (documentType === CollaborativeDocumentType.STORY_DESCRIPTION) {
      const story = await this.prisma.userStory.findUnique({
        where: { id: entityId },
        select: { productId: true }
      });
      if (!story) {
        throw new NotFoundException("Story not found");
      }
      this.permissionsService.assertProductPermission(
        user,
        story.productId,
        "product.admin.story.update",
        "Insufficient product permission"
      );
      return { productId: story.productId, canEdit: true };
    }

    if (documentType === CollaborativeDocumentType.TASK_DESCRIPTION) {
      const task = await this.prisma.task.findUnique({
        where: { id: entityId },
        select: { productId: true, sprintId: true, assigneeId: true }
      });
      if (!task) {
        throw new NotFoundException("Task not found");
      }
      const canEdit = this.canEditTaskDescription(user, task);
      const canRead = canEdit
        || this.permissionsService.hasProductPermission(user, task.productId, "product.admin.story.task.read")
        || await this.permissionsService.canReadTaskInFocused(user.sub, task);
      if (!canRead) {
        throw new ForbiddenException("Insufficient task permission");
      }
      return { productId: task.productId, canEdit };
    }

    if (documentType === CollaborativeDocumentType.SPRINT_GOAL) {
      const sprint = await this.prisma.sprint.findUnique({
        where: { id: entityId },
        select: { productId: true, status: true }
      });
      if (!sprint) {
        throw new NotFoundException("Sprint not found");
      }
      this.permissionsService.assertProductPermission(
        user,
        sprint.productId,
        "product.admin.sprint.update",
        "Insufficient product permission"
      );
      if (sprint.status === SprintStatus.COMPLETED || sprint.status === SprintStatus.CANCELLED) {
        throw new BadRequestException("This sprint is closed and can no longer be modified");
      }
      return { productId: sprint.productId, canEdit: true };
    }

    if (documentType === CollaborativeDocumentType.TASK_MESSAGE_BODY) {
      const message = await this.prisma.taskMessage.findUnique({
        where: { id: entityId },
        select: {
          authorUserId: true,
          task: {
            select: {
              productId: true,
              sprintId: true,
              assigneeId: true
            }
          }
        }
      });
      if (!message) {
        throw new NotFoundException("Message not found");
      }
      if (!message.authorUserId || message.authorUserId !== user.sub) {
        throw new ForbiddenException("Only the message author can edit it");
      }
      this.assertCanComment(user, message.task);
      return { productId: message.task.productId, canEdit: true };
    }

    throw new BadRequestException("Unsupported collaborative document type");
  }

  private assertCanComment(
    user: AuthUser,
    task: { productId: string; sprintId: string | null; assigneeId: string | null }
  ) {
    if (
      this.permissionsService.hasProductPermission(user, task.productId, "product.admin.story.task.update")
      || this.permissionsService.hasProductPermission(user, task.productId, "product.focused.update")
    ) {
      return;
    }

    if (!task.sprintId) {
      throw new ForbiddenException("Task comments require focused visibility or administrative update permission");
    }

    if (
      task.assigneeId === user.sub
      && this.permissionsService.hasProductPermission(user, task.productId, "product.focused.acquiredByMe.comment")
    ) {
      return;
    }

    if (
      task.assigneeId
      && this.permissionsService.hasProductPermission(user, task.productId, "product.focused.acquiredByOther.comment")
    ) {
      return;
    }

    throw new ForbiddenException("Insufficient permission to comment on this task");
  }

  private canEditTaskDescription(
    user: AuthUser,
    task: { productId: string; sprintId: string | null; assigneeId: string | null }
  ) {
    return this.permissionsService.hasProductPermission(user, task.productId, "product.admin.story.task.update")
      || Boolean(task.sprintId && this.permissionsService.hasProductPermission(user, task.productId, "product.focused.update"));
  }

}

function parseDocumentName(value: string) {
  const separatorIndex = value.indexOf(":");
  const rawType = separatorIndex >= 0 ? value.slice(0, separatorIndex) : value;
  const entityId = separatorIndex >= 0 ? value.slice(separatorIndex + 1) : "";

  if (!entityId.trim()) {
    throw new BadRequestException("Collaborative document entity id is required");
  }
  if (!(rawType in CollaborativeDocumentType)) {
    throw new BadRequestException(`Unsupported collaborative document type: ${rawType}`);
  }

  return {
    documentType: CollaborativeDocumentType[rawType as keyof typeof CollaborativeDocumentType],
    entityId
  };
}

function normalizeMessage(data: RawData): { type: number; payload: Uint8Array } | null {
  const bytes = data instanceof Buffer
    ? new Uint8Array(data)
    : Array.isArray(data)
      ? new Uint8Array(Buffer.concat(data))
      : new Uint8Array(data as ArrayBuffer);
  if (bytes.length === 0) {
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

function parseCookieHeader(header: string | undefined) {
  const result: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key) {
      result[key] = decodeURIComponent(value);
    }
  }
  return result;
}

function isConnection(value: unknown): value is CollaborationConnection {
  return value instanceof WebSocket;
}

import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request, Response } from "express";
import { ApiKeysService } from "../api-keys/api-keys.service";
import { TasksService } from "../tasks/tasks.service";

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};

type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

type TaskMessageNode = {
  id: string;
  parentMessageId: string | null;
  body: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  authorUser?: {
    id: string;
    name: string;
    email: string;
    role?: string;
  } | null;
  derivedTasks?: Array<{
    id: string;
    title: string;
    status: string;
    updatedAt: string | Date;
  }>;
  replies: TaskMessageNode[];
};

type FlatMessageNode = {
  depth: number;
  id: string;
  parentMessageId: string | null;
  body: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  authorUser?: {
    id: string;
    name: string;
    email: string;
    role?: string;
  } | null;
  derivedTasks: Array<{
    id: string;
    title: string;
    status: string;
    updatedAt: string | Date;
  }>;
};

const MCP_PROTOCOL_VERSION = "2025-03-26";
const READ_TASKS_TYPE_TO_STATUS = {
  todo: "Todo",
  "in progress": "In Progress",
  blocked: "Blocked",
  done: "Done"
} as const;

const DEFAULT_READ_TASKS_STATUSES = Object.values(READ_TASKS_TYPE_TO_STATUS);

@Injectable()
export class McpService {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly tasksService: TasksService
  ) {}

  async handleHttp(req: Request, res: Response) {
    try {
      const apiKey = this.extractApiKey(req);
      const user = await this.apiKeysService.authenticate(apiKey);

      if (req.method !== "POST") {
        return res.status(405).json({
          error: "MCP HTTP endpoint only accepts POST requests"
        });
      }

      const payload = req.body;
      if (Array.isArray(payload)) {
        const responses = await Promise.all(payload.map((entry) => this.handleJsonRpcRequest(entry, user)));
        const filtered = responses.filter((entry) => entry !== null);
        return res.json(filtered);
      }

      const response = await this.handleJsonRpcRequest(payload, user);
      if (response === null) {
        return res.status(204).send();
      }

      return res.json(response);
    } catch (error) {
      const status = error instanceof UnauthorizedException ? 401 : 400;
      const message = error instanceof Error ? error.message : "Invalid MCP request";
      return res.status(status).json({
        error: message
      });
    }
  }

  private async handleJsonRpcRequest(request: JsonRpcRequest, user: Awaited<ReturnType<ApiKeysService["authenticate"]>>) {
    const id = request?.id ?? null;

    if (!request || typeof request !== "object" || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
      return this.jsonRpcError(id, -32600, "Invalid Request");
    }

    try {
      switch (request.method) {
        case "initialize":
          return this.jsonRpcResult(id, {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {
              tools: {
                listChanged: false
              }
            },
            serverInfo: {
              name: "scrum-mcp",
              version: "0.1.0"
            }
          });
        case "notifications/initialized":
          return null;
        case "ping":
          return this.jsonRpcResult(id, {});
        case "tools/list":
          return this.jsonRpcResult(id, {
            tools: [
              {
                name: "readTasks",
                description: "Devuelve tareas visibles en Focused en formato compacto, opcionalmente filtradas por estado.",
                inputSchema: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    type: {
                      type: "string",
                      enum: Object.keys(READ_TASKS_TYPE_TO_STATUS),
                      description: "Filtro opcional por estado. Valores: todo, in progress, blocked, done."
                    },
                    offset: {
                      type: "number",
                      description: "Offset sobre el listado visible de tareas."
                    },
                    limit: {
                      type: "number",
                      description: "Cantidad maxima de tareas visibles a devolver. Default: 50."
                    }
                  }
                }
              },
              {
                name: "take_task",
                description: "Se asigna al usuario autenticado una tarea visible sin responsable.",
                inputSchema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["taskId"],
                  properties: {
                    taskId: {
                      type: "string",
                      description: "ID de la tarea a tomar."
                    }
                  }
                }
              },
              {
                name: "change_task_status",
                description: "Cambia el estado de una tarea asignada al usuario autenticado.",
                inputSchema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["taskId", "status"],
                  properties: {
                    taskId: {
                      type: "string",
                      description: "ID de la tarea."
                    },
                    status: {
                      type: "string",
                      description: "Nuevo estado, por ejemplo Todo, In Progress o Done."
                    },
                    actualHours: {
                      type: "number",
                      description: "Horas reales opcionales al cerrar o actualizar la tarea."
                    }
                  }
                }
              },
              {
                name: "comment_task",
                description: "Agrega un comentario en una tarea asignada al usuario autenticado.",
                inputSchema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["taskId", "body"],
                  properties: {
                    taskId: {
                      type: "string",
                      description: "ID de la tarea."
                    },
                    body: {
                      type: "string",
                      description: "Comentario a publicar."
                    },
                    parentMessageId: {
                      type: "string",
                      description: "ID del comentario padre si es una respuesta."
                    }
                  }
                }
              },
              {
                name: "get_task_details",
                description: "Devuelve detalles profundos de una tarea, con historia, tarea y los ultimos 4 mensajes.",
                inputSchema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["taskId"],
                  properties: {
                    taskId: {
                      type: "string",
                      description: "ID de la tarea."
                    }
                  }
                }
              },
              {
                name: "get_task_history",
                description: "Devuelve el historial de mensajes de una tarea como arbol ASCII usando offset y limit sobre la vista plana.",
                inputSchema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["taskId"],
                  properties: {
                    taskId: {
                      type: "string",
                      description: "ID de la tarea."
                    },
                    offset: {
                      type: "number",
                      description: "Offset sobre el historial plano."
                    },
                    limit: {
                      type: "number",
                      description: "Cantidad maxima de mensajes a devolver."
                    }
                  }
                }
              },
              {
                name: "get_task_hierarchy",
                description: "Devuelve la jerarquia completa de una tarea como arbol ASCII, marcando cual fue la tarea consultada.",
                inputSchema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["taskId"],
                  properties: {
                    taskId: {
                      type: "string",
                      description: "ID de la tarea."
                    }
                  }
                }
              },
              {
                name: "respond_message",
                description: "Responde a un mensaje existente dentro de una tarea asignada al usuario autenticado.",
                inputSchema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["messageId", "response"],
                  properties: {
                    messageId: {
                      type: "string",
                      description: "ID del mensaje a responder."
                    },
                    response: {
                      type: "string",
                      description: "Respuesta a publicar."
                    }
                  }
                }
              }
            ]
          });
        case "tools/call":
          return this.jsonRpcResult(id, await this.callTool(request.params ?? {}, user));
        default:
          return this.jsonRpcError(id, -32601, "Method not found");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unhandled MCP error";
      return this.jsonRpcError(id, -32000, message);
    }
  }

  private async callTool(
    params: Record<string, unknown>,
    user: Awaited<ReturnType<ApiKeysService["authenticate"]>>
  ): Promise<McpToolResult> {
    const name = typeof params.name === "string" ? params.name : "";
    const args = (params.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>;

    switch (name) {
      case "readTasks": {
        const requestedType = this.readOptionalTaskTypeArgument(args, "type");
        const offset = this.readOptionalIntegerArgument(args, "offset") ?? 0;
        const requestedLimit = this.readOptionalIntegerArgument(args, "limit");
        if (offset < 0) {
          throw new BadRequestException("offset must be >= 0");
        }
        if (requestedLimit !== undefined && requestedLimit < 1) {
          throw new BadRequestException("limit must be >= 1");
        }

        const board = await this.tasksService.listFocused(user, { includeLinkedContext: true });
        const normalizedBoard = this.normalizeFocusedBoard(board);
        const flattenedTasks = this.flattenFocusedBoard(normalizedBoard);
        const allowedStatuses = requestedType
          ? new Set<string>([READ_TASKS_TYPE_TO_STATUS[requestedType]])
          : new Set<string>(DEFAULT_READ_TASKS_STATUSES);
        const filteredTasks = flattenedTasks.filter((entry) => allowedStatuses.has(entry.columnName));
        const total = filteredTasks.length;
        const limit = requestedLimit ?? 50;
        const paginatedTasks = filteredTasks.slice(offset, offset + limit);
        const returned = paginatedTasks.length;
        const hasMore = offset + returned < total;

        return {
          content: [
            {
              type: "text",
              text: `Se devolvieron ${returned} de ${total} tareas visibles${requestedType ? ` con type=${requestedType}` : ""}. offset=${offset} limit=${limit} hasMore=${hasMore}`
            }
          ],
          structuredContent: {
            filter: {
              type: requestedType ?? null,
              statuses: Array.from(allowedStatuses)
            },
            pagination: {
              offset,
              limit,
              total,
              returned,
              hasMore
            },
            tasks: paginatedTasks.map((entry) => this.serializeFocusedTaskEntry(entry))
          }
        };
      }
      case "take_task": {
        const taskId = this.readStringArgument(args, "taskId");
        const detail = await this.tasksService.getDetail(taskId, user);
        if (!detail.sprintId || detail.sprint?.status !== "ACTIVE") {
          throw new ForbiddenException("Only tasks in the active focused board can be taken via MCP");
        }
        if (detail.assigneeId) {
          throw new ForbiddenException("Only unassigned tasks can be taken via MCP");
        }
        const updated = await this.tasksService.assign(taskId, user.sub, undefined, user);
        return {
          content: [
            {
              type: "text",
              text: `La tarea ${updated.id} quedo asignada a ${user.name}.`
            }
          ],
          structuredContent: {
            task: updated
          }
        };
      }
      case "change_task_status": {
        const taskId = this.readStringArgument(args, "taskId");
        const status = this.readStringArgument(args, "status");
        const detail = await this.tasksService.getDetail(taskId, user);
        if (detail.assigneeId !== user.sub) {
          throw new ForbiddenException("Only tasks assigned to the current user can change status via MCP");
        }
        const actualHours = this.readOptionalNumberArgument(args, "actualHours");
        const updated = await this.tasksService.updateStatus(taskId, status, user, actualHours);
        return {
          content: [
            {
              type: "text",
              text: `La tarea ${updated.id} cambio a estado ${updated.status}.`
            }
          ],
          structuredContent: {
            task: updated
          }
        };
      }
      case "comment_task": {
        const taskId = this.readStringArgument(args, "taskId");
        const body = this.readStringArgument(args, "body");
        const detail = await this.tasksService.getDetail(taskId, user);
        if (detail.assigneeId !== user.sub) {
          throw new ForbiddenException("Only tasks assigned to the current user can receive comments via MCP");
        }
        const parentMessageId = this.readOptionalStringArgument(args, "parentMessageId");
        const message = await this.tasksService.addMessage(taskId, { body, parentMessageId }, user);
        return {
          content: [
            {
              type: "text",
              text: `Se agrego un comentario a la tarea ${taskId}.`
            }
          ],
          structuredContent: {
            message
          }
        };
      }
      case "get_task_details": {
        const taskId = this.readStringArgument(args, "taskId");
        const detail = await this.tasksService.getDetail(taskId, user);
        const history = this.flattenMessages(detail.conversation as TaskMessageNode[]);
        const recentMessages = history.slice(-4);
        const hasMoreMessages = history.length > recentMessages.length;
        const summary = {
          story: detail.story
            ? {
                id: detail.story.id,
                title: detail.story.title,
                description: detail.story.description ?? null,
                storyPoints: detail.story.storyPoints,
                status: detail.story.status,
                backlogRank: detail.story.backlogRank ?? null
              }
            : null,
          task: {
            id: detail.id,
            title: detail.title,
            description: detail.description,
            status: detail.status,
            assigneeId: detail.assigneeId,
            assignee: detail.assignee ?? null,
            sprintId: detail.sprintId,
            sprint: detail.sprint ?? null,
            product: detail.product ?? null,
            parentTaskId: detail.parentTask?.id ?? detail.parentTaskId ?? null,
            parentTask: detail.parentTask ?? null,
            parentMessageId: detail.sourceMessage?.id ?? detail.sourceMessageId ?? null,
            parentMessage: detail.sourceMessage ?? null,
            childSummary: detail.childSummary,
            childTasks: (detail.childTasks ?? []).map((childTask) => ({
              id: childTask.id,
              title: childTask.title,
              status: childTask.status,
              descriptionPreview: this.toSingleLine(childTask.description, 250)
            })),
            unfinishedSprintCount: detail.unfinishedSprintCount ?? 0
          },
          latestMessages: recentMessages.map((message) => this.serializeFlatMessage(message)),
          latestMessagesInfo: {
            returned: recentMessages.length,
            total: history.length,
            hasMore: hasMoreMessages
          }
        };

        return {
          content: [
            {
              type: "text",
              text: this.buildTaskDetailsText(summary)
            }
          ],
          structuredContent: summary
        };
      }
      case "get_task_history": {
        const taskId = this.readStringArgument(args, "taskId");
        const offset = this.readOptionalIntegerArgument(args, "offset") ?? 0;
        const limit = this.readOptionalIntegerArgument(args, "limit") ?? 50;
        if (offset < 0 || limit < 1) {
          throw new BadRequestException("offset must be >= 0 and limit must be >= 1");
        }
        const historyTree = (await this.tasksService.listMessages(taskId, user)) as TaskMessageNode[];
        const history = this.flattenMessages(historyTree);
        const slice = history.slice(offset, offset + limit);
        const ascii = this.renderAsciiHistory(slice, history.length, offset, limit);

        return {
          content: [
            {
              type: "text",
              text: ascii
            }
          ],
          structuredContent: {
            taskId,
            offset,
            limit,
            total: history.length,
            hasMore: offset + slice.length < history.length,
            messages: slice.map((message) => this.serializeFlatMessage(message)),
            ascii
          }
        };
      }
      case "get_task_hierarchy": {
        const taskId = this.readStringArgument(args, "taskId");
        const hierarchy = await this.tasksService.getHierarchy(taskId, user);
        const ascii = this.renderAsciiTaskHierarchy(hierarchy);

        return {
          content: [
            {
              type: "text",
              text: ascii
            }
          ],
          structuredContent: {
            ...hierarchy,
            ascii
          }
        };
      }
      case "respond_message": {
        const messageId = this.readStringArgument(args, "messageId");
        const response = this.readStringArgument(args, "response");
        const message = await this.tasksService.getMessageContext(messageId, user);
        if (message.task.assigneeId !== user.sub) {
          throw new ForbiddenException("Only messages from tasks assigned to the current user can be answered via MCP");
        }
        const created = await this.tasksService.addMessage(
          message.task.id,
          { body: response, parentMessageId: message.id },
          user
        );
        return {
          content: [
            {
              type: "text",
              text: `Se respondio el mensaje ${message.id} en la tarea ${message.task.id}.`
            }
          ],
          structuredContent: {
            taskId: message.task.id,
            parentMessageId: message.id,
            message: created
          }
        };
      }
      default:
        throw new BadRequestException(`Unknown tool: ${name}`);
    }
  }

  private extractApiKey(req: Request) {
    const headerValue = req.header("x-api-key") ?? req.header("X-API-Key");
    if (headerValue) {
      return headerValue;
    }

    const authorization = req.header("authorization");
    if (authorization?.startsWith("Bearer ")) {
      return authorization.slice(7);
    }

    return undefined;
  }

  private readStringArgument(args: Record<string, unknown>, key: string) {
    const value = args[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new BadRequestException(`Missing argument: ${key}`);
    }
    return value.trim();
  }

  private readOptionalStringArgument(args: Record<string, unknown>, key: string) {
    const value = args[key];
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    if (typeof value !== "string") {
      throw new BadRequestException(`Invalid argument: ${key}`);
    }
    return value.trim();
  }

  private readOptionalNumberArgument(args: Record<string, unknown>, key: string) {
    const value = args[key];
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new BadRequestException(`Invalid argument: ${key}`);
    }
    return value;
  }

  private readOptionalIntegerArgument(args: Record<string, unknown>, key: string) {
    const value = this.readOptionalNumberArgument(args, key);
    if (value === undefined) {
      return undefined;
    }
    if (!Number.isInteger(value)) {
      throw new BadRequestException(`Invalid argument: ${key}`);
    }
    return value;
  }

  private readOptionalTaskTypeArgument(
    args: Record<string, unknown>,
    key: string
  ): keyof typeof READ_TASKS_TYPE_TO_STATUS | undefined {
    const value = this.readOptionalStringArgument(args, key);
    if (value === undefined) {
      return undefined;
    }

    const normalizedValue = value
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ") as keyof typeof READ_TASKS_TYPE_TO_STATUS;

    if (!(normalizedValue in READ_TASKS_TYPE_TO_STATUS)) {
      throw new BadRequestException(
        `Invalid argument: ${key}. Expected one of ${Object.keys(READ_TASKS_TYPE_TO_STATUS).join(", ")}`
      );
    }

    return normalizedValue;
  }

  private normalizeFocusedBoard(board: Awaited<ReturnType<TasksService["listFocused"]>>) {
    return {
      ...board,
      columns: board.columns.map((column) => ({
        ...column,
        tasks: column.tasks.map((task) => ({
          ...task,
          parentMessageId: task.sourceMessage?.id ?? task.sourceMessageId ?? null,
          parentMessage: task.sourceMessage ?? null
        }))
      }))
    };
  }

  private flattenFocusedBoard(board: ReturnType<McpService["normalizeFocusedBoard"]>) {
    return board.columns.flatMap((column) =>
      column.tasks.map((task) => ({
        columnName: column.name,
        task
      }))
    );
  }

  private serializeFocusedTaskEntry(entry: ReturnType<McpService["flattenFocusedBoard"]>[number]) {
    const { columnName, task } = entry;
    const assignee = task.assignee as ({ id: string; name: string; email?: string | null } | null);
    const story = task.story as ({ id: string; title: string; status?: string | null } | null);
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      type: this.toReadTasksType(columnName),
      boardOrder: task.boardOrder,
      effortPoints: task.effortPoints ?? null,
      estimatedHours: task.estimatedHours ?? null,
      remainingHours: task.remainingHours ?? null,
      actualHours: task.actualHours ?? null,
      unfinishedSprintCount: task.unfinishedSprintCount ?? 0,
      assigneeId: task.assigneeId,
      assignee: assignee
        ? {
            id: assignee.id,
            name: assignee.name,
            email: assignee.email ?? null
          }
        : null,
      story: story
        ? {
            id: story.id,
            title: story.title,
            status: story.status ?? null
          }
        : null,
      sprint: task.sprint
        ? {
            id: task.sprint.id,
            name: task.sprint.name,
            status: task.sprint.status
          }
        : null,
      product: task.product
        ? {
            id: task.product.id,
            name: task.product.name,
            key: task.product.key
          }
        : null,
      parentTaskId: task.parentTask?.id ?? task.parentTaskId ?? null,
      parentTask: task.parentTask
        ? {
            id: task.parentTask.id,
            title: task.parentTask.title,
            status: task.parentTask.status
          }
        : null,
      parentMessageId: task.parentMessageId ?? null
    };
  }

  private toReadTasksType(status: string) {
    const entry = Object.entries(READ_TASKS_TYPE_TO_STATUS).find(([, value]) => value === status);
    return entry?.[0] ?? null;
  }

  private flattenMessages(messages: TaskMessageNode[], depth: number = 0): FlatMessageNode[] {
    const flattened: FlatMessageNode[] = [];
    for (const message of messages) {
      flattened.push({
        depth,
        id: message.id,
        parentMessageId: message.parentMessageId,
        body: message.body,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        authorUser: message.authorUser ?? null,
        derivedTasks: message.derivedTasks ?? []
      });
      flattened.push(...this.flattenMessages(message.replies ?? [], depth + 1));
    }
    return flattened;
  }

  private renderAsciiHistory(messages: FlatMessageNode[], total: number, offset: number, limit: number) {
    if (messages.length === 0) {
      return `Historial vacio. total=${total} offset=${offset} limit=${limit}`;
    }

    const lines = [
      `task_history total=${total} offset=${offset} limit=${limit} returned=${messages.length}`
    ];

    for (const message of messages) {
      const indent = message.depth > 0 ? `${"|  ".repeat(message.depth - 1)}|- ` : "";
      const author = message.authorUser?.name ?? message.authorUser?.email ?? "Sistema";
      const preview = this.toSingleLine(message.body, 160);
      const derivedSuffix =
        message.derivedTasks.length > 0
          ? ` | derived=${message.derivedTasks.map((task) => `${task.id}:${task.status}`).join(", ")}`
          : "";
      lines.push(
        `${indent}[${message.id}] ${author} @ ${this.formatTimestamp(message.createdAt)}${derivedSuffix}`
      );
      lines.push(`${indent}${preview}`);
    }

    if (offset + messages.length < total) {
      lines.push(`... hay mas mensajes (${total - (offset + messages.length)} restantes)`);
    }

    return lines.join("\n");
  }

  private buildTaskDetailsText(summary: {
    story: Record<string, unknown> | null;
    task: Record<string, unknown>;
    latestMessages: Array<Record<string, unknown>>;
    latestMessagesInfo: { returned: number; total: number; hasMore: boolean };
  }) {
    const story = summary.story as {
      title?: string;
      status?: string;
      storyPoints?: number;
      description?: string | null;
    } | null;
    const task = summary.task as {
      id: string;
      title: string;
      status: string;
      description?: string | null;
      parentTask?: { id: string; title: string; status: string } | null;
      parentMessage?: { id: string; body: string } | null;
      childTasks?: Array<{ id: string; title: string; status: string; descriptionPreview: string }>;
    };

    const lines = [
      "Historia:",
      story
        ? `- ${story.title} | status=${story.status} | storyPoints=${story.storyPoints ?? "-"} | description=${this.toSingleLine(story.description as string | null | undefined, 160)}`
        : "- Sin historia asociada",
      "Tarea:",
      `- ${task.id} | ${task.title} | status=${task.status} | description=${this.toSingleLine(task.description, 160)}`,
      `- parentTask=${task.parentTask ? `${task.parentTask.id} ${task.parentTask.title} (${task.parentTask.status})` : "none"}`,
      `- parentMessage=${task.parentMessage ? `${task.parentMessage.id} ${this.toSingleLine(task.parentMessage.body, 120)}` : "none"}`,
      `- childTasks=${task.childTasks?.length ?? 0}`,
      `Ultimos mensajes (${summary.latestMessagesInfo.returned}/${summary.latestMessagesInfo.total}):`
    ];

    if ((task.childTasks?.length ?? 0) > 0) {
      lines.splice(
        6,
        0,
        ...task.childTasks!.map(
          (childTask) =>
            `- child=[${childTask.id}] ${childTask.title} | status=${childTask.status} | description=${childTask.descriptionPreview}`
        )
      );
    }

    for (const message of summary.latestMessages as Array<{
      id: string;
      depth: number;
      author: string;
      createdAt: string;
      bodyPreview: string;
    }>) {
      lines.push(`- [${message.id}] depth=${message.depth} ${message.author} @ ${message.createdAt}: ${message.bodyPreview}`);
    }

    lines.push(summary.latestMessagesInfo.hasMore ? "- Hay mas mensajes disponibles." : "- No hay mas mensajes.");
    return lines.join("\n");
  }

  private renderAsciiTaskHierarchy(hierarchy: Awaited<ReturnType<TasksService["getHierarchy"]>>) {
    if (!hierarchy.tree) {
      return `task_hierarchy taskId=${hierarchy.taskId} rootTaskId=${hierarchy.rootTaskId}\n(no se encontro la jerarquia)`;
    }

    const lines = [`task_hierarchy taskId=${hierarchy.taskId} rootTaskId=${hierarchy.rootTaskId}`];

    const walk = (
      node: NonNullable<Awaited<ReturnType<TasksService["getHierarchy"]>>["tree"]>,
      prefix: string,
      isLast: boolean,
      depth: number
    ) => {
      const connector = depth === 0 ? "" : isLast ? "\\- " : "|- ";
      const marker = node.id === hierarchy.taskId ? " <consultada>" : "";
      lines.push(`${prefix}${connector}[${node.id}] ${node.title} | status=${node.status}${marker}`);

      const childPrefix = depth === 0 ? "" : `${prefix}${isLast ? "   " : "|  "}`;
      node.children.forEach((child, index) => {
        walk(child, childPrefix, index === node.children.length - 1, depth + 1);
      });
    };

    walk(hierarchy.tree, "", true, 0);
    return lines.join("\n");
  }

  private serializeFlatMessage(message: FlatMessageNode) {
    return {
      id: message.id,
      depth: message.depth,
      parentMessageId: message.parentMessageId,
      author: message.authorUser?.name ?? message.authorUser?.email ?? "Sistema",
      authorUser: message.authorUser ?? null,
      createdAt: this.formatTimestamp(message.createdAt),
      updatedAt: this.formatTimestamp(message.updatedAt),
      body: message.body,
      bodyPreview: this.toSingleLine(message.body, 160),
      derivedTasks: message.derivedTasks
    };
  }

  private formatTimestamp(value: string | Date) {
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
  }

  private toSingleLine(value: string | null | undefined, maxLength: number) {
    const normalized = (value ?? "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "(sin contenido)";
    }
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
  }

  private jsonRpcResult(id: JsonRpcId, result: unknown) {
    return {
      jsonrpc: "2.0",
      id,
      result
    };
  }

  private jsonRpcError(id: JsonRpcId, code: number, message: string) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message
      }
    };
  }
}

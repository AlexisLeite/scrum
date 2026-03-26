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

const MCP_PROTOCOL_VERSION = "2025-03-26";

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
                name: "list_pending_tasks",
                description: "Lista el tablero Focused visible para el usuario autenticado por API key.",
                inputSchema: {
                  type: "object",
                  additionalProperties: false,
                  properties: {}
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
      case "list_pending_tasks": {
        const board = await this.tasksService.listFocused(user);
        return {
          content: [
            {
              type: "text",
              text: `Se devolvieron ${board.columns.reduce((total, column) => total + column.tasks.length, 0)} tareas visibles en Focused.`
            }
          ],
          structuredContent: board
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

import { Controller, Body, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuthUser, CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { GenerateMarkdownDto } from "./ai.dto";
import { AiService } from "./ai.service";

@Controller("ai")
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("markdown/generate")
  async generateMarkdown(
    @CurrentUser() user: AuthUser,
    @Body() dto: GenerateMarkdownDto,
    @Res() res: Response
  ) {
    try {
      const session = await this.aiService.createMarkdownGenerationSession(user, dto, (chunk) => {
        if (!res.writableEnded) {
          res.write(`${JSON.stringify({ type: "chunk", chunk })}\n`);
        }
      });

      res.status(HttpStatus.OK);
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      if (typeof res.flushHeaders === "function") {
        res.flushHeaders();
      }

      let clientDisconnected = false;
      const handleClose = () => {
        clientDisconnected = true;
        session.cancel("El cliente cerro la conexion.");
      };

      res.on("close", handleClose);

      try {
        const content = await session.run();
        if (!clientDisconnected && !res.writableEnded) {
          res.write(`${JSON.stringify({ type: "done", content })}\n`);
        }
      } catch (error) {
        if (!clientDisconnected && !res.writableEnded) {
          const message = error instanceof Error ? error.message : "No se pudo generar contenido con IA.";
          res.write(`${JSON.stringify({ type: "error", message })}\n`);
        }
      } finally {
        res.off("close", handleClose);
        if (!res.writableEnded) {
          res.end();
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo preparar la generacion markdown.";
      if (!res.headersSent) {
        res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ message });
        return;
      }

      if (!res.writableEnded) {
        res.write(`${JSON.stringify({ type: "error", message })}\n`);
        res.end();
      }
    }
  }
}

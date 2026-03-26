import express from "express";
import { createHttpApp } from "./bootstrap";
import { McpService } from "./mcp/mcp.service";

async function bootstrap() {
  const app = await createHttpApp();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  const mcpPort = Number(process.env.MCP_PORT ?? 3001);
  const mcpService = app.get(McpService);
  const mcpServer = express();
  mcpServer.use(express.json({ limit: "1mb" }));
  mcpServer.all("/", (req, res) => {
    void mcpService.handleHttp(req, res);
  });
  await new Promise<void>((resolve) => {
    mcpServer.listen(mcpPort, () => resolve());
  });
}

bootstrap();

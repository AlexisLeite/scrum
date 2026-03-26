import { Module } from "@nestjs/common";
import { ApiKeysModule } from "../api-keys/api-keys.module";
import { TasksModule } from "../tasks/tasks.module";
import { McpService } from "./mcp.service";

@Module({
  imports: [ApiKeysModule, TasksModule],
  providers: [McpService],
  exports: [McpService]
})
export class McpModule {}

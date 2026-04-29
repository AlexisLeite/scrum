import { Module } from "@nestjs/common";
import { ApiKeysModule } from "../api-keys/api-keys.module";
import { MediaModule } from "../media/media.module";
import { TasksModule } from "../tasks/tasks.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [ApiKeysModule, MediaModule, TasksModule],
  controllers: [ReportsController],
  providers: [ReportsService]
})
export class ReportsModule {}

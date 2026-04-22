import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { TasksModule } from "../tasks/tasks.module";
import { SprintsController } from "./sprints.controller";
import { SprintsService } from "./sprints.service";

@Module({
  imports: [AiModule, TasksModule],
  controllers: [SprintsController],
  providers: [SprintsService],
  exports: [SprintsService]
})
export class SprintsModule {}

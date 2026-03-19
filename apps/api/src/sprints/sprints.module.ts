import { Module } from "@nestjs/common";
import { TasksModule } from "../tasks/tasks.module";
import { SprintsController } from "./sprints.controller";
import { SprintsService } from "./sprints.service";

@Module({
  imports: [TasksModule],
  controllers: [SprintsController],
  providers: [SprintsService],
  exports: [SprintsService]
})
export class SprintsModule {}

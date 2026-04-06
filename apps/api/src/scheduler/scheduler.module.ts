import { Module } from "@nestjs/common";
import { DraftsModule } from "../drafts/drafts.module";
import { SchedulerService } from "./scheduler.service";

@Module({
  imports: [DraftsModule],
  providers: [SchedulerService],
  exports: [SchedulerService]
})
export class SchedulerModule {}

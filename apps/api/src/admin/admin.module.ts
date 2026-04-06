import { Module } from "@nestjs/common";
import { ActivityModule } from "../activity/activity.module";
import { BackupsModule } from "../backups/backups.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [ActivityModule, BackupsModule],
  controllers: [AdminController],
  providers: [AdminService]
})
export class AdminModule {}

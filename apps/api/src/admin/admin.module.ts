import { Module } from "@nestjs/common";
import { ActivityModule } from "../activity/activity.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [ActivityModule],
  controllers: [AdminController],
  providers: [AdminService]
})
export class AdminModule {}

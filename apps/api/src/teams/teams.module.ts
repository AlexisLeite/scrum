import { Module } from "@nestjs/common";
import { ActivityModule } from "../activity/activity.module";
import { TeamsController } from "./teams.controller";
import { TeamsService } from "./teams.service";

@Module({
  imports: [ActivityModule],
  controllers: [TeamsController],
  providers: [TeamsService]
})
export class TeamsModule {}

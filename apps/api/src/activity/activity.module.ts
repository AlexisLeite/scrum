import { Global, Module } from "@nestjs/common";
import { TeamScopeService } from "../common/team-scope.service";
import { ActivityController } from "./activity.controller";
import { ActivityService } from "./activity.service";

@Global()
@Module({
  controllers: [ActivityController],
  providers: [ActivityService, TeamScopeService],
  exports: [ActivityService, TeamScopeService]
})
export class ActivityModule {}


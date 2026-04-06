import { Module } from "@nestjs/common";
import { TeamScopeService } from "../common/team-scope.service";
import { ReferencesController } from "./references.controller";
import { ReferencesService } from "./references.service";

@Module({
  controllers: [ReferencesController],
  providers: [ReferencesService, TeamScopeService]
})
export class ReferencesModule {}

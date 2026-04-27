import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PermissionsModule } from "../permissions/permissions.module";
import { PrismaModule } from "../prisma/prisma.module";
import { CollaborationService } from "./collaboration.service";

@Module({
  imports: [JwtModule.register({}), PermissionsModule, PrismaModule],
  providers: [CollaborationService],
  exports: [CollaborationService]
})
export class CollaborationModule {}

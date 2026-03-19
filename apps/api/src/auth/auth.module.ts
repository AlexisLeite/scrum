import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { APP_GUARD } from "@nestjs/core";
import { ActivityModule } from "../activity/activity.module";
import { RolesGuard } from "../common/roles.guard";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  imports: [
    ActivityModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET ?? "change-me-access"
    })
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: APP_GUARD,
      useClass: RolesGuard
    }
  ],
  exports: [AuthService, JwtModule]
})
export class AuthModule {}

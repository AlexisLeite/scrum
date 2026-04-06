import { Module } from "@nestjs/common";
import { BackupsService } from "./backups.service";

@Module({
  providers: [BackupsService],
  exports: [BackupsService]
})
export class BackupsModule {}

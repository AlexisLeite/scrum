import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminModule } from "./admin/admin.module";
import { ActivityModule } from "./activity/activity.module";
import { ApiKeysModule } from "./api-keys/api-keys.module";
import { AuthModule } from "./auth/auth.module";
import { DraftsModule } from "./drafts/drafts.module";
import { IndicatorsModule } from "./indicators/indicators.module";
import { MediaModule } from "./media/media.module";
import { McpModule } from "./mcp/mcp.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProductsModule } from "./products/products.module";
import { ReferencesModule } from "./references/references.module";
import { SchedulerModule } from "./scheduler/scheduler.module";
import { SprintsModule } from "./sprints/sprints.module";
import { StoriesModule } from "./stories/stories.module";
import { TasksModule } from "./tasks/tasks.module";
import { TeamsModule } from "./teams/teams.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"]
    }),
    PrismaModule,
    ActivityModule,
    ApiKeysModule,
    AdminModule,
    AuthModule,
    DraftsModule,
    MediaModule,
    TeamsModule,
    ProductsModule,
    ReferencesModule,
    SchedulerModule,
    StoriesModule,
    TasksModule,
    SprintsModule,
    IndicatorsModule,
    McpModule
  ]
})
export class AppModule {}

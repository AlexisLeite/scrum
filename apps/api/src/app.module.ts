import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminModule } from "./admin/admin.module";
import { ActivityModule } from "./activity/activity.module";
import { AuthModule } from "./auth/auth.module";
import { IndicatorsModule } from "./indicators/indicators.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProductsModule } from "./products/products.module";
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
    AdminModule,
    AuthModule,
    TeamsModule,
    ProductsModule,
    StoriesModule,
    TasksModule,
    SprintsModule,
    IndicatorsModule
  ]
})
export class AppModule {}

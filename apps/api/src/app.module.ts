import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { MembersModule } from './modules/members/members.module';
import { EnvironmentsModule } from './modules/environments/environments.module';
import { WorkflowsV2Module } from './modules/workflows-v2/workflows-v2.module';
import { SubscribersModule } from './modules/subscribers/subscribers.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { MessagesModule } from './modules/messages/messages.module';
import { ExecutionDetailsModule } from './modules/execution-details/execution-details.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { EventsModule } from './modules/events/events.module';
import { DigestModule } from './modules/digest/digest.module';
import { ActivityModule } from './modules/activity/activity.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local', '../../.env'],
    }),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 100,
    }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/campus-notifications',
    ),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT || 6379),
        password: process.env.REDIS_PASSWORD,
        db: Number(process.env.REDIS_DB || 0),
      },
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
      },
    }),
    CommonModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    MembersModule,
    EnvironmentsModule,
    WorkflowsV2Module,
    SubscribersModule,
    NotificationsModule,
    JobsModule,
    MessagesModule,
    ExecutionDetailsModule,
    IntegrationsModule,
    EventsModule,
    DigestModule,
    ActivityModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

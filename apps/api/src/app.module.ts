import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule, BullRootModuleOptions } from '@nestjs/bullmq';
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

const logger = new Logger('AppModule');

function bullConfig(): BullRootModuleOptions {
  const inMemory = process.env.__CAMPUS_INMEMORY_REDIS === '1';
  if (!inMemory) {
    return {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT || 6379),
        password: process.env.REDIS_PASSWORD,
        db: Number(process.env.REDIS_DB || 0),
        reconnectOnError: () => 2,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      },
      defaultJobOptions: {
        attempts: 3,
        removeOnComplete: true,
        removeOnFail: 100,
        backoff: { type: 'exponential', delay: 2000 },
      },
    };
  }

  logger.log('BullMQ using ioredis-mock (in-memory)');
  let mockClient: any = null;
  try {
    const RedisMock: any = require('ioredis-mock');
    mockClient = new RedisMock({});
    (mockClient as any).status = 'ready';
    mockClient.on('connect', () => {});
    mockClient.on('error', () => {});
    mockClient.on('ready', () => {});
  } catch (err) {
    logger.warn(`ioredis-mock load failed (${(err as Error).message}); falling back to real Redis client`);
    const Redis: any = require('ioredis');
    mockClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD,
      db: Number(process.env.REDIS_DB || 0),
      maxRetriesPerRequest: null,
    });
  }
  return {
    connection: mockClient,
    defaultJobOptions: {
      attempts: 2,
      removeOnComplete: true,
      removeOnFail: 20,
      backoff: { type: 'exponential', delay: 500 },
    },
  };
}

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
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/campus-notifications',
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        waitQueueTimeoutMS: 5000,
        retryAttempts: 5,
        retryDelay: 1500,
      }),
    }),
    BullModule.forRootAsync({
      useFactory: () => bullConfig(),
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

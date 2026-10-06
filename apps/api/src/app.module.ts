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

  logger.log('BullMQ using ioredis-mock (in-memory, workers disabled)');
  let mockClient: any = null;
  try {
    const RedisMock: any = require('ioredis-mock');
    const emptyResult = () => Promise.resolve([]);
    const nilResult = () => Promise.resolve(null);
    const zeroResult = () => Promise.resolve(0);
    const okResult = () => Promise.resolve('OK');
    const BLOCK_MS = 4000;
    const blockingNil = () => new Promise<any>((resolve) => setTimeout(() => resolve(null), BLOCK_MS));
    const stubPrototype: Record<string, () => Promise<any>> = {};
    ['bzpopmin', 'bzpopmax', 'blpop', 'brpop', 'zmpop', 'bzmpop', 'lmove', 'blmove'].forEach((c) => { stubPrototype[c] = blockingNil; });
    ['xreadgroup', 'xread', 'xclaim', 'xpending'].forEach((c) => { stubPrototype[c] = blockingNil; });
    ['xadd', 'xtrim', 'xrange', 'xrevrange', 'xlen', 'xdel', 'xack', 'xinfo'].forEach((c) => { stubPrototype[c] = nilResult; });
    ['set', 'hset', 'hmset', 'sadd', 'zadd', 'lpush', 'rpush', 'lrem', 'srem', 'zrem', 'del', 'unlink', 'expire', 'pexpire', 'hincrby', 'zincrby', 'hsetnx', 'setnx', 'psetex', 'setex'].forEach((c) => { stubPrototype[c] = okResult; });
    ['exists', 'hlen', 'scard', 'zcard', 'llen', 'zcount', 'sismember', 'hexists'].forEach((c) => { stubPrototype[c] = zeroResult; });
    Object.keys(stubPrototype).forEach((c) => { if (typeof RedisMock.prototype[c] !== 'function') RedisMock.prototype[c] = stubPrototype[c]; });
    const noopScripts = [
      'moveToActive', 'addJob', 'addToGroup', 'promoteJob',
      'updateDelaySet', 'removeDelaySet', 'isZombie', 'cleanJobsInSet',
      'decreaseGroupConcurrency', 'getGroup', 'getGroups', 'groupsRateLimit',
      'markStep', 'storeAndGetDependencies', 'obliterate', 'retryJob',
      'remove', 'repeat', 'paused', 'rateLimit', 'saveJob',
    ];
    noopScripts.forEach((n) => { RedisMock.prototype[n] = emptyResult; });
    RedisMock.prototype.eval = RedisMock.prototype.EVAL = emptyResult;
    RedisMock.prototype.evalsha = RedisMock.prototype.EVALSHA = emptyResult;
    RedisMock.prototype.script = RedisMock.prototype.SCRIPT = () => Promise.resolve('OK');
    mockClient = new RedisMock({});
    (mockClient as any).status = 'ready';
    mockClient.on('connect', () => {});
    mockClient.on('error', () => {});
    mockClient.on('ready', () => {});
    const sendKeys = ['sendCommand', 'send_command', 'call'];
    let origFn: any = null;
    for (const k of sendKeys) {
      if (typeof mockClient[k] === 'function') {
        origFn = mockClient[k].bind(mockClient);
        mockClient[k] = function (...args: any[]) {
          try {
            const cmd = String(args[0]?.name || args[0] || '').toLowerCase();
            if (cmd === 'eval' || cmd === 'evalsha' || cmd === 'script') return Promise.resolve([]);
            return origFn.apply(mockClient, args);
          } catch (e: any) {
            if (/cmsgpack|lua|not.*support|unsupported command/i.test(String(e?.message || ''))) return Promise.resolve(null);
            return Promise.resolve(null);
          }
        };
        break;
      }
    }
    (mockClient as any).defineCommand = (name: string) => { mockClient[name] = mockClient[name] || emptyResult; RedisMock.prototype[name] = RedisMock.prototype[name] || emptyResult; };
    (mockClient as any).scriptsBuffer = mockClient;
    RedisMock.prototype.defineCommand = (name: string) => { RedisMock.prototype[name] = RedisMock.prototype[name] || emptyResult; };
    if (!mockClient.status) mockClient.status = 'ready';
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

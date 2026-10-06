import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

const logger = new Logger('Bootstrap');

async function ensureMongoUri(): Promise<string> {
  const explicit = process.env.MONGODB_URI;
  if (explicit) {
    try {
      const { MongoClient } = await import('mongodb');
      const probe = await MongoClient.connect(explicit, {
        serverSelectionTimeoutMS: 1500,
        connectTimeoutMS: 1500,
      });
      await probe.db('admin').command({ ping: 1 });
      await probe.close();
      logger.log(`Using explicit MongoDB: ${explicit.replace(/\/\/[^@]*@/, '//***:***@')}`);
      return explicit;
    } catch (err) {
      logger.warn(`Explicit MongoDB unreachable (${(err as Error).message?.slice(0, 80)}), falling back to in-memory server`);
    }
  }

  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create({
      instance: { dbName: 'campus-notifications', port: 27017 },
    });
    const uri = mongod.getUri('campus-notifications');
    logger.log(`Started MongoDB in-memory on port ${mongod.instanceInfo?.port || 27017}  (data will not persist)`);
    (globalThis as any).__CAMPUS_MONGOD__ = mongod;
    return uri;
  } catch (err) {
    logger.warn(`Could not start in-memory MongoDB: ${(err as Error).message}. Defaulting to localhost:27017.`);
    return 'mongodb://localhost:27017/campus-notifications';
  }
}

async function ensureRedisAndSetEnv(): Promise<void> {
  const host = process.env.REDIS_HOST || 'localhost';
  const port = Number(process.env.REDIS_PORT || 6379);
  try {
    const net = await import('node:net');
    const reachable = await new Promise<boolean>((resolve) => {
      const s = net.createConnection({ host, port, timeout: 1200 });
      s.on('connect', () => { s.destroy(); resolve(true); });
      s.on('error', () => resolve(false));
      s.on('timeout', () => { s.destroy(); resolve(false); });
    });
    if (reachable) {
      logger.log(`Using Redis at ${host}:${port}`);
      return;
    }
    logger.warn(`Redis unreachable at ${host}:${port}, enabling in-memory BullMQ mode (no persistence, workers in-process)`);
    process.env.__CAMPUS_INMEMORY_REDIS = '1';
  } catch {
    process.env.__CAMPUS_INMEMORY_REDIS = '1';
  }
}

async function bootstrap() {
  process.env.MONGODB_URI = await ensureMongoUri();
  await ensureRedisAndSetEnv();

  const app = await NestFactory.create(AppModule);

  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.setGlobalPrefix('/v1');

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Campus Notification API running on port ${port}`);
}

bootstrap();

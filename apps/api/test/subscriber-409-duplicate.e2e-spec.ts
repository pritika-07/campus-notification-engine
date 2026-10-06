import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { randomBytes, readFileSync, existsSync } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

jest.setTimeout(1_800_000);
const SETUP_TIMEOUT = 10 * 60 * 1000;

const subscriberId = (suffix = '') =>
  `e2e-sub-${Date.now()}-${randomBytes(3).toString('hex')}${suffix}`;

describe('Subscriber 409 Duplicate End-to-End (real MongoDB + real HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let connection: Connection;

  let authHeader: string;
  let envId: string;

  const signupBody = {
    firstName: 'E2E',
    lastName: 'Tester',
    email: `e2e-${randomBytes(4).toString('hex')}@example.com`,
    password: 'correcthorsebatterystaple',
    organizationName: 'E2E Org',
  };

  beforeAll(async () => {
    if (!process.env.MONGODB_URI) {
      const uriFile = path.join(os.tmpdir(), `campus-e2e-mongo-${process.ppid}.txt`);
      if (existsSync(uriFile)) {
        process.env.MONGODB_URI = fs.readFileSync(uriFile, 'utf8');
      }
    }
    expect(process.env.MONGODB_URI).toBeStringWithText();

    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '2' });
    app.setGlobalPrefix('api', { exclude: ['health', 'v1/auth/(.*)'] });
    await app.init();
    http = request(app.getHttpServer());
    connection = module.get<Connection>(getConnectionToken());

    const signupRes = await http.post('/v1/auth/signup').send(signupBody);
    expect(signupRes.status).toBe(201);
    expect(typeof signupRes.body.token).toBe('string');
    authHeader = `Bearer ${signupRes.body.token}`;
    envId = signupRes.body.user._environmentId;
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await connection?.close(true);
    await app?.close();
    await replSet?.stop();
  });

  describe('Sanity: auth and subscriber route', () => {
    it('GET /api/v2/subscribers returns 200 + empty list initially', async () => {
      const res = await http
        .get('/api/v2/subscribers')
        .set('Authorization', authHeader)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('POST without JWT returns 401', async () => {
      await http
        .post('/api/v2/subscribers')
        .send({ subscriberId: 'x', email: 'x@y.co' })
        .expect(401);
    });
  });

  describe('Scenario 1 — fresh subscriber (200/201 success)', () => {
    const subId = subscriberId('-s1');
    let createdId: string;

    it('POST subscriber → returns full document', async () => {
      const res = await http
        .post('/api/v2/subscribers')
        .set('Authorization', authHeader)
        .send({
          subscriberId: subId,
          firstName: 'Alice',
          lastName: 'Test',
          email: 'alice@e2e.local',
        });
      expect([200, 201]).toContain(res.status);
      expect(res.body.subscriberId).toBe(subId);
      expect(res.body._environmentId).toBe(envId);
      expect(typeof res.body._id).toBe('string');
      createdId = res.body._id;
    });

    it('GET /api/v2/subscribers/:id returns the same doc', async () => {
      const res = await http
        .get(`/api/v2/subscribers/${createdId}`)
        .set('Authorization', authHeader)
        .expect(200);
      expect(res.body.subscriberId).toBe(subId);
    });

    it('GET list now shows 1 subscriber', async () => {
      const res = await http
        .get('/api/v2/subscribers')
        .set('Authorization', authHeader)
        .expect(200);
      const ids = res.body.map((d: any) => d.subscriberId);
      expect(ids).toContain(subId);
    });
  });

  describe('Scenario 2 — duplicate subscriber (HTTP 409 SUBSCRIBER_ALREADY_EXISTS)', () => {
    const subId = subscriberId('-s2');

    beforeAll(async () => {
      await http
        .post('/api/v2/subscribers')
        .set('Authorization', authHeader)
        .send({
          subscriberId: subId,
          email: 'bob@e2e.local',
          firstName: 'Bob',
          lastName: 'Dup',
        });
    });

    it('second POST with same subscriberId → HTTP 409 + machine-readable body', async () => {
      const res = await http
        .post('/api/v2/subscribers')
        .set('Authorization', authHeader)
        .send({
          subscriberId: subId,
          email: 'bob-2@e2e.local',
          firstName: 'Bob',
          lastName: 'DupAgain',
        });
      expect(res.status).toBe(409);
      expect(res.type).toBe('application/json');
      expect(res.body.error).toBe('SUBSCRIBER_ALREADY_EXISTS');
      expect(res.body.subscriberId).toBe(subId);
      expect(res.body.statusCode).toBe(409);
      expect(typeof res.body.message).toBe('string');
      expect(res.body.code).toBeUndefined();
      expect(res.body.keyValue).toBeUndefined();
      expect(res.body.errmsg).toBeUndefined();
      expect(res.body.stack).toBeUndefined();
    });

    it('GET /api/v2/subscribers still shows exactly ONE record for this subscriberId', async () => {
      const res = await http
        .get('/api/v2/subscribers')
        .set('Authorization', authHeader)
        .expect(200);
      const matches = res.body.filter((d: any) => d.subscriberId === subId);
      expect(matches.length).toBe(1);
    });
  });

  describe('Scenario 3 — duplicate across different environments does NOT conflict', () => {
    it('TODO: create a 2nd environment via signup and verify same subscriberId allowed there', async () => {
      const subId = subscriberId('-cross-env');
      const signup2 = await http
        .post('/v1/auth/signup')
        .send({
          firstName: 'E2E B',
          lastName: 'Cross',
          email: `cross-${randomBytes(4).toString('hex')}@example.com`,
          password: 'differentorg123',
          organizationName: 'E2E Cross Org',
        })
        .expect(201);
      const header2 = `Bearer ${signup2.body.token}`;
      const otherEnvId = signup2.body.user._environmentId;
      expect(otherEnvId).not.toBe(envId);

      await http
        .post('/api/v2/subscribers')
        .set('Authorization', authHeader)
        .send({ subscriberId: subId, email: 'a@e2e.local', firstName: 'A', lastName: 'B' })
        .expect((r) => expect([200, 201]).toContain(r.status));

      const res = await http
        .post('/api/v2/subscribers')
        .set('Authorization', header2)
        .send({ subscriberId: subId, email: 'b@e2e.local', firstName: 'C', lastName: 'D' });
      expect([200, 201]).toContain(res.status);
      expect(res.status).not.toBe(409);
      expect(res.body.subscriberId).toBe(subId);
      expect(res.body._environmentId).toBe(otherEnvId);
    });
  });

  describe('Scenario 4 — concurrent duplicates: 1 wins, others 409, total docs == 1', () => {
    const subId = subscriberId('-s4');
    const N = 10;

    it(`N=${N} parallel concurrent POSTs → 1 success, 9 409s`, async () => {
      const promises = Array.from({ length: N }, (_, i) =>
        http
          .post('/api/v2/subscribers')
          .set('Authorization', authHeader)
          .send({
            subscriberId: subId,
            email: `concurrent-${i}@e2e.local`,
            firstName: `Race${i}`,
            lastName: `Dup${i}`,
          }),
      );
      const results = await Promise.all(promises);

      const successes = results.filter((r) => r.status === 200 || r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);
      const others = results.filter(
        (r) => !(r.status === 200 || r.status === 201) && r.status !== 409,
      );

      expect(others.length).toBe(0);
      expect(successes.length).toBe(1);
      expect(conflicts.length).toBe(N - 1);

      for (const res of conflicts) {
        expect(res.body.error).toBe('SUBSCRIBER_ALREADY_EXISTS');
        expect(res.body.subscriberId).toBe(subId);
        expect(res.body.code).toBeUndefined();
      }

      const list = await http
        .get('/api/v2/subscribers')
        .set('Authorization', authHeader)
        .expect(200);
      const matches = list.body.filter((d: any) => d.subscriberId === subId);
      expect(matches.length).toBe(1);
    });
  });

  describe('Scenario 5 — non-duplicate DB errors NOT converted to 409', () => {
    it('validates payload fields: invalid email returns 400 (not 500/409)', async () => {
      const res = await http
        .post('/api/v2/subscribers')
        .set('Authorization', authHeader)
        .send({
          subscriberId: subscriberId('-s5-invalid'),
          email: 'not-an-email',
          firstName: 'Bad',
          lastName: 'Email',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).not.toBe('SUBSCRIBER_ALREADY_EXISTS');
      expect(res.body.subscriberId).toBeUndefined();
    });

    it('missing body → 400 validation errors, not 409/500', async () => {
      const res = await http
        .post('/api/v2/subscribers')
        .set('Authorization', authHeader)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).not.toBe('SUBSCRIBER_ALREADY_EXISTS');
    });

    it('invalid JWT → 401, not 409/500', async () => {
      const res = await http
        .post('/api/v2/subscribers')
        .set('Authorization', 'Bearer not-a-jwt')
        .send({
          subscriberId: subscriberId('-s5-unauth'),
          email: 'a@b.co',
          firstName: 'A',
          lastName: 'B',
        });
      expect(res.status).toBe(401);
    });
  });
});

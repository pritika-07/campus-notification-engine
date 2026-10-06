import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Connection, Model, Types as MongooseTypes } from 'mongoose';
import { WorkflowsV2Module } from '../workflows-v2.module';
import { OrganizationsModule } from '../../organizations/organizations.module';
import { UpsertWorkflowUseCase } from './upsert-workflow.usecase';
import { NotificationTemplateRepository } from '../notification-template.repository';
import { ControlValuesRepository } from '../control-values.repository';
import { UpsertWorkflowDto } from '../dtos/upsert-workflow.dto';
import {
  NotificationTemplate,
  NotificationTemplateDocument,
} from '../notification-template.schema';
import {
  ControlValues,
  ControlValuesDocument,
} from '../control-values.schema';
import {
  Organization,
  OrganizationDocument,
} from '../../organizations/organization.schema';
import {
  Environment,
  EnvironmentDocument,
} from '../../environments/environment.schema';
import { ChannelTypeEnum, DigestLevelEnum, EnvironmentTypeEnum } from '@campus/shared';

jest.mock('prettier', () => ({
  format: jest.fn((input: string) => Promise.resolve(input)),
}));

describe('UpsertWorkflowUseCase (Atomic Transactions)', () => {
  jest.setTimeout(10 * 60 * 1000);
  let replSet: MongoMemoryReplSet;
  let module: TestingModule;
  let connection: Connection;

  let upsertUseCase: UpsertWorkflowUseCase;
  let templateRepo: NotificationTemplateRepository;
  let controlValuesRepo: ControlValuesRepository;

  let OrgModel: Model<OrganizationDocument>;
  let EnvModel: Model<EnvironmentDocument>;
  let TemplateModel: Model<NotificationTemplateDocument>;
  let CVModel: Model<ControlValuesDocument>;

  let organizationId: string;
  let environmentId: string;
  let userId: string;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
      instanceOpts: [{ args: ['--syncdelay', '0'] }],
    });
    const mongoUri = replSet.getUri();

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRootAsync({
          useFactory: () => ({
            uri: mongoUri,
          }),
        }),
        WorkflowsV2Module,
        OrganizationsModule,
      ],
    }).compile();

    connection = module.get<Connection>(getConnectionToken());

    upsertUseCase = module.get(UpsertWorkflowUseCase);
    templateRepo = module.get(NotificationTemplateRepository);
    controlValuesRepo = module.get(ControlValuesRepository);

    OrgModel = module.get(getModelToken(Organization.name));
    EnvModel = module.get(getModelToken(Environment.name));
    TemplateModel = module.get(getModelToken(NotificationTemplate.name));
    CVModel = module.get(getModelToken(ControlValues.name));
  }, 120000);

  beforeEach(async () => {
    const org = await OrgModel.create({ name: 'Test University' });
    organizationId = org._id.toString();

    const env = await EnvModel.create({
      type: EnvironmentTypeEnum.DEV,
      identifier: `test-dev-${Date.now()}`,
      _organizationId: org._id,
    });
    environmentId = env._id.toString();

    userId = new MongooseTypes.ObjectId().toString();
  });

  afterEach(async () => {
    if (CVModel) await CVModel.deleteMany({});
    if (TemplateModel) await TemplateModel.deleteMany({});
    if (EnvModel) await EnvModel.deleteMany({});
    if (OrgModel) await OrgModel.deleteMany({});
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (connection) {
      await connection.close(true);
    }
    if (module) {
      await module.close();
    }
    if (replSet) {
      await replSet.stop({ doCleanup: true, force: true });
    }
  }, 60000);

  function buildWorkflowDto(
    controlValuesCount: number = 0,
  ): UpsertWorkflowDto {
    const steps = [
      { name: 'Email Step', type: ChannelTypeEnum.EMAIL, template: { subject: 'Hello', html: '<p>Hi</p>' } },
      { name: 'SMS Step', type: ChannelTypeEnum.SMS, template: { body: 'SMS content' } },
      { name: 'In-App Step', type: ChannelTypeEnum.IN_APP, template: { title: 'In App', body: 'Message' } },
    ];
    const stepIds = ['email-step', 'sms-step', 'in-app-step'];

    const controlValues: any[] = [];
    for (let i = 0; i < Math.min(controlValuesCount, steps.length); i++) {
      controlValues.push({
        _stepId: stepIds[i],
        level: DigestLevelEnum.STEP_CONTROLS,
        controls: { [`key${i}`]: `value${i}` },
      });
    }

    return {
      name: 'Exam Registration Workflow',
      description: 'Multi-step notification for exam period',
      active: true,
      draft: false,
      status: 'draft',
      origin: 'dashboard',
      steps: steps.map((s, i) => ({ ...s, _id: stepIds[i] })) as any,
      triggers: [
        { identifier: 'exam-registration', label: 'Exam Registration', description: 'Triggered when student registers' },
      ],
      tags: ['exam', 'registration'],
      controlValues: controlValuesCount > 0 ? controlValues : undefined,
    };
  }

  describe('TEST 1 — Successful atomic workflow creation', () => {
    it('creates NotificationTemplate and all ControlValues successfully', async () => {
      const dto = buildWorkflowDto(3);

      const result = await upsertUseCase.execute(dto, {
        _organizationId: organizationId,
        _environmentId: environmentId,
        _userId: userId,
      });

      expect(result).toBeDefined();
      expect(result._id).toBeDefined();
      expect(result.name).toBe(dto.name);
      expect(result.steps).toHaveLength(3);

      const templateInDb = await TemplateModel.findById(result._id).lean();
      expect(templateInDb).not.toBeNull();
      expect(templateInDb!.name).toBe(dto.name);
      expect(templateInDb!._environmentId.toString()).toBe(environmentId);
      expect(templateInDb!._organizationId.toString()).toBe(organizationId);

      const cvsInDb = await CVModel.find({
        _workflowId: result._id,
        _environmentId: environmentId,
      }).lean();
      expect(cvsInDb).toHaveLength(3);
      const stepIds = cvsInDb.map((c) => c._stepId).sort();
      expect(stepIds).toEqual(['email-step', 'in-app-step', 'sms-step']);
      cvsInDb.forEach((cv) => {
        expect(cv._organizationId.toString()).toBe(organizationId);
        expect(cv._workflowId.toString()).toBe(result._id.toString());
        expect(cv.level).toBe(DigestLevelEnum.STEP_CONTROLS);
      });
    });

    it('succeeds with zero ControlValues (only template)', async () => {
      const dto = buildWorkflowDto(0);

      const result = await upsertUseCase.execute(dto, {
        _organizationId: organizationId,
        _environmentId: environmentId,
        _userId: userId,
      });

      expect(result).toBeDefined();
      const templateInDb = await TemplateModel.findById(result._id).lean();
      expect(templateInDb).not.toBeNull();

      const cvsInDb = await CVModel.find({ _workflowId: result._id }).lean();
      expect(cvsInDb).toHaveLength(0);
    });
  });

  describe('TEST 2 — Rollback on ControlValues failure', () => {
    it('rolls back NotificationTemplate and earlier ControlValues when a later ControlValues write fails', async () => {
      const dto = buildWorkflowDto(3);

      let callCount = 0;
      const originalUpsert = controlValuesRepo.upsert.bind(controlValuesRepo);
      jest
        .spyOn(controlValuesRepo, 'upsert')
        .mockImplementation(async (filter: any, update: any, session: any) => {
          callCount++;
          if (callCount === 2) {
            throw new Error('Simulated ControlValues write failure on 2nd upsert');
          }
          return originalUpsert(filter, update, session);
        });

      let caughtError: any;
      try {
        await upsertUseCase.execute(dto, {
          _organizationId: organizationId,
          _environmentId: environmentId,
          _userId: userId,
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError.message).toContain('Simulated ControlValues write failure');
      expect(callCount).toBe(2);

      const templatesInDb = await TemplateModel.find({
        _environmentId: environmentId,
        _organizationId: organizationId,
      }).lean();
      expect(templatesInDb).toHaveLength(0);

      const cvsInDb = await CVModel.find({
        _environmentId: environmentId,
        _organizationId: organizationId,
      }).lean();
      expect(cvsInDb).toHaveLength(0);
    });

    it('rolls back NotificationTemplate when the first ControlValues write fails', async () => {
      const dto = buildWorkflowDto(2);

      jest
        .spyOn(controlValuesRepo, 'upsert')
        .mockRejectedValueOnce(new Error('Simulated ControlValues write failure on 1st upsert'));

      let caughtError: any;
      try {
        await upsertUseCase.execute(dto, {
          _organizationId: organizationId,
          _environmentId: environmentId,
          _userId: userId,
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError.message).toContain('Simulated ControlValues write failure');

      const templatesInDb = await TemplateModel.find({
        _environmentId: environmentId,
        _organizationId: organizationId,
      }).lean();
      expect(templatesInDb).toHaveLength(0);

      const cvsInDb = await CVModel.find({
        _environmentId: environmentId,
        _organizationId: organizationId,
      }).lean();
      expect(cvsInDb).toHaveLength(0);
    });

    it('rolls back NotificationTemplate when the last ControlValues write fails (3rd of 3)', async () => {
      const dto = buildWorkflowDto(3);

      let callCount = 0;
      const originalUpsert = controlValuesRepo.upsert.bind(controlValuesRepo);
      jest
        .spyOn(controlValuesRepo, 'upsert')
        .mockImplementation(async (filter: any, update: any, session: any) => {
          callCount++;
          if (callCount === 3) {
            throw new Error('Simulated ControlValues write failure on 3rd upsert');
          }
          return originalUpsert(filter, update, session);
        });

      let caughtError: any;
      try {
        await upsertUseCase.execute(dto, {
          _organizationId: organizationId,
          _environmentId: environmentId,
          _userId: userId,
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeDefined();
      expect(callCount).toBe(3);

      const templatesInDb = await TemplateModel.find({
        _environmentId: environmentId,
        _organizationId: organizationId,
      }).lean();
      expect(templatesInDb).toHaveLength(0);

      const cvsInDb = await CVModel.find({
        _environmentId: environmentId,
        _organizationId: organizationId,
      }).lean();
      expect(cvsInDb).toHaveLength(0);
    });
  });

  describe('TEST 3 — Multiple ControlValues use the same transaction', () => {
    it('passes the same ClientSession instance to template create and every ControlValues upsert', async () => {
      const dto = buildWorkflowDto(3);

      const createSpy = jest.spyOn(templateRepo, 'create');
      const upsertSpy = jest.spyOn(controlValuesRepo, 'upsert');

      await upsertUseCase.execute(dto, {
        _organizationId: organizationId,
        _environmentId: environmentId,
        _userId: userId,
      });

      expect(createSpy).toHaveBeenCalledTimes(1);
      const createCall = createSpy.mock.calls[0];
      const sessionUsedForCreate = createCall[1];
      expect(sessionUsedForCreate).toBeDefined();
      expect(typeof sessionUsedForCreate).toBe('object');
      expect((sessionUsedForCreate as any).id).toBeDefined();

      expect(upsertSpy).toHaveBeenCalledTimes(3);
      const sessionsUsedByUpserts = upsertSpy.mock.calls.map((call: any[]) => call[2]);
      sessionsUsedByUpserts.forEach((s: any) => {
        expect(s).toBeDefined();
        expect(s).toBe(sessionUsedForCreate);
      });
    });

    it('all repository operations inside the transaction use the same session (create + findById inside upsert existingId check path + upserts)', async () => {
      const dto = buildWorkflowDto(2);

      const createSpy = jest.spyOn(templateRepo, 'create');
      const upsertSpy = jest.spyOn(controlValuesRepo, 'upsert');

      const result = await upsertUseCase.execute(dto, {
        _organizationId: organizationId,
        _environmentId: environmentId,
        _userId: userId,
      });

      const createSession = createSpy.mock.calls[0][1];
      expect(createSession).toBeDefined();

      expect(upsertSpy).toHaveBeenCalledTimes(2);
      for (const call of upsertSpy.mock.calls as any[][]) {
        expect(call[2]).toBe(createSession);
      }

      const updateSpy = jest.spyOn(templateRepo, 'updateById');
      const findByIdSpy = jest.spyOn(templateRepo, 'findById');
      createSpy.mockClear();
      upsertSpy.mockClear();

      const updatedDto = { ...dto, name: 'Updated Name' };
      await upsertUseCase.execute(updatedDto, {
        _organizationId: organizationId,
        _environmentId: environmentId,
        _userId: userId,
        existingId: result._id.toString(),
      });

      expect(findByIdSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(createSpy).toHaveBeenCalledTimes(0);
      expect(upsertSpy).toHaveBeenCalledTimes(2);

      const findSession = findByIdSpy.mock.calls[0][1];
      const updateSession = updateSpy.mock.calls[0][2];

      expect(findSession).toBeDefined();
      expect(updateSession).toBeDefined();
      expect(findSession).toBe(updateSession);
      for (const call of upsertSpy.mock.calls as any[][]) {
        expect(call[2]).toBe(updateSession);
      }
    });
  });
});

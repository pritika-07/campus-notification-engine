import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException } from '@nestjs/common';
import { SubscriberRepository } from './subscriber.repository';
import { Subscriber, SubscriberDocument } from './subscriber.schema';
import { ErrorCode } from '@campus/shared';
import { Types as MongooseTypes } from 'mongoose';

describe('SubscriberRepository', () => {
  let repository: SubscriberRepository;
  let modelCreate: jest.Mock;

  const mockSubscriberId = 'user-123';
  const mockEnvId = new MongooseTypes.ObjectId();
  const mockOrgId = new MongooseTypes.ObjectId();

  const mockSubscriberData = {
    subscriberId: mockSubscriberId,
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    _environmentId: mockEnvId,
    _organizationId: mockOrgId,
  };

  const createMockDoc = (overrides: Partial<Subscriber> = {}): SubscriberDocument => ({
    _id: new MongooseTypes.ObjectId(),
    subscriberId: mockSubscriberId,
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    channels: {},
    _environmentId: mockEnvId,
    _organizationId: mockOrgId,
    deleted: false,
    save: jest.fn(),
    ...overrides,
  } as unknown as SubscriberDocument);

  beforeEach(async () => {
    modelCreate = jest.fn();
    const mockModel = {
      create: modelCreate,
      findById: jest.fn().mockReturnValue({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn(),
      }),
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn(),
      }),
      find: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        exec: jest.fn(),
      }),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriberRepository,
        {
          provide: getModelToken(Subscriber.name),
          useValue: mockModel,
        },
      ],
    }).compile();

    repository = module.get<SubscriberRepository>(SubscriberRepository);
  });

  describe('create', () => {
    it('should create a new subscriber successfully', async () => {
      const mockDoc = createMockDoc();
      modelCreate.mockResolvedValueOnce([mockDoc]);

      const result = await repository.create(mockSubscriberData);

      expect(modelCreate).toHaveBeenCalledTimes(1);
      expect(modelCreate).toHaveBeenCalledWith([mockSubscriberData], {});
      expect(result).toBe(mockDoc);
    });

    it('should pass session option when provided', async () => {
      const mockDoc = createMockDoc();
      const mockSession: any = { id: 'session-1' };
      modelCreate.mockResolvedValueOnce([mockDoc]);

      const result = await repository.create(mockSubscriberData, mockSession);

      expect(modelCreate).toHaveBeenCalledWith([mockSubscriberData], { session: mockSession });
      expect(result).toBe(mockDoc);
    });

    it('should throw ConflictException with SUBSCRIBER_ALREADY_EXISTS and subscriberId on MongoDB 11000 error', async () => {
      const duplicateError: any = new Error('Duplicate key error');
      duplicateError.code = 11000;
      duplicateError.keyPattern = { subscriberId: 1, _environmentId: 1 };
      modelCreate.mockRejectedValueOnce(duplicateError);

      try {
        await repository.create(mockSubscriberData);
        fail('Expected ConflictException to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const conflictErr = err as ConflictException;
        expect(conflictErr.getStatus()).toBe(409);
        const response = conflictErr.getResponse() as any;
        expect(response.error).toBe(ErrorCode.SUBSCRIBER_ALREADY_EXISTS);
        expect(response.subscriberId).toBe(mockSubscriberId);
        expect(response.message).toBeUndefined();
      }

      expect(modelCreate).toHaveBeenCalledTimes(1);
    });

    it('should re-throw other database errors without wrapping', async () => {
      const otherError: any = new Error('Connection timeout');
      otherError.code = 50;
      otherError.name = 'MongoNetworkError';
      modelCreate.mockRejectedValue(otherError);

      try {
        await repository.create(mockSubscriberData);
        fail('Expected original error to be thrown');
      } catch (err) {
        expect(err).not.toBeInstanceOf(ConflictException);
        expect((err as any).message).toBe('Connection timeout');
        expect((err as any).code).toBe(50);
      }
    });

    it('should handle concurrent duplicate creation: one success, one 409', async () => {
      let createCallCount = 0;
      const mockDoc = createMockDoc();

      modelCreate.mockImplementation(async () => {
        createCallCount++;
        if (createCallCount === 1) {
          return [mockDoc];
        } else {
          const duplicateError: any = new Error('Duplicate key error');
          duplicateError.code = 11000;
          throw duplicateError;
        }
      });

      const promise1 = repository.create(mockSubscriberData);
      const promise2 = repository.create(mockSubscriberData);

      const results = await Promise.allSettled([promise1, promise2]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect((fulfilled[0] as PromiseFulfilledResult<any>).value).toBe(mockDoc);

      expect(rejected.length).toBe(1);
      const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectedReason).toBeInstanceOf(ConflictException);
      expect(rejectedReason.getStatus()).toBe(409);
      const response = rejectedReason.getResponse() as any;
      expect(response.error).toBe(ErrorCode.SUBSCRIBER_ALREADY_EXISTS);
      expect(response.subscriberId).toBe(mockSubscriberId);
    });

    it('should handle concurrent requests where second arrives first (race for 11000)', async () => {
      let callOrder: number[] = [];
      const mockDoc = createMockDoc();

      modelCreate.mockImplementation(async (_data: any, _opts: any, callId: number) => {
        callOrder.push(callId);
        if (callOrder.filter((c) => c === callId).length > 0 && callOrder.length > 1) {
          const duplicateError: any = new Error('Duplicate key error');
          duplicateError.code = 11000;
          throw duplicateError;
        }
        return [mockDoc];
      });

      const result1 = repository.create(mockSubscriberData);
      const result2 = repository.create(mockSubscriberData);

      const settled = await Promise.allSettled([result1, result2]);

      const successCount = settled.filter((s) => s.status === 'fulfilled').length;
      const conflictCount = settled.filter(
        (s) =>
          s.status === 'rejected' &&
          s.reason instanceof ConflictException &&
          (s.reason as ConflictException).getStatus() === 409,
      ).length;

      expect(successCount + conflictCount).toBe(2);
      expect(successCount).toBeGreaterThanOrEqual(0);
      expect(conflictCount).toBeGreaterThanOrEqual(0);
    });
  });
});

import { ArgumentsHost, ConflictException, HttpStatus, InternalServerErrorException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ErrorCode } from '@campus/shared';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockResponse: { status: jest.Mock; json: jest.Mock };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
    } as unknown as ArgumentsHost;
  });

  it('should pass through custom extra properties (subscriberId) from HttpException response', () => {
    const exception = new ConflictException({
      error: ErrorCode.SUBSCRIBER_ALREADY_EXISTS,
      subscriberId: 'user-123',
    });

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    const payload = mockResponse.json.mock.calls[0][0];
    expect(payload.statusCode).toBe(HttpStatus.CONFLICT);
    expect(payload.error).toBe(ErrorCode.SUBSCRIBER_ALREADY_EXISTS);
    expect(payload.subscriberId).toBe('user-123');
    expect(typeof payload.message).toBe('string');
  });

  it('should include multiple extra properties from HttpException response', () => {
    const exception = new ConflictException({
      error: ErrorCode.SUBSCRIBER_ALREADY_EXISTS,
      subscriberId: 'user-456',
      environmentId: 'env-789',
    });

    filter.catch(exception, mockHost);

    const payload = mockResponse.json.mock.calls[0][0];
    expect(payload.statusCode).toBe(HttpStatus.CONFLICT);
    expect(payload.error).toBe(ErrorCode.SUBSCRIBER_ALREADY_EXISTS);
    expect(payload.subscriberId).toBe('user-456');
    expect(payload.environmentId).toBe('env-789');
  });

  it('should not leak extra props from non-HTTP errors (still 500)', () => {
    const rawError = new Error('DB connection lost');
    (rawError as any).code = 50;

    filter.catch(rawError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const jsonPayload = mockResponse.json.mock.calls[0][0];
    expect(jsonPayload.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonPayload.error).toBe(ErrorCode.INTERNAL_ERROR);
    expect(jsonPayload.message).toBe('DB connection lost');
    expect(jsonPayload.code).toBeUndefined();
  });

  it('should fall back to default error/message for plain HttpException objects', () => {
    const exception = new InternalServerErrorException();

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const payload = mockResponse.json.mock.calls[0][0];
    expect(payload.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(typeof payload.error).toBe('string');
    expect(typeof payload.message).toBe('string');
  });
});

import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession, FilterQuery } from 'mongoose';
import { Subscriber, SubscriberDocument } from './subscriber.schema';
import { ErrorCode } from '@campus/shared';

@Injectable()
export class SubscriberRepository {
  constructor(@InjectModel(Subscriber.name) private model: Model<SubscriberDocument>) {}

  async create(data: Partial<Subscriber>, session?: ClientSession): Promise<SubscriberDocument> {
    try {
      const [doc] = await this.model.create([data], session ? { session } : {});
      return doc;
    } catch (err: any) {
      if (err && err.code === 11000) {
        throw new ConflictException({
          error: ErrorCode.SUBSCRIBER_ALREADY_EXISTS,
          message: 'Subscriber with this subscriberId already exists in this environment',
        });
      }
      throw err;
    }
  }

  async findById(id: string, session?: ClientSession): Promise<SubscriberDocument | null> {
    return this.model.findById(id).session(session || null).exec();
  }

  async findBySubscriberId(
    subscriberId: string,
    environmentId: string,
  ): Promise<SubscriberDocument | null> {
    return this.model.findOne({ subscriberId, _environmentId: environmentId }).exec();
  }

  async find(
    filter: FilterQuery<SubscriberDocument>,
    options?: { limit?: number; skip?: number },
  ): Promise<SubscriberDocument[]> {
    const q = this.model.find(filter);
    if (options?.limit) q.limit(options.limit);
    if (options?.skip) q.skip(options.skip);
    return q.exec();
  }

  async updateById(
    id: string,
    data: Partial<Subscriber>,
    session?: ClientSession,
  ): Promise<SubscriberDocument | null> {
    return this.model
      .findByIdAndUpdate(id, data, { new: true, session: session || undefined })
      .exec();
  }

  async deleteById(id: string, session?: ClientSession): Promise<SubscriberDocument | null> {
    return this.model
      .findByIdAndUpdate(id, { deleted: true } as any, { new: true, session: session || undefined })
      .exec();
  }
}

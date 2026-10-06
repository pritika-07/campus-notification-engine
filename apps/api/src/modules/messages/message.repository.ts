import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession, FilterQuery, UpdateQuery, QueryOptions } from 'mongoose';
import { Message, MessageDocument } from './message.schema';

@Injectable()
export class MessageRepository {
  constructor(@InjectModel(Message.name) private model: Model<MessageDocument>) {}

  async create(data: Partial<Message>, session?: ClientSession): Promise<MessageDocument | null> {
    try {
      const [doc] = await this.model.create([data], session ? { session } : {});
      return doc;
    } catch (err: any) {
      if (err?.code === 11000) {
        return null;
      }
      throw err;
    }
  }

  async insertIfNotExists(data: Partial<Message>, session?: ClientSession): Promise<MessageDocument | null> {
    try {
      const opts: QueryOptions = { upsert: false, new: true };
      if (session) opts.session = session;
      const filter: FilterQuery<MessageDocument> = {
        transactionId: data.transactionId,
        _subscriberId: data._subscriberId,
        _environmentId: data._environmentId,
        channel: data.channel,
      };
      const existing = await this.model.findOne(filter).session(session || null).exec();
      if (existing) return existing;
      const [doc] = await this.model.create([data], session ? { session } : {});
      return doc;
    } catch (err: any) {
      if (err?.code === 11000) {
        return await this.model
          .findOne({
            transactionId: data.transactionId,
            _subscriberId: data._subscriberId,
            _environmentId: data._environmentId,
            channel: data.channel,
          })
          .session(session || null)
          .exec();
      }
      throw err;
    }
  }

  async findById(id: string, session?: ClientSession): Promise<MessageDocument | null> {
    return this.model.findById(id).session(session || null).exec();
  }

  async find(
    filter: FilterQuery<MessageDocument>,
    options?: { limit?: number; skip?: number; sort?: any },
  ): Promise<MessageDocument[]> {
    const q = this.model.find(filter);
    if (options?.sort) q.sort(options.sort);
    if (options?.limit) q.limit(options.limit);
    if (options?.skip) q.skip(options.skip);
    return q.exec();
  }

  async count(filter: FilterQuery<MessageDocument>): Promise<number> {
    return this.model.countDocuments(filter).exec();
  }

  async updateById(
    id: string,
    update: UpdateQuery<MessageDocument>,
    session?: ClientSession,
  ): Promise<MessageDocument | null> {
    return this.model
      .findByIdAndUpdate(id, update, { new: true, session: session || undefined })
      .exec();
  }
}

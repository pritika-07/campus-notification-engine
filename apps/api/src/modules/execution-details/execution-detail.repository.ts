import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession, FilterQuery } from 'mongoose';
import { ExecutionDetail, ExecutionDetailDocument } from './execution-detail.schema';

@Injectable()
export class ExecutionDetailRepository {
  constructor(@InjectModel(ExecutionDetail.name) private model: Model<ExecutionDetailDocument>) {}

  async create(data: Partial<ExecutionDetail>, session?: ClientSession): Promise<ExecutionDetailDocument> {
    const [doc] = await this.model.create([data], session ? { session } : {});
    return doc;
  }

  async find(
    filter: FilterQuery<ExecutionDetailDocument>,
    options?: { limit?: number; skip?: number; sort?: any },
  ): Promise<ExecutionDetailDocument[]> {
    const q = this.model.find(filter);
    if (options?.sort) q.sort(options.sort);
    if (options?.limit) q.limit(options.limit);
    if (options?.skip) q.skip(options.skip);
    return q.exec();
  }

  async count(filter: FilterQuery<ExecutionDetailDocument>): Promise<number> {
    return this.model.countDocuments(filter).exec();
  }
}

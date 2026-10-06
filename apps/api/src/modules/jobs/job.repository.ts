import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession, FilterQuery } from 'mongoose';
import { Job, JobDocument } from './job.schema';

@Injectable()
export class JobRepository {
  constructor(@InjectModel(Job.name) private model: Model<JobDocument>) {}

  async create(data: Partial<Job>, session?: ClientSession): Promise<JobDocument> {
    const [doc] = await this.model.create([data], session ? { session } : {});
    return doc;
  }

  async findById(id: string, session?: ClientSession): Promise<JobDocument | null> {
    return this.model.findById(id).session(session || null).exec();
  }

  async updateById(id: string, data: Partial<Job>, session?: ClientSession): Promise<JobDocument | null> {
    return this.model
      .findByIdAndUpdate(id, data, { new: true, session: session || undefined })
      .exec();
  }
}

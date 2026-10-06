import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession, FilterQuery } from 'mongoose';
import { Environment, EnvironmentDocument } from './environment.schema';

@Injectable()
export class EnvironmentRepository {
  constructor(@InjectModel(Environment.name) private model: Model<EnvironmentDocument>) {}

  async create(data: Partial<Environment>, session?: ClientSession): Promise<EnvironmentDocument> {
    const [doc] = await this.model.create([data], session ? { session } : {});
    return doc;
  }

  async findById(id: string, session?: ClientSession): Promise<EnvironmentDocument | null> {
    return this.model.findById(id).session(session || null).exec();
  }

  async find(filter: FilterQuery<EnvironmentDocument>, session?: ClientSession): Promise<EnvironmentDocument[]> {
    return this.model.find(filter).session(session || null).exec();
  }

  async findOne(filter: FilterQuery<EnvironmentDocument>, session?: ClientSession): Promise<EnvironmentDocument | null> {
    return this.model.findOne(filter).session(session || null).exec();
  }

  async findByApiKeyHash(hash: string): Promise<EnvironmentDocument | null> {
    return this.model.findOne({ 'apiKeys.hash': hash }).exec();
  }

  async updateById(
    id: string,
    data: any,
    session?: ClientSession,
  ): Promise<EnvironmentDocument | null> {
    return this.model
      .findByIdAndUpdate(id, data, { new: true, session: session || undefined })
      .exec();
  }

  async listForOrganization(organizationId: string): Promise<EnvironmentDocument[]> {
    if (!organizationId) return [];
    return this.model.find({ _organizationId: organizationId }).exec();
  }
}

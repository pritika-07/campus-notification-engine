import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession, FilterQuery, UpdateQuery } from 'mongoose';
import { Integration, IntegrationDocument } from './integration.schema';

@Injectable()
export class IntegrationRepository {
  constructor(@InjectModel(Integration.name) private model: Model<IntegrationDocument>) {}

  async create(data: Partial<Integration>, session?: ClientSession): Promise<IntegrationDocument> {
    const [doc] = await this.model.create([data], session ? { session } : {});
    return doc;
  }

  async findById(id: string, session?: ClientSession): Promise<IntegrationDocument | null> {
    return this.model.findById(id).session(session || null).exec();
  }

  async find(
    filter: FilterQuery<IntegrationDocument>,
    session?: ClientSession,
  ): Promise<IntegrationDocument[]> {
    return this.model.find(filter).session(session || null).exec();
  }

  async findOne(
    filter: FilterQuery<IntegrationDocument>,
    session?: ClientSession,
  ): Promise<IntegrationDocument | null> {
    return this.model.findOne(filter).session(session || null).exec();
  }

  async findActiveByChannel(
    environmentId: string,
    channel: string,
  ): Promise<IntegrationDocument | null> {
    return this.model
      .findOne({
        _environmentId: environmentId,
        channel,
        active: true,
      })
      .exec();
  }

  async updateById(
    id: string,
    update: UpdateQuery<IntegrationDocument>,
    session?: ClientSession,
  ): Promise<IntegrationDocument | null> {
    return this.model
      .findByIdAndUpdate(id, update, { new: true, session: session || undefined })
      .exec();
  }

  async deleteById(id: string, session?: ClientSession): Promise<IntegrationDocument | null> {
    return this.model
      .findByIdAndUpdate(id, { deleted: true } as any, { new: true, session: session || undefined })
      .exec();
  }
}

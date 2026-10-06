import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession, FilterQuery, UpdateQuery } from 'mongoose';
import { ControlValues, ControlValuesDocument } from './control-values.schema';

@Injectable()
export class ControlValuesRepository {
  constructor(
    @InjectModel(ControlValues.name)
    private model: Model<ControlValuesDocument>,
  ) {}

  async create(
    data: Partial<ControlValues>,
    session?: ClientSession,
  ): Promise<ControlValuesDocument> {
    const [doc] = await this.model.create([data], session ? { session } : {});
    return doc;
  }

  async find(
    filter: FilterQuery<ControlValuesDocument>,
    session?: ClientSession,
  ): Promise<ControlValuesDocument[]> {
    return this.model.find(filter).session(session || null).exec();
  }

  async findOne(
    filter: FilterQuery<ControlValuesDocument>,
    session?: ClientSession,
  ): Promise<ControlValuesDocument | null> {
    return this.model.findOne(filter).session(session || null).exec();
  }

  async bulkWrite(
    operations: Array<{
      updateOne: {
        filter: FilterQuery<ControlValuesDocument>;
        update: UpdateQuery<ControlValuesDocument>;
        upsert?: boolean;
      };
    }>,
    session?: ClientSession,
  ): Promise<any> {
    return this.model.bulkWrite(operations, { session: session || undefined });
  }

  async deleteMany(
    filter: FilterQuery<ControlValuesDocument>,
    session?: ClientSession,
  ): Promise<any> {
    return this.model.deleteMany(filter).session(session || null).exec();
  }
}

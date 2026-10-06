import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession, FilterQuery, UpdateQuery } from 'mongoose';
import { NotificationTemplate, NotificationTemplateDocument } from './notification-template.schema';

@Injectable()
export class NotificationTemplateRepository {
  constructor(
    @InjectModel(NotificationTemplate.name)
    private model: Model<NotificationTemplateDocument>,
  ) {}

  async create(
    data: Partial<NotificationTemplate>,
    session?: ClientSession,
  ): Promise<NotificationTemplateDocument> {
    const [doc] = await this.model.create([data], session ? { session } : {});
    return doc;
  }

  async findById(id: string, session?: ClientSession): Promise<NotificationTemplateDocument | null> {
    return this.model.findById(id).session(session || null).exec();
  }

  async find(
    filter: FilterQuery<NotificationTemplateDocument>,
    session?: ClientSession,
  ): Promise<NotificationTemplateDocument[]> {
    return this.model.find(filter).session(session || null).exec();
  }

  async findOne(
    filter: FilterQuery<NotificationTemplateDocument>,
    session?: ClientSession,
  ): Promise<NotificationTemplateDocument | null> {
    return this.model.findOne(filter).session(session || null).exec();
  }

  async findByTriggerIdentifier(
    environmentId: string,
    identifier: string,
  ): Promise<NotificationTemplateDocument | null> {
    return this.model
      .findOne({
        _environmentId: environmentId,
        'triggers.identifier': identifier,
      })
      .exec();
  }

  async updateById(
    id: string,
    update: UpdateQuery<NotificationTemplateDocument>,
    session?: ClientSession,
  ): Promise<NotificationTemplateDocument | null> {
    return this.model
      .findByIdAndUpdate(id, update, { new: true, session: session || undefined })
      .exec();
  }

  async deleteById(id: string, session?: ClientSession): Promise<NotificationTemplateDocument | null> {
    return this.model
      .findByIdAndUpdate(id, { deleted: true } as any, { new: true, session: session || undefined })
      .exec();
  }
}

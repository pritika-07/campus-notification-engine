import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession } from 'mongoose';
import { Notification, NotificationDocument } from './notification.schema';

@Injectable()
export class NotificationRepository {
  constructor(@InjectModel(Notification.name) private model: Model<NotificationDocument>) {}

  async create(data: Partial<Notification>, session?: ClientSession): Promise<NotificationDocument> {
    const [doc] = await this.model.create([data], session ? { session } : {});
    return doc;
  }

  async findById(id: string, session?: ClientSession): Promise<NotificationDocument | null> {
    return this.model.findById(id).session(session || null).exec();
  }
}

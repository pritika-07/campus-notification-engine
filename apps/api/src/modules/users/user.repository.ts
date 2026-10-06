import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession, FilterQuery } from 'mongoose';
import { User, UserDocument } from './user.schema';

@Injectable()
export class UserRepository {
  constructor(@InjectModel(User.name) private model: Model<UserDocument>) {}

  async create(data: Partial<User>, session?: ClientSession): Promise<UserDocument> {
    const [doc] = await this.model.create([data], session ? { session } : {});
    return doc;
  }

  async findById(id: string, session?: ClientSession): Promise<UserDocument | null> {
    return this.model.findById(id).session(session || null).exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.model.findOne({ email }).exec();
  }

  async findOne(filter: FilterQuery<UserDocument>, session?: ClientSession): Promise<UserDocument | null> {
    return this.model.findOne(filter).session(session || null).exec();
  }

  async updateById(id: string, data: Partial<User>, session?: ClientSession): Promise<UserDocument | null> {
    return this.model
      .findByIdAndUpdate(id, data, { new: true, session: session || undefined })
      .exec();
  }
}

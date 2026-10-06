import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession, FilterQuery } from 'mongoose';
import { Member, MemberDocument } from './member.schema';

@Injectable()
export class MemberRepository {
  constructor(@InjectModel(Member.name) private model: Model<MemberDocument>) {}

  async create(data: Partial<Member>, session?: ClientSession): Promise<MemberDocument> {
    const [doc] = await this.model.create([data], session ? { session } : {});
    return doc;
  }

  async find(filter: FilterQuery<MemberDocument>, session?: ClientSession): Promise<MemberDocument[]> {
    return this.model.find(filter).session(session || null).exec();
  }

  async findOne(filter: FilterQuery<MemberDocument>, session?: ClientSession): Promise<MemberDocument | null> {
    return this.model.findOne(filter).session(session || null).exec();
  }

  async findByUserId(userId: string): Promise<MemberDocument | null> {
    return this.model.findOne({ _userId: userId }).sort({ createdAt: 1 }).exec();
  }
}

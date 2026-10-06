import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession } from 'mongoose';
import { Organization, OrganizationDocument } from './organization.schema';

@Injectable()
export class OrganizationRepository {
  constructor(@InjectModel(Organization.name) private model: Model<OrganizationDocument>) {}

  async create(data: Partial<Organization>, session?: ClientSession): Promise<OrganizationDocument> {
    const [doc] = await this.model.create([data], session ? { session } : {});
    return doc;
  }

  async findById(id: string, session?: ClientSession): Promise<OrganizationDocument | null> {
    return this.model.findById(id).session(session || null).exec();
  }
}

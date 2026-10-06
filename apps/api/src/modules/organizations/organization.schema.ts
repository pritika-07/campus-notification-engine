import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types as MongooseTypes } from 'mongoose';
import mongooseDelete from 'mongoose-delete';

export type OrganizationDocument = Organization & Document;

@Schema({ timestamps: true, collection: 'organizations' })
export class Organization {
  _id: MongooseTypes.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ default: 'free' })
  apiServiceLevel?: string;

  @Prop({ type: Object, default: {} })
  branding?: Record<string, any>;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
OrganizationSchema.plugin(mongooseDelete, { deletedAt: true, overrideMethods: 'all' });

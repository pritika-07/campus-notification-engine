import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types as MongooseTypes } from 'mongoose';
import mongooseDelete from 'mongoose-delete';
import { ChannelTypeEnum } from '@campus/shared';

export type IntegrationDocument = Integration & Document;

@Schema({ timestamps: true, collection: 'integrations' })
export class Integration {
  _id: MongooseTypes.ObjectId;

  @Prop({ required: true })
  providerId: string;

  @Prop({ type: String, enum: Object.values(ChannelTypeEnum), required: true, index: true })
  channel: ChannelTypeEnum;

  @Prop({ default: true })
  active?: boolean;

  @Prop({ type: Object, required: true })
  credentials: Record<string, any>;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Environment',
    required: true,
    index: true,
  })
  _environmentId: MongooseTypes.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  _organizationId: MongooseTypes.ObjectId;
}

export const IntegrationSchema = SchemaFactory.createForClass(Integration);
IntegrationSchema.plugin(mongooseDelete, { deletedAt: true, overrideMethods: 'all' });
IntegrationSchema.index({ _environmentId: 1, channel: 1, active: 1 });

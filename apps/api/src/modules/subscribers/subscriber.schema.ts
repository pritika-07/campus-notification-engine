import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types as MongooseTypes } from 'mongoose';
import mongooseDelete from 'mongoose-delete';
import { ChannelPreferences } from '@campus/shared';

export type SubscriberDocument = Subscriber & Document;

@Schema({ timestamps: true, collection: 'subscribers' })
export class Subscriber {
  _id: MongooseTypes.ObjectId;

  @Prop({ required: true, index: true })
  subscriberId: string;

  @Prop()
  firstName?: string;

  @Prop()
  lastName?: string;

  @Prop()
  email?: string;

  @Prop()
  phone?: string;

  @Prop({ default: 'en' })
  locale?: string;

  @Prop({ default: 'UTC' })
  timezone?: string;

  @Prop({ default: true })
  isOnline?: boolean;

  @Prop({ type: Object, default: {} })
  data?: Record<string, any>;

  @Prop({
    type: {
      email: { type: { enabled: { type: Boolean, default: true } }, _id: false, default: {} },
      sms: { type: { enabled: { type: Boolean, default: true } }, _id: false, default: {} },
      push: { type: { enabled: { type: Boolean, default: true } }, _id: false, default: {} },
      in_app: { type: { enabled: { type: Boolean, default: true } }, _id: false, default: {} },
      chat: { type: { enabled: { type: Boolean, default: true } }, _id: false, default: {} },
    },
    default: {},
    _id: false,
  })
  channels: ChannelPreferences;

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

export const SubscriberSchema = SchemaFactory.createForClass(Subscriber);
SubscriberSchema.plugin(mongooseDelete, { deletedAt: true, overrideMethods: 'all', indexFields: ['deleted'] });
SubscriberSchema.index(
  { subscriberId: 1, _environmentId: 1 },
  { unique: true, partialFilterExpression: { deleted: false } },
);

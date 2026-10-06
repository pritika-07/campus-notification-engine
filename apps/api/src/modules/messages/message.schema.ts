import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types as MongooseTypes } from 'mongoose';
import { ChannelTypeEnum, MessageStatusEnum } from '@campus/shared';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true, collection: 'messages' })
export class Message {
  _id: MongooseTypes.ObjectId;

  @Prop({ type: String, enum: Object.values(ChannelTypeEnum), required: true, index: true })
  channel: ChannelTypeEnum;

  @Prop({ required: true })
  content: string;

  @Prop({ type: String })
  subject?: string;

  @Prop({ default: false, index: true })
  seen: boolean;

  @Prop({ default: false, index: true })
  read: boolean;

  @Prop({ default: false, index: true })
  archived: boolean;

  @Prop({ type: Date })
  snoozedUntil?: Date;

  @Prop({
    type: String,
    enum: Object.values(MessageStatusEnum),
    default: MessageStatusEnum.SENT,
    index: true,
  })
  status: MessageStatusEnum;

  @Prop({ required: true, index: true })
  transactionId: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'NotificationTemplate',
    index: true,
  })
  _templateId?: MongooseTypes.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Notification',
    index: true,
  })
  _notificationId?: MongooseTypes.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Subscriber',
    required: true,
    index: true,
  })
  _subscriberId: MongooseTypes.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Job',
    index: true,
  })
  _jobId?: MongooseTypes.ObjectId;

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

  @Prop({ default: () => new Date() })
  createdAt: Date;

  @Prop({ default: () => new Date() })
  updatedAt: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index(
  {
    _subscriberId: 1,
    _environmentId: 1,
    channel: 1,
    seen: 1,
    read: 1,
    archived: 1,
    snoozedUntil: 1,
    createdAt: -1,
  },
  { name: 'inbox_compound' },
);
MessageSchema.index(
  { transactionId: 1, _subscriberId: 1, _environmentId: 1, channel: 1 },
  { unique: true, name: 'dedup_compound' },
);
MessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });

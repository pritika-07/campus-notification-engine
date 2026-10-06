import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types as MongooseTypes } from 'mongoose';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  _id: MongooseTypes.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'NotificationTemplate',
    required: true,
    index: true,
  })
  _templateId: MongooseTypes.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Subscriber',
    required: true,
    index: true,
  })
  _subscriberId: MongooseTypes.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Environment',
    required: true,
    index: true,
  })
  _environmentId: MongooseTypes.ObjectId;

  @Prop({ required: true, index: true })
  transactionId: string;

  @Prop({ type: Object, default: {} })
  payload?: Record<string, any>;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ transactionId: 1, _subscriberId: 1 });

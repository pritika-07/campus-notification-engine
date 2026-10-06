import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types as MongooseTypes } from 'mongoose';
import { ChannelTypeEnum, ExecutionStatusEnum } from '@campus/shared';

export type JobDocument = Job & Document;

@Schema({ timestamps: true, collection: 'jobs' })
export class Job {
  _id: MongooseTypes.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Notification',
    required: true,
    index: true,
  })
  _notificationId: MongooseTypes.ObjectId;

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

  @Prop({ type: String, enum: Object.values(ExecutionStatusEnum), default: ExecutionStatusEnum.PENDING })
  status?: ExecutionStatusEnum;

  @Prop({ type: String, enum: Object.values(ChannelTypeEnum), required: true })
  type: ChannelTypeEnum;
}

export const JobSchema = SchemaFactory.createForClass(Job);

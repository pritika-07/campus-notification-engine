import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types as MongooseTypes } from 'mongoose';
import { ExecutionStatusEnum } from '@campus/shared';

export type ExecutionDetailDocument = ExecutionDetail & Document;

@Schema({ timestamps: true, collection: 'execution_details' })
export class ExecutionDetail {
  _id: MongooseTypes.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Job',
    index: true,
  })
  _jobId?: MongooseTypes.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Notification',
    required: true,
    index: true,
  })
  _notificationId: MongooseTypes.ObjectId;

  @Prop({ type: String, enum: Object.values(ExecutionStatusEnum), required: true })
  status: ExecutionStatusEnum;

  @Prop({ type: Object, default: {} })
  detail?: Record<string, any>;

  @Prop({ default: false })
  isTest?: boolean;
}

export const ExecutionDetailSchema = SchemaFactory.createForClass(ExecutionDetail);

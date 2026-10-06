import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types as MongooseTypes } from 'mongoose';
import mongooseDelete from 'mongoose-delete';
import { DigestLevelEnum } from '@campus/shared';

export type ControlValuesDocument = ControlValues & Document;

@Schema({ timestamps: true, collection: 'control_values' })
export class ControlValues {
  _id: MongooseTypes.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'NotificationTemplate',
    required: true,
    index: true,
  })
  _workflowId: MongooseTypes.ObjectId;

  @Prop({ required: true })
  _stepId: string;

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

  @Prop({ type: String, enum: Object.values(DigestLevelEnum), required: true })
  level: DigestLevelEnum;

  @Prop()
  providerId?: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  controls: Record<string, any>;
}

export const ControlValuesSchema = SchemaFactory.createForClass(ControlValues);
ControlValuesSchema.plugin(mongooseDelete, { deletedAt: true, overrideMethods: 'all' });
ControlValuesSchema.index({ _workflowId: 1, _stepId: 1, _environmentId: 1, level: 1 }, { unique: true });

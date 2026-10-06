import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types as MongooseTypes } from 'mongoose';
import mongooseDelete from 'mongoose-delete';
import { EnvironmentTypeEnum, ApiKeyDto } from '@campus/shared';

export interface ApiKey extends ApiKeyDto {}

export type EnvironmentDocument = Environment & Document;

@Schema({ timestamps: true, collection: 'environments' })
export class Environment {
  _id: MongooseTypes.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(EnvironmentTypeEnum),
    required: true,
  })
  type: EnvironmentTypeEnum;

  @Prop({ required: true, unique: true, index: true })
  identifier: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  _organizationId: MongooseTypes.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Environment' })
  _parentId?: MongooseTypes.ObjectId;

  @Prop({
    type: [
      {
        key: { type: String, required: true, unique: true, index: true },
        hash: { type: String, required: true },
        _userId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
      },
    ],
    default: [],
    _id: false,
  })
  apiKeys: ApiKey[];
}

export const EnvironmentSchema = SchemaFactory.createForClass(Environment);
EnvironmentSchema.plugin(mongooseDelete, { deletedAt: true, overrideMethods: 'all' });
EnvironmentSchema.index({ _organizationId: 1, type: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types as MongooseTypes } from 'mongoose';
import mongooseDelete from 'mongoose-delete';
import { RoleEnum } from '@campus/shared';

export type MemberDocument = Member & Document;

@Schema({ timestamps: true, collection: 'members' })
export class Member {
  _id: MongooseTypes.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  _userId: MongooseTypes.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  })
  _organizationId: MongooseTypes.ObjectId;

  @Prop({ type: [String], enum: Object.values(RoleEnum), required: true })
  roles: RoleEnum[];
}

export const MemberSchema = SchemaFactory.createForClass(Member);
MemberSchema.plugin(mongooseDelete, { deletedAt: true, overrideMethods: 'all' });
MemberSchema.index({ _userId: 1, _organizationId: 1 }, { unique: true });

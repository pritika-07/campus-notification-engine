import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types as MongooseTypes } from 'mongoose';
import mongooseDelete from 'mongoose-delete';

export type UserDocument = User & Document;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  _id: MongooseTypes.ObjectId;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ type: [{ token: String, expiresAt: Date }], default: [] })
  tokens: Array<{ token: string; expiresAt: Date }>;

  @Prop()
  jobTitle?: string;

  @Prop({ index: true })
  externalId?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.plugin(mongooseDelete, { deletedAt: true, overrideMethods: 'all' });

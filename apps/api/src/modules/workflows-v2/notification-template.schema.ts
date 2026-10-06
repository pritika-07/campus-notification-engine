import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types as MongooseTypes } from 'mongoose';
import mongooseDelete from 'mongoose-delete';
import { ChannelTypeEnum } from '@campus/shared';

export interface WorkflowStepTemplate {
  subject?: string;
  html?: string;
  body?: string;
  title?: string;
}

export interface WorkflowStep {
  _id?: string;
  _templateId?: string;
  name: string;
  type: ChannelTypeEnum;
  template?: WorkflowStepTemplate;
  controls?: Record<string, any>;
  digestKey?: string;
  delayAmount?: number;
  delayUnit?: 'seconds' | 'minutes' | 'hours' | 'days';
  providerId?: string;
  critical?: boolean;
}

export interface WorkflowTrigger {
  identifier: string;
  label?: string;
  description?: string;
}

export type NotificationTemplateDocument = NotificationTemplate & Document;

@Schema({ timestamps: true, collection: 'notification_templates' })
export class NotificationTemplate {
  _id: MongooseTypes.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ default: true })
  active?: boolean;

  @Prop({ default: false })
  draft?: boolean;

  @Prop({ default: 'draft' })
  status?: string;

  @Prop({ default: 'dashboard' })
  origin?: string;

  @Prop({
    type: [
      {
        _id: { type: String },
        _templateId: { type: String },
        name: { type: String, required: true },
        type: { type: String, enum: Object.values(ChannelTypeEnum), required: true },
        template: {
          type: {
            subject: String,
            html: String,
            body: String,
            title: String,
          },
          default: {},
          _id: false,
        },
        controls: { type: Object, default: {} },
        digestKey: String,
        delayAmount: Number,
        delayUnit: String,
        providerId: String,
        critical: Boolean,
      },
    ],
    default: [],
  })
  steps: WorkflowStep[];

  @Prop({
    type: [
      {
        identifier: { type: String, required: true },
        label: String,
        description: String,
      },
    ],
    default: [],
    _id: false,
  })
  triggers: WorkflowTrigger[];

  @Prop({ type: [String], default: [] })
  tags: string[];

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

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  _creatorId?: MongooseTypes.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'NotificationTemplate' })
  _parentId?: MongooseTypes.ObjectId;
}

export const NotificationTemplateSchema = SchemaFactory.createForClass(NotificationTemplate);
NotificationTemplateSchema.plugin(mongooseDelete, { deletedAt: true, overrideMethods: 'all' });
NotificationTemplateSchema.index({ _environmentId: 1, 'triggers.identifier': 1 });
NotificationTemplateSchema.index({ _environmentId: 1, _id: 1 });

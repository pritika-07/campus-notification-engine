import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types as MongooseTypes } from 'mongoose';
import { AcademicPeriodEnum } from '@campus/shared';

export type AcademicCalendarDocument = AcademicCalendar & Document;

@Schema({ timestamps: true, collection: 'academic_calendars' })
export class AcademicCalendar {
  _id: MongooseTypes.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Environment',
    required: true,
    index: true,
  })
  _environmentId: MongooseTypes.ObjectId;

  @Prop({ type: String, enum: Object.values(AcademicPeriodEnum), required: true })
  period: AcademicPeriodEnum;

  @Prop({ type: Date, required: true })
  effectiveFrom: Date;

  @Prop({ type: Date, required: true })
  effectiveTo: Date;
}

export const AcademicCalendarSchema = SchemaFactory.createForClass(AcademicCalendar);
AcademicCalendarSchema.index({ _environmentId: 1, effectiveFrom: -1 });

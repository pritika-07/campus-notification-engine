import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession, FilterQuery } from 'mongoose';
import { AcademicCalendar, AcademicCalendarDocument } from './academic-calendar.schema';
import { AcademicPeriodEnum } from '@campus/shared';

@Injectable()
export class AcademicCalendarRepository {
  constructor(
    @InjectModel(AcademicCalendar.name)
    private model: Model<AcademicCalendarDocument>,
  ) {}

  async create(data: Partial<AcademicCalendar>, session?: ClientSession): Promise<AcademicCalendarDocument> {
    const [doc] = await this.model.create([data], session ? { session } : {});
    return doc;
  }

  async find(
    filter: FilterQuery<AcademicCalendarDocument>,
    options?: { limit?: number; sort?: any },
  ): Promise<AcademicCalendarDocument[]> {
    const q = this.model.find(filter);
    if (options?.sort) q.sort(options.sort);
    if (options?.limit) q.limit(options.limit);
    return q.exec();
  }

  async getCurrentPeriodForEnvironment(
    environmentId: string,
    now: Date = new Date(),
  ): Promise<AcademicPeriodEnum> {
    const entry = await this.model
      .findOne({
        _environmentId: environmentId,
        effectiveFrom: { $lte: now },
        effectiveTo: { $gte: now },
      })
      .sort({ effectiveFrom: -1 })
      .exec();
    return entry?.period || AcademicPeriodEnum.REGULAR_WEEK;
  }

  async deleteMany(filter: FilterQuery<AcademicCalendarDocument>, session?: ClientSession): Promise<any> {
    return this.model.deleteMany(filter).session(session || null).exec();
  }
}

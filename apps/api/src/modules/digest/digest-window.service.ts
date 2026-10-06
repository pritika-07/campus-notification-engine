import { Injectable } from '@nestjs/common';
import { AcademicCalendarRepository } from '../integrations/academic-calendar.repository';
import { AcademicPeriodEnum } from '@campus/shared';

export const DIGEST_QUEUE = 'digest-burst';

export interface DigestWindowInput {
  environmentId: string;
  critical?: boolean;
}

@Injectable()
export class DigestWindowService {
  constructor(private academicCalendarRepo: AcademicCalendarRepository) {}

  async getWindowMinutes(input: DigestWindowInput): Promise<number> {
    if (input.critical) {
      const period = await this.academicCalendarRepo.getCurrentPeriodForEnvironment(
        input.environmentId,
      );
      if (period === AcademicPeriodEnum.EXAM_PERIOD) {
        return 0;
      }
    }
    const period = await this.academicCalendarRepo.getCurrentPeriodForEnvironment(
      input.environmentId,
    );
    switch (period) {
      case AcademicPeriodEnum.EXAM_PERIOD:
        return 60;
      case AcademicPeriodEnum.HOLIDAY:
        return 120;
      case AcademicPeriodEnum.ORIENTATION:
        return 15;
      case AcademicPeriodEnum.REGULAR_WEEK:
      default:
        return 5;
    }
  }
}

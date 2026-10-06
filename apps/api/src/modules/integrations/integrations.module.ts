import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IntegrationsController } from './integrations.controller';
import { IntegrationRepository } from './integration.repository';
import { AcademicCalendarRepository } from './academic-calendar.repository';
import { ProviderDecryptionService } from './providers.service';
import { Integration, IntegrationSchema } from './integration.schema';
import { AcademicCalendar, AcademicCalendarSchema } from './academic-calendar.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Integration.name, schema: IntegrationSchema },
      { name: AcademicCalendar.name, schema: AcademicCalendarSchema },
    ]),
  ],
  controllers: [IntegrationsController],
  providers: [IntegrationRepository, AcademicCalendarRepository, ProviderDecryptionService],
  exports: [
    IntegrationRepository,
    AcademicCalendarRepository,
    ProviderDecryptionService,
    MongooseModule,
  ],
})
export class IntegrationsModule {}

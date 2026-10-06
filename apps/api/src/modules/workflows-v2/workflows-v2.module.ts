import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkflowsV2Controller } from './workflows-v2.controller';
import { UpsertWorkflowUseCase } from './usecases/upsert-workflow.usecase';
import { SyncWorkflowUseCase } from './usecases/sync-workflow.usecase';
import { NotificationTemplateRepository } from './notification-template.repository';
import { ControlValuesRepository } from './control-values.repository';
import {
  NotificationTemplate,
  NotificationTemplateSchema,
} from './notification-template.schema';
import { ControlValues, ControlValuesSchema } from './control-values.schema';
import { EnvironmentsModule } from '../environments/environments.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NotificationTemplate.name, schema: NotificationTemplateSchema },
      { name: ControlValues.name, schema: ControlValuesSchema },
    ]),
    EnvironmentsModule,
  ],
  controllers: [WorkflowsV2Controller],
  providers: [
    UpsertWorkflowUseCase,
    SyncWorkflowUseCase,
    NotificationTemplateRepository,
    ControlValuesRepository,
  ],
  exports: [
    NotificationTemplateRepository,
    ControlValuesRepository,
    MongooseModule,
  ],
})
export class WorkflowsV2Module {}

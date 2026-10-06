import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EventsController } from './events.controller';
import { TriggerService } from './trigger.service';
import { NOTIFICATION_QUEUE } from './trigger.service';
import { NotificationDispatchWorker } from './notification-dispatch.worker';
import { ProviderRegistryService } from './providers/provider-registry.service';
import { WorkflowsV2Module } from '../workflows-v2/workflows-v2.module';
import { SubscribersModule } from '../subscribers/subscribers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { JobsModule } from '../jobs/jobs.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { MessagesModule } from '../messages/messages.module';
import { ExecutionDetailsModule } from '../execution-details/execution-details.module';
import { EnvironmentsModule } from '../environments/environments.module';
import { DigestModule } from '../digest/digest.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE,
    }),
    WorkflowsV2Module,
    SubscribersModule,
    NotificationsModule,
    JobsModule,
    IntegrationsModule,
    MessagesModule,
    ExecutionDetailsModule,
    EnvironmentsModule,
    DigestModule,
  ],
  controllers: [EventsController],
  providers: [
    TriggerService,
    NotificationDispatchWorker,
    ProviderRegistryService,
  ],
  exports: [TriggerService, ProviderRegistryService, BullModule],
})
export class EventsModule {}

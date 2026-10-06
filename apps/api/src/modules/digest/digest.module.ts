import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DigestService, DigestFlushWorker } from './digest.service';
import { DigestWindowService } from './digest-window.service';
import { DIGEST_QUEUE } from './digest-window.service';
import { WorkflowsV2Module } from '../workflows-v2/workflows-v2.module';
import { SubscribersModule } from '../subscribers/subscribers.module';
import { MessagesModule } from '../messages/messages.module';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: DIGEST_QUEUE,
    }),
    WorkflowsV2Module,
    SubscribersModule,
    MessagesModule,
    IntegrationsModule,
  ],
  providers: [DigestService, DigestFlushWorker, DigestWindowService],
  exports: [DigestService, DigestWindowService, BullModule],
})
export class DigestModule {}

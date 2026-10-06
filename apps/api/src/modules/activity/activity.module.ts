import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { ExecutionDetailsModule } from '../execution-details/execution-details.module';
import { MessagesModule } from '../messages/messages.module';
import { SubscribersModule } from '../subscribers/subscribers.module';

@Module({
  imports: [ExecutionDetailsModule, MessagesModule, SubscribersModule],
  controllers: [ActivityController],
  exports: [],
})
export class ActivityModule {}

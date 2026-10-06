import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Subscriber, SubscriberSchema } from './subscriber.schema';
import { SubscriberRepository } from './subscriber.repository';
import { SubscribersController } from './subscribers.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Subscriber.name, schema: SubscriberSchema }]),
  ],
  controllers: [SubscribersController],
  providers: [SubscriberRepository],
  exports: [SubscriberRepository, MongooseModule],
})
export class SubscribersModule {}

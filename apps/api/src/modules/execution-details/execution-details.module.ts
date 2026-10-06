import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExecutionDetail, ExecutionDetailSchema } from './execution-detail.schema';
import { ExecutionDetailRepository } from './execution-detail.repository';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ExecutionDetail.name, schema: ExecutionDetailSchema }]),
  ],
  providers: [ExecutionDetailRepository],
  exports: [ExecutionDetailRepository, MongooseModule],
})
export class ExecutionDetailsModule {}

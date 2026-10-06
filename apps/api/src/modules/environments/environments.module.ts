import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Environment, EnvironmentSchema } from './environment.schema';
import { EnvironmentRepository } from './environment.repository';
import { EnvironmentsController } from './environments.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Environment.name, schema: EnvironmentSchema }]),
  ],
  controllers: [EnvironmentsController],
  providers: [EnvironmentRepository],
  exports: [EnvironmentRepository, MongooseModule],
})
export class EnvironmentsModule {}

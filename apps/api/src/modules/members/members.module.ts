import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Member, MemberSchema } from './member.schema';
import { MemberRepository } from './member.repository';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Member.name, schema: MemberSchema }])],
  providers: [MemberRepository],
  exports: [MemberRepository, MongooseModule],
})
export class MembersModule {}

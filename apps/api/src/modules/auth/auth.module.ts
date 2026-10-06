import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { MembersModule } from '../members/members.module';
import { EnvironmentsModule } from '../environments/environments.module';

@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'dev-secret-change-me'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
    UsersModule,
    OrganizationsModule,
    MembersModule,
    EnvironmentsModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    ApiKeyAuthGuard,
    PermissionsGuard,
  ],
  exports: [AuthService, JwtStrategy, ApiKeyAuthGuard, PermissionsGuard, JwtModule],
})
export class AuthModule {}

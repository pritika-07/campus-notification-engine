import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectConnection } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Connection, Types as MongooseTypes } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { UserRepository } from '../users/user.repository';
import { OrganizationRepository } from '../organizations/organization.repository';
import { MemberRepository } from '../members/member.repository';
import { EnvironmentRepository } from '../environments/environment.repository';
import { SignupDto } from './dtos/signup.dto';
import { SigninDto } from './dtos/signin.dto';
import {
  EnvironmentTypeEnum,
  RoleEnum,
  ErrorCode,
  ApiKeyDto,
} from '@campus/shared';

@Injectable()
export class AuthService {
  constructor(
    private userRepo: UserRepository,
    private orgRepo: OrganizationRepository,
    private memberRepo: MemberRepository,
    private envRepo: EnvironmentRepository,
    private jwtService: JwtService,
    @InjectConnection() private connection: Connection,
  ) {}

  async signup(dto: SignupDto) {
    const session = await this.connection.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const existingUser = await this.userRepo.findByEmail(dto.email);
        if (existingUser) {
          throw new ConflictException({
            error: ErrorCode.USER_ALREADY_EXISTS,
            message: 'Email already registered',
          });
        }

        const passwordHash = await bcrypt.hash(dto.password, 10);
        const user = await this.userRepo.create(
          {
            firstName: dto.firstName,
            lastName: dto.lastName,
            email: dto.email,
            password: passwordHash,
            jobTitle: dto.jobTitle,
          },
          session,
        );

        const org = await this.orgRepo.create(
          {
            name: dto.organizationName,
          },
          session,
        );

        const devEnv = await this.envRepo.create(
          {
            type: EnvironmentTypeEnum.DEV,
            identifier: `${org._id.toString()}-dev`,
            _organizationId: org._id,
            apiKeys: [],
          },
          session,
        );

        const prodEnv = await this.envRepo.create(
          {
            type: EnvironmentTypeEnum.PROD,
            identifier: `${org._id.toString()}-prod`,
            _organizationId: org._id,
            _parentId: devEnv._id as MongooseTypes.ObjectId,
            apiKeys: [],
          },
          session,
        );

        await this.memberRepo.create(
          {
            _userId: user._id,
            _organizationId: org._id,
            roles: [RoleEnum.ADMIN],
          },
          session,
        );

        const rawKey = uuidv4();
        const keyHash = await bcrypt.hash(rawKey, 10);
        const apiKey: ApiKeyDto = {
          key: rawKey.slice(0, 16),
          hash: keyHash,
          _userId: user._id.toString(),
        };
        await this.envRepo.updateById(
          devEnv._id.toString(),
          {
            $push: { apiKeys: apiKey as any },
          },
          session,
        );

        return {
          user: {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
          },
          organization: {
            _id: org._id,
            name: org.name,
          },
          environments: {
            dev: devEnv._id,
            prod: prodEnv._id,
          },
          devApiKey: rawKey,
        };
      });

      const token = this.jwtService.sign({
        sub: result.user._id.toString(),
      });

      const userResp = {
        id: result.user._id.toString(),
        _id: result.user._id.toString(),
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        email: result.user.email,
        _environmentId: result.environments.dev.toString(),
        permissions: [
          'workflow:read',
          'workflow:write',
          'subscriber:read',
          'subscriber:write',
          'notification:read',
          'event:write',
          'api_key:read',
          'integration:read',
          'integration:write',
          'activity:read',
          'inbox:read',
          'inbox:write',
          'environment:read',
        ],
        environments: [
          { id: result.environments.dev.toString(), name: 'Development', key: 'dev' },
          { id: result.environments.prod.toString(), name: 'Production', key: 'prod' },
        ],
      };

      return {
        user: userResp,
        organization: result.organization,
        devApiKey: result.devApiKey,
        token,
      };
    } finally {
      await session.endSession();
    }
  }

  async signin(dto: SigninDto) {
    const user = await this.userRepo.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException({
        error: ErrorCode.UNAUTHORIZED,
        message: 'Invalid credentials',
      });
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException({
        error: ErrorCode.UNAUTHORIZED,
        message: 'Invalid credentials',
      });
    }

    const token = this.jwtService.sign({ sub: user._id.toString() });

    const member = await this.memberRepo.findByUserId(user._id.toString());
    const perms: string[] = [];
    if (member) {
      const { ROLE_PERMISSIONS, RoleEnum } = await import('@campus/shared');
      for (const r of member.roles) {
        const p = ROLE_PERMISSIONS[r as RoleEnum];
        if (p) perms.push(...p.map((x) => String(x)));
      }
    }
    const extras = [
      'activity:read',
      'inbox:read',
      'inbox:write',
      'environment:read',
    ];
    for (const e of extras) if (!perms.includes(e)) perms.push(e);

    const envs = await this.envRepo.listForOrganization(
      member?._organizationId?.toString() || '',
    );
    const environments = envs.map((env) => ({
      id: env._id.toString(),
      name: env.type === 'DEV' ? 'Development' : env.type === 'PROD' ? 'Production' : String(env.type),
      key: (env.type || '').toString().toLowerCase(),
    }));

    return {
      token,
      user: {
        id: user._id.toString(),
        _id: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        permissions: perms,
        environments,
      },
    };
  }
}

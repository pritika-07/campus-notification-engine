import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Integration,
  IntegrationDocument,
} from './integration.schema';
import { decrypt } from '../../common/helpers/crypto.helper';

export interface DecryptedIntegration extends Omit<Integration, 'credentials'> {
  credentials: Record<string, any>;
}

@Injectable()
export class ProviderDecryptionService {
  constructor(
    @InjectModel(Integration.name)
    private integrationModel: Model<IntegrationDocument>,
  ) {}

  private getEncryptionKey(): string {
    const key = process.env.ENCRYPTION_KEY || '00000000000000000000000000000000';
    return key.padEnd(64, '0').slice(0, 64);
  }

  async findActiveByChannelDecrypted(
    environmentId: string,
    channel: string,
  ): Promise<DecryptedIntegration | null> {
    const raw = await this.integrationModel
      .findOne({ _environmentId: environmentId, channel, active: true })
      .exec();
    if (!raw) return null;
    return this.decrypt(raw);
  }

  decrypt(raw: IntegrationDocument): DecryptedIntegration {
    const creds = raw.credentials || {};
    const key = this.getEncryptionKey();
    const out: Record<string, any> = {};
    if (creds._encrypted && creds.fields) {
      for (const [k, v] of Object.entries(creds.fields)) {
        try {
          const decrypted = decrypt(v as string, key);
          try {
            out[k] = JSON.parse(decrypted);
          } catch {
            out[k] = decrypted;
          }
        } catch {
          out[k] = v;
        }
      }
    } else {
      Object.assign(out, creds);
    }
    return { ...raw.toObject(), credentials: out } as DecryptedIntegration;
  }
}

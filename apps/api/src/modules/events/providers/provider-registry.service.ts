import { Injectable } from '@nestjs/common';
import { ChannelTypeEnum } from '@campus/shared';
import { Message } from '../../messages/message.schema';

export interface ProviderDispatchInput {
  channel: ChannelTypeEnum;
  providerId: string;
  subscriber: any;
  content: string;
  subject?: string;
  template?: any;
  message: Partial<Message>;
}

export interface ProviderDispatchResult {
  success: boolean;
  providerResponse?: any;
  error?: string;
}

export interface NotificationProvider {
  id: string;
  channel: ChannelTypeEnum;
  dispatch(input: ProviderDispatchInput): Promise<ProviderDispatchResult>;
}

@Injectable()
export class ProviderRegistryService {
  private providers: Map<string, NotificationProvider> = new Map();

  constructor() {
    this.register({
      id: 'stub-email',
      channel: ChannelTypeEnum.EMAIL,
      dispatch: async () => ({
        success: true,
        providerResponse: { stub: true, delivered: true },
      }),
    });
    this.register({
      id: 'stub-sms',
      channel: ChannelTypeEnum.SMS,
      dispatch: async () => ({
        success: true,
        providerResponse: { stub: true, delivered: true },
      }),
    });
    this.register({
      id: 'stub-push',
      channel: ChannelTypeEnum.PUSH,
      dispatch: async () => ({
        success: true,
        providerResponse: { stub: true, delivered: true },
      }),
    });
    this.register({
      id: 'stub-chat',
      channel: ChannelTypeEnum.CHAT,
      dispatch: async () => ({
        success: true,
        providerResponse: { stub: true, delivered: true },
      }),
    });
  }

  register(provider: NotificationProvider) {
    this.providers.set(`${provider.channel}:${provider.id}`, provider);
    this.providers.set(provider.id, provider);
  }

  find(channel: ChannelTypeEnum, id?: string): NotificationProvider | undefined {
    if (id) {
      return this.providers.get(id) || this.providers.get(`${channel}:${id}`);
    }
    return (
      this.providers.get(`${channel}:stub-${channel}`) ||
      Array.from(this.providers.values()).find((p) => p.channel === channel)
    );
  }
}

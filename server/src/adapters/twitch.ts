import tmi from 'tmi.js';
import { randomUUID } from 'crypto';
import type { ChatMessage, StreamSource } from '../../../shared/types.js';
import type { MessageHandler, PlatformAdapter, StatusHandler } from './types.js';
import { createSourceId } from './types.js';
import { parseStreamInput } from './parseInput.js';
import {
  fetchHelixBadgeMaps,
  getAppAccessToken,
  resolveTwitchBadges,
  resolveTwitchUserId,
  type BadgeMap,
} from './twitchBadges.js';

interface ChannelState {
  source: StreamSource;
  broadcasterId?: string;
  channelBadges: BadgeMap;
}

export class TwitchAdapter implements PlatformAdapter {
  readonly platform = 'twitch' as const;
  private client: tmi.Client | null = null;
  private channels = new Map<string, ChannelState>();
  private messageHandlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private globalBadges: BadgeMap = new Map();
  private helixToken: string | null = null;
  private clientId = process.env.TWITCH_CLIENT_ID ?? '';
  private clientSecret = process.env.TWITCH_CLIENT_SECRET ?? '';

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onStatus(handler: StatusHandler): void {
    this.statusHandlers.push(handler);
  }

  getSources(): StreamSource[] {
    return [...this.channels.values()].map((c) => c.source);
  }

  private emitStatus(source: StreamSource): void {
    for (const h of this.statusHandlers) h(source);
  }

  private emitMessage(msg: ChatMessage): void {
    for (const h of this.messageHandlers) h(msg);
  }

  private async ensureClient(): Promise<tmi.Client> {
    if (this.client) return this.client;

    if (this.clientId && this.clientSecret) {
      this.helixToken = await getAppAccessToken(this.clientId, this.clientSecret);
      if (this.helixToken) {
        const maps = await fetchHelixBadgeMaps(this.clientId, this.helixToken);
        this.globalBadges = maps.global;
      }
    }

    this.client = new tmi.Client({
      options: { debug: false, skipUpdatingEmotesets: true },
      connection: { reconnect: true, secure: true },
      // Anonymous read-only IRC — no OAuth required for public chat
      identity: undefined,
      channels: [],
    });

    this.client.on('message', (channel, tags, message, self) => {
      if (self) return;
      const login = channel.replace(/^#/, '').toLowerCase();
      const sourceId = createSourceId('twitch', login);
      const state = this.channels.get(sourceId);
      if (!state) return;

      const badgeObj = (tags.badges ?? null) as Record<string, string> | null;
      const badges = resolveTwitchBadges(badgeObj, state.channelBadges, this.globalBadges);

      const bits = tags.bits ? Number(tags.bits) : undefined;
      const chatMsg: ChatMessage = {
        id: tags.id ?? randomUUID(),
        platform: 'twitch',
        channelId: sourceId,
        channelName: state.source.displayName,
        userId: tags['user-id'] ?? tags.username ?? 'unknown',
        username: tags.username ?? 'unknown',
        displayName: tags['display-name'] ?? tags.username ?? 'unknown',
        color: tags.color ?? undefined,
        message,
        timestamp: tags['tmi-sent-ts'] ? Number(tags['tmi-sent-ts']) : Date.now(),
        badges,
        isAction: tags['message-type'] === 'action',
        donation: bits
          ? { kind: 'bits', amount: bits, label: `${bits} Bits` }
          : undefined,
      };
      this.emitMessage(chatMsg);
    });

    await this.client.connect();
    return this.client;
  }

  async connect(input: string): Promise<StreamSource> {
    const parsed = parseStreamInput(input);
    if (parsed.platform !== 'twitch') {
      throw new Error('Not a Twitch channel');
    }
    const login = parsed.identifier.toLowerCase();
    const sourceId = createSourceId('twitch', login);

    if (this.channels.has(sourceId)) {
      return this.channels.get(sourceId)!.source;
    }

    const source: StreamSource = {
      id: sourceId,
      platform: 'twitch',
      identifier: login,
      displayName: login,
      connected: false,
      input,
    };
    this.channels.set(sourceId, { source, channelBadges: new Map() });
    this.emitStatus(source);

    try {
      const client = await this.ensureClient();

      if (this.clientId && this.helixToken) {
        const user = await resolveTwitchUserId(login, this.clientId, this.helixToken);
        if (user) {
          source.displayName = user.displayName;
          const maps = await fetchHelixBadgeMaps(this.clientId, this.helixToken, user.id);
          this.globalBadges = maps.global;
          this.channels.get(sourceId)!.broadcasterId = user.id;
          this.channels.get(sourceId)!.channelBadges = maps.channel;
        }
      }

      await client.join(login);
      source.connected = true;
      source.error = undefined;
      this.channels.set(sourceId, {
        ...this.channels.get(sourceId)!,
        source: { ...source },
      });
      this.emitStatus({ ...source });
      return { ...source };
    } catch (err) {
      source.connected = false;
      source.error = err instanceof Error ? err.message : String(err);
      this.emitStatus({ ...source });
      throw err;
    }
  }

  async disconnect(sourceId: string): Promise<void> {
    const state = this.channels.get(sourceId);
    if (!state) return;
    try {
      await this.client?.part(state.source.identifier);
    } catch {
      // ignore
    }
    this.channels.delete(sourceId);
    this.emitStatus({ ...state.source, connected: false });
    if (this.channels.size === 0 && this.client) {
      await this.client.disconnect().catch(() => undefined);
      this.client = null;
    }
  }

  async disconnectAll(): Promise<void> {
    for (const id of [...this.channels.keys()]) {
      await this.disconnect(id);
    }
  }
}

import { randomUUID } from 'crypto';
import type { ChatBadge, ChatMessage, StreamSource } from '../../../shared/types.js';
import type { MessageHandler, PlatformAdapter, StatusHandler } from './types.js';
import { createSourceId } from './types.js';
import { parseStreamInput } from './parseInput.js';

/**
 * TikTok has no official public Live Chat API.
 * We use `tiktok-live-connector` (unofficial Webcast reverse-engineering).
 * Badges/roles available vary by stream and library version: moderator,
 * gifter level, fan club, and top-gifter style badges when present on the
 * user object. Gift events are surfaced as donation messages.
 *
 * Limitations are documented in README — expect breakage if TikTok changes
 * their Webcast protocol; creator must be LIVE to connect.
 */

type TikTokConnection = {
  connect: () => Promise<unknown>;
  disconnect: () => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
};

interface TTState {
  source: StreamSource;
  connection: TikTokConnection | null;
}

export class TikTokAdapter implements PlatformAdapter {
  readonly platform = 'tiktok' as const;
  private channels = new Map<string, TTState>();
  private messageHandlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];

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

  async connect(input: string): Promise<StreamSource> {
    const parsed = parseStreamInput(input);
    if (parsed.platform !== 'tiktok') throw new Error('Not a TikTok channel');

    const uniqueId = parsed.identifier.replace(/^@/, '');
    const sourceId = createSourceId('tiktok', uniqueId);
    if (this.channels.has(sourceId)) return this.channels.get(sourceId)!.source;

    const source: StreamSource = {
      id: sourceId,
      platform: 'tiktok',
      identifier: uniqueId,
      displayName: `@${uniqueId}`,
      connected: false,
      input,
    };
    this.channels.set(sourceId, { source, connection: null });
    this.emitStatus(source);

    try {
      const mod = await import('tiktok-live-connector');
      // Support both v1 (WebcastPushConnection) and v2 (TikTokLiveConnection) exports
      const ConnClass =
        (mod as { WebcastPushConnection?: new (u: string, o?: object) => TikTokConnection })
          .WebcastPushConnection ??
        (mod as { TikTokLiveConnection?: new (u: string, o?: object) => TikTokConnection })
          .TikTokLiveConnection;

      if (!ConnClass) {
        throw new Error('tiktok-live-connector export not found');
      }

      const options: Record<string, unknown> = {
        processInitialData: true,
        enableExtendedGiftInfo: true,
      };
      if (process.env.TIKTOK_SESSION_ID) {
        options.sessionId = process.env.TIKTOK_SESSION_ID;
      }

      const connection = new ConnClass(uniqueId, options);

      connection.on('chat', (...args: unknown[]) => {
        const data = args[0] as Record<string, unknown>;
        const msg = mapTikTokChat(data, source);
        if (msg) this.emitMessage(msg);
      });

      connection.on('gift', (...args: unknown[]) => {
        const data = args[0] as Record<string, unknown>;
        const msg = mapTikTokGift(data, source);
        if (msg) this.emitMessage(msg);
      });

      // Some versions use enum-style WebcastEvent
      connection.on('error', (...args: unknown[]) => {
        const err = args[0];
        const message = err instanceof Error ? err.message : String(err);
        const updated = { ...source, connected: false, error: message };
        this.channels.set(sourceId, {
          source: updated,
          connection,
        });
        this.emitStatus(updated);
      });

      connection.on('disconnected', () => {
        const updated = { ...source, connected: false, error: 'Disconnected' };
        this.channels.set(sourceId, { source: updated, connection });
        this.emitStatus(updated);
      });

      connection.on('streamEnd', () => {
        const updated = { ...source, connected: false, error: 'Stream ended' };
        this.channels.set(sourceId, { source: updated, connection });
        this.emitStatus(updated);
      });

      await connection.connect();

      const connected: StreamSource = {
        ...source,
        connected: true,
        error: undefined,
      };
      this.channels.set(sourceId, { source: connected, connection });
      this.emitStatus(connected);
      return connected;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed: StreamSource = {
        ...source,
        connected: false,
        error:
          message.includes('LIVE') || message.includes('offline')
            ? `Creator @${uniqueId} does not appear to be LIVE right now. ${message}`
            : message,
      };
      this.channels.set(sourceId, { source: failed, connection: null });
      this.emitStatus(failed);
      throw new Error(failed.error);
    }
  }

  async disconnect(sourceId: string): Promise<void> {
    const state = this.channels.get(sourceId);
    if (!state) return;
    try {
      state.connection?.disconnect();
    } catch {
      // ignore
    }
    this.channels.delete(sourceId);
    this.emitStatus({ ...state.source, connected: false });
  }

  async disconnectAll(): Promise<void> {
    for (const id of [...this.channels.keys()]) await this.disconnect(id);
  }
}

function mapTikTokUser(data: Record<string, unknown>): {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  badges: ChatBadge[];
} {
  const user = (data.user ?? data) as Record<string, unknown>;
  const userId = String(user.userId ?? user.id ?? data.userId ?? 'unknown');
  const username = String(user.uniqueId ?? user.unique_id ?? data.uniqueId ?? 'unknown');
  const displayName = String(
    user.nickname ?? user.nickName ?? data.nickname ?? username,
  );
  const avatarUrl = pickAvatar(user);

  const badges = extractTikTokBadges(user, data);
  return { userId, username, displayName, avatarUrl, badges };
}

function pickAvatar(user: Record<string, unknown>): string | undefined {
  const profile = user.profilePictureUrl ?? user.profilePicture;
  if (typeof profile === 'string') return profile;
  if (profile && typeof profile === 'object') {
    const urls = (profile as { url?: string[] }).url;
    if (Array.isArray(urls) && urls[0]) return urls[0];
  }
  return undefined;
}

export function extractTikTokBadges(
  user: Record<string, unknown>,
  data: Record<string, unknown> = {},
): ChatBadge[] {
  const badges: ChatBadge[] = [];

  const userBadges = (user.userBadges ??
    user.badges ??
    data.userBadges ??
    []) as Array<Record<string, unknown>>;

  if (Array.isArray(userBadges)) {
    for (const b of userBadges) {
      const name = String(b.name ?? b.badgeSceneType ?? b.type ?? 'badge');
      const url =
        (typeof b.url === 'string' && b.url) ||
        (Array.isArray((b as { url?: string[] }).url)
          ? (b as { url: string[] }).url[0]
          : undefined) ||
        (typeof b.displayType === 'string' ? undefined : undefined);
      const imageUrl =
        url ||
        (typeof (b as { imageUrl?: string }).imageUrl === 'string'
          ? (b as { imageUrl: string }).imageUrl
          : undefined);
      badges.push({
        id: String(b.badgeSceneType ?? b.type ?? name).toLowerCase(),
        label: name,
        imageUrl,
        color: '#fe2c55',
      });
    }
  }

  // Moderator / operator flags (field names vary by connector version)
  if (user.isModerator || user.user_moderator || data.isModerator) {
    if (!badges.some((b) => b.id.includes('mod'))) {
      badges.push({ id: 'moderator', label: 'Moderator', color: '#20d5ec' });
    }
  }

  const gifterLevel = Number(
    user.gifterLevel ?? user.giftLevel ?? (user as { gifter_level?: number }).gifter_level ?? 0,
  );
  if (gifterLevel > 0 && !badges.some((b) => b.id.includes('gift'))) {
    badges.push({
      id: 'gifter',
      label: `Gifter Lv.${gifterLevel}`,
      version: String(gifterLevel),
      color: '#ffb84d',
    });
  }

  const teamMember = user.isFanTicketMember || user.fanClub;
  if (teamMember && !badges.some((b) => /fan|club|team/i.test(b.id))) {
    const clubName =
      typeof user.fanClub === 'object' && user.fanClub
        ? String((user.fanClub as { name?: string }).name ?? 'Fan Club')
        : 'Fan Club';
    badges.push({ id: 'fanclub', label: clubName, color: '#ff6a88' });
  }

  if (user.isNewGifter) {
    badges.push({ id: 'new-gifter', label: 'New Gifter', color: '#ffb84d' });
  }

  return badges;
}

function mapTikTokChat(
  data: Record<string, unknown>,
  source: StreamSource,
): ChatMessage | null {
  const comment = String(data.comment ?? data.text ?? '');
  if (!comment) return null;
  const u = mapTikTokUser(data);
  return {
    id: String(data.msgId ?? data.messageId ?? randomUUID()),
    platform: 'tiktok',
    channelId: source.id,
    channelName: source.displayName,
    userId: u.userId,
    username: u.username,
    displayName: u.displayName,
    message: comment,
    timestamp: Number(data.createTime ?? data.timestamp ?? Date.now()),
    badges: u.badges,
    avatarUrl: u.avatarUrl,
  };
}

function mapTikTokGift(
  data: Record<string, unknown>,
  source: StreamSource,
): ChatMessage | null {
  const u = mapTikTokUser(data);
  const giftMeta = (data.gift ?? data.extendedGiftInfo ?? {}) as {
    name?: string;
    repeat_count?: number;
    diamond_count?: number;
  };
  const giftName = String(
    (data.giftName as string) ?? giftMeta.name ?? 'Gift',
  );
  const repeat = Number(data.repeatCount ?? giftMeta.repeat_count ?? 1);
  const diamonds = Number(
    data.diamondCount ?? data.diamond_count ?? giftMeta.diamond_count ?? 0,
  );
  const describe = String(data.describe ?? `${u.displayName} sent ${giftName}`);

  return {
    id: String(data.msgId ?? randomUUID()),
    platform: 'tiktok',
    channelId: source.id,
    channelName: source.displayName,
    userId: u.userId,
    username: u.username,
    displayName: u.displayName,
    message: describe,
    timestamp: Number(data.createTime ?? Date.now()),
    badges: u.badges,
    avatarUrl: u.avatarUrl,
    donation: {
      kind: 'gift',
      amount: diamonds || repeat,
      label: `${giftName}${repeat > 1 ? ` x${repeat}` : ''}${diamonds ? ` · ${diamonds}💎` : ''}`,
    },
  };
}

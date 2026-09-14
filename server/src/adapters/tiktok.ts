import { randomUUID } from 'crypto';
import {
  ControlEvent,
  SignConfig,
  TikTokLiveConnection,
  WebcastEvent,
  type TikTokLiveConstructorConnectionOptions,
} from 'tiktok-live-connector';
import type { ChatBadge, ChatMessage, StreamSource } from '../../../shared/types.js';
import type { MessageHandler, PlatformAdapter, StatusHandler } from './types.js';
import { createSourceId } from './types.js';
import { parseStreamInput } from './parseInput.js';

/**
 * TikTok has no official public Live Chat API.
 * We use `tiktok-live-connector` v2 (TikTokLiveConnection + Euler signing).
 * Badges/roles available vary by stream and library version: moderator,
 * gifter level, fan club, and top-gifter style badges when present on the
 * user object. Gift events are surfaced as donation messages.
 *
 * Limitations are documented in README — expect breakage if TikTok changes
 * their Webcast protocol; creator must be LIVE to connect.
 *
 * Chat connect uses free Euler rooms signing. Gift catalog prefetch is off
 * (enableExtendedGiftInfo: false) so Business-plan gift/list signing is not used.
 * Gift chat events still arrive over the Webcast socket.
 *
 * Anonymous WebSocket connections often receive gifts but heavily filter chat.
 * For full chat, set TIKTOK_SESSION_ID (+ optional TIKTOK_TT_TARGET_IDC) in
 * %APPDATA%\Chorus\.env — Chorus then enables authenticateWs and whitelists
 * the Euler sign host. Optionally set a free Euler Community key as
 * TIKTOK_SIGN_API_KEY. Do not buy Business.
 */

interface TTState {
  source: StreamSource;
  connection: TikTokLiveConnection | null;
}

function resolveTikTokSessionId(): string | undefined {
  const raw =
    process.env.TIKTOK_SESSION_ID?.trim() ||
    process.env.TIKTOK_SESSIONID?.trim() ||
    '';
  return raw || undefined;
}

function resolveTikTokTargetIdc(): string {
  return (
    process.env.TIKTOK_TT_TARGET_IDC?.trim() ||
    process.env.TIKTOK_TARGET_IDC?.trim() ||
    'useast1a'
  );
}

function resolveSignApiKey(): string | undefined {
  const raw =
    process.env.TIKTOK_SIGN_API_KEY?.trim() ||
    process.env.SIGN_API_KEY?.trim() ||
    '';
  return raw || undefined;
}

/** Host of the Euler sign API (for WHITELIST_AUTHENTICATED_SESSION_ID_HOST). */
function resolveEulerSignHost(): string {
  const base =
    (typeof SignConfig.basePath === 'string' && SignConfig.basePath) ||
    process.env.SIGN_API_URL ||
    'https://api.eulerstream.com';
  try {
    return new URL(base).host;
  } catch {
    return 'api.eulerstream.com';
  }
}

const SESSION_CHAT_HINT =
  'Gifts may appear without a session, but full TikTok chat usually needs TIKTOK_SESSION_ID (+ optional TIKTOK_TT_TARGET_IDC) in %APPDATA%\\Chorus\\.env. Restart Chorus after editing.';

function formatTikTokConnectError(uniqueId: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  const appdataHint =
    'Set TIKTOK_SESSION_ID (your TikTok sessionid cookie while logged in) in %APPDATA%\\Chorus\\.env and reconnect. Creator must be LIVE.';

  // Paid Euler gift-catalog signing — Chorus bug in older builds; do NOT buy Business.
  if (
    lower.includes('business plan') ||
    lower.includes('eulerstream.com/pricing') ||
    lower.includes('premiumfeature') ||
    lower.includes('requires a business')
  ) {
    return (
      'TikTok connect failed due to a Chorus bug (gift catalog signing used a paid Euler route). ' +
      'Do NOT purchase an Euler Business plan. Update to Chorus 1.0.2+ and reconnect while the creator is LIVE. ' +
      'Session cookie is optional; only if connect still fails after updating, set a free Euler Community API key as TIKTOK_SIGN_API_KEY in %APPDATA%\\Chorus\\.env. ' +
      `Details: ${message}`
    );
  }

  if (
    lower.includes('403') ||
    lower.includes('failed to sign') ||
    lower.includes('sign request') ||
    lower.includes('signapi') ||
    lower.includes('signature')
  ) {
    return `TikTok signing failed (403). ${appdataHint} Details: ${message}`;
  }

  if (
    lower.includes('whitelist') ||
    lower.includes('authenticatedwebsocket') ||
    lower.includes('authenticate_websocket')
  ) {
    return (
      `TikTok authenticated WebSocket failed. Ensure WHITELIST is set automatically (restart Chorus) and TIKTOK_SESSION_ID is valid. ` +
      `Details: ${message}`
    );
  }

  if (
    lower.includes('offline') ||
    lower.includes('not live') ||
    lower.includes("isn't live") ||
    lower.includes('is not live') ||
    lower.includes('useroffline') ||
    lower.includes('room id') ||
    lower.includes('retrieve room')
  ) {
    return `Creator @${uniqueId} does not appear to be LIVE right now. ${message}`;
  }

  return message;
}

function errorMessageFromEventArg(arg: unknown): string {
  if (arg instanceof Error) return arg.message;
  if (arg && typeof arg === 'object') {
    const obj = arg as { exception?: unknown; info?: unknown; message?: unknown };
    if (obj.exception instanceof Error) return obj.exception.message;
    if (typeof obj.exception === 'string' && obj.exception) return obj.exception;
    if (typeof obj.message === 'string' && obj.message) return obj.message;
    if (typeof obj.info === 'string' && obj.info) return obj.info;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
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
      const sessionId = resolveTikTokSessionId();
      const signApiKey = resolveSignApiKey();

      // Build options as one object so the session+authenticateWs discriminant type-checks.
      // Authenticated WS is required for full chat; anonymous often only sees gifts.
      const options: TikTokLiveConstructorConnectionOptions = sessionId
        ? {
            processInitialData: true,
            enableExtendedGiftInfo: false, // gift events still arrive over WS; skip paid gift/list/ prefetch
            fetchRoomInfoOnConnect: true,
            authenticateWs: true,
            session: {
              cookie: {
                type: 'cookie',
                value: {
                  sessionId,
                  ttTargetIdc: resolveTikTokTargetIdc(),
                },
              },
            },
            ...(signApiKey ? { signApiKey } : {}),
          }
        : {
            processInitialData: true,
            enableExtendedGiftInfo: false,
            fetchRoomInfoOnConnect: true,
            authenticateWs: false,
            ...(signApiKey ? { signApiKey } : {}),
          };

      // SDK requires this env var when authenticateWs is true (must match SignConfig host).
      if (sessionId) {
        process.env.WHITELIST_AUTHENTICATED_SESSION_ID_HOST = resolveEulerSignHost();
      }

      // v2 class extends TypedEventEmitter at runtime; DT declaration omits `.on` on the class body.
      const connection = new TikTokLiveConnection(uniqueId, options);
      const emitter = connection as TikTokLiveConnection & {
        on: (event: string | symbol, cb: (...args: unknown[]) => void) => unknown;
      };

      emitter.on(WebcastEvent.CHAT, (...args: unknown[]) => {
        const data = args[0] as Record<string, unknown>;
        const msg = mapTikTokChat(data, source);
        if (msg) this.emitMessage(msg);
      });

      emitter.on(WebcastEvent.EMOTE, (...args: unknown[]) => {
        const data = args[0] as Record<string, unknown>;
        const msg = mapTikTokEmote(data, source);
        if (msg) this.emitMessage(msg);
      });

      emitter.on(WebcastEvent.GIFT, (...args: unknown[]) => {
        const data = args[0] as Record<string, unknown>;
        const msg = mapTikTokGift(data, source);
        if (msg) this.emitMessage(msg);
      });

      emitter.on(ControlEvent.ERROR, (...args: unknown[]) => {
        const message = errorMessageFromEventArg(args[0]);
        const updated = { ...source, connected: false, error: message };
        this.channels.set(sourceId, {
          source: updated,
          connection,
        });
        this.emitStatus(updated);
      });

      emitter.on(ControlEvent.DISCONNECTED, () => {
        const updated = { ...source, connected: false, error: 'Disconnected' };
        this.channels.set(sourceId, { source: updated, connection });
        this.emitStatus(updated);
      });

      emitter.on(WebcastEvent.STREAM_END, () => {
        const updated = { ...source, connected: false, error: 'Stream ended' };
        this.channels.set(sourceId, { source: updated, connection });
        this.emitStatus(updated);
      });

      await connection.connect();

      const connected: StreamSource = {
        ...source,
        connected: true,
        // Non-fatal hint when anonymous — gifts work, chat is often filtered.
        error: sessionId ? undefined : SESSION_CHAT_HINT,
      };
      this.channels.set(sourceId, { source: connected, connection });
      this.emitStatus(connected);
      return connected;
    } catch (err) {
      const friendly = formatTikTokConnectError(uniqueId, err);
      const failed: StreamSource = {
        ...source,
        connected: false,
        error: friendly,
      };
      this.channels.set(sourceId, { source: failed, connection: null });
      this.emitStatus(failed);
      throw new Error(friendly);
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
          : undefined);
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

/** Pull a displayable chat string from common connector / proto shapes. */
function extractChatComment(data: Record<string, unknown>): string {
  const nested = data.chatMessage;
  const nestedObj =
    nested && typeof nested === 'object'
      ? (nested as Record<string, unknown>)
      : undefined;

  const candidates: unknown[] = [
    data.comment,
    data.text,
    data.content,
    nestedObj?.comment,
    nestedObj?.text,
    nestedObj?.content,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }

  // Emotes embedded on a chat message (subscriber stickers inline).
  const emoteFallback = formatEmoteList(data.emotes ?? data.emoteList ?? nestedObj?.emotes);
  if (emoteFallback) return emoteFallback;

  return '';
}

function formatEmoteList(raw: unknown): string {
  if (!Array.isArray(raw) || raw.length === 0) return '';
  const parts: string[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    // EmoteWithIndex nests under .emote; EmoteModel is flat.
    const emote = (e.emote && typeof e.emote === 'object'
      ? (e.emote as Record<string, unknown>)
      : e) as Record<string, unknown>;
    const id = emote.emoteId ?? emote.uuid ?? emote.id;
    const image = emote.image as { urlList?: string[]; uri?: string } | undefined;
    const url =
      (Array.isArray(image?.urlList) && image.urlList[0]) ||
      (typeof image?.uri === 'string' && image.uri) ||
      '';
    if (typeof id === 'string' && id) {
      parts.push(url ? `[emote:${id}]` : `[emote:${id}]`);
    } else if (url) {
      parts.push('[emote]');
    }
  }
  return parts.length ? parts.join(' ') : '';
}

function mapTikTokChat(
  data: Record<string, unknown>,
  source: StreamSource,
): ChatMessage | null {
  const comment = extractChatComment(data);
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

function mapTikTokEmote(
  data: Record<string, unknown>,
  source: StreamSource,
): ChatMessage | null {
  const emoteText =
    formatEmoteList(data.emoteList ?? data.emotes) ||
    extractChatComment(data) ||
    '[emote]';
  const u = mapTikTokUser(data);
  return {
    id: String(data.msgId ?? data.messageId ?? randomUUID()),
    platform: 'tiktok',
    channelId: source.id,
    channelName: source.displayName,
    userId: u.userId,
    username: u.username,
    displayName: u.displayName,
    message: emoteText,
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
  const giftDetails = (data.giftDetails ?? data.gift ?? {}) as Record<string, unknown>;
  const giftMeta = (data.extendedGiftInfo ?? {}) as {
    name?: string;
    repeat_count?: number;
    diamond_count?: number;
  };
  const giftName = String(
    (data.giftName as string) ??
      giftDetails.giftName ??
      giftDetails.name ??
      giftMeta.name ??
      'Gift',
  );
  const repeat = Number(
    data.repeatCount ?? giftDetails.repeatCount ?? giftMeta.repeat_count ?? 1,
  );
  const diamonds = Number(
    data.diamondCount ??
      data.diamond_count ??
      giftDetails.diamondCount ??
      giftDetails.diamond_count ??
      giftMeta.diamond_count ??
      0,
  );
  const describe = String(data.describe ?? `${u.displayName} sent ${giftName}`);

  // Skip in-progress streak ticks for streakable gifts (giftType === 1)
  const giftType = Number(giftDetails.giftType ?? data.giftType ?? 0);
  if (giftType === 1 && data.repeatEnd === false) {
    return null;
  }

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

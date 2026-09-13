import { google, youtube_v3 } from 'googleapis';
import { randomUUID } from 'crypto';
import { Innertube, UniversalCache, YTNodes } from 'youtubei.js';
import type { ChatBadge, ChatMessage, StreamSource } from '../../../shared/types.js';
import type { MessageHandler, PlatformAdapter, StatusHandler } from './types.js';
import { createSourceId } from './types.js';
import { parseStreamInput } from './parseInput.js';

type YTMode = 'innertube' | 'api';

interface YTChannelState {
  source: StreamSource;
  mode: YTMode;
  /** Official Data API liveChatId (api mode) */
  liveChatId?: string;
  nextPageToken?: string;
  pollTimer?: ReturnType<typeof setTimeout>;
  seenIds: Set<string>;
  /** Innertube live chat handle */
  liveChat?: { stop: () => void };
}

/**
 * YouTube Live Chat:
 * 1. Default: unofficial Innertube via `youtubei.js` (no Google Cloud key).
 * 2. Optional fallback: official Data API v3 when `YOUTUBE_API_KEY` is set.
 *
 * Roles mapped when the source provides them: owner, moderator, member, verified.
 * Membership tier badge *images* are best-effort from Innertube author badges.
 */
export class YouTubeAdapter implements PlatformAdapter {
  readonly platform = 'youtube' as const;
  private yt: youtube_v3.Youtube | null = null;
  private innertube: Innertube | null = null;
  private channels = new Map<string, YTChannelState>();
  private messageHandlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private apiKey = process.env.YOUTUBE_API_KEY?.trim() ?? '';

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

  private async ensureInnertube(): Promise<Innertube> {
    if (!this.innertube) {
      this.innertube = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true,
      });
    }
    return this.innertube;
  }

  private ensureApiClient(): youtube_v3.Youtube {
    if (!this.apiKey) {
      throw new Error('YOUTUBE_API_KEY is not set');
    }
    if (!this.yt) {
      this.yt = google.youtube({ version: 'v3', auth: this.apiKey });
    }
    return this.yt;
  }

  async connect(input: string): Promise<StreamSource> {
    const parsed = parseStreamInput(input);
    if (parsed.platform !== 'youtube') throw new Error('Not a YouTube channel');

    // Prefer Innertube (no key). Fall back to official API only if a key is present.
    try {
      return await this.connectInnertube(input, parsed);
    } catch (innertubeErr) {
      if (!this.apiKey) {
        throw new Error(formatYouTubeConnectError(innertubeErr));
      }
      try {
        return await this.connectOfficialApi(input, parsed);
      } catch (apiErr) {
        const a = innertubeErr instanceof Error ? innertubeErr.message : String(innertubeErr);
        const b = apiErr instanceof Error ? apiErr.message : String(apiErr);
        throw new Error(
          formatYouTubeConnectError(
            new Error(`Innertube: ${a} | Data API fallback: ${b}`),
          ),
        );
      }
    }
  }

  private async connectInnertube(
    input: string,
    parsed: ReturnType<typeof parseStreamInput>,
  ): Promise<StreamSource> {
    const yt = await this.ensureInnertube();
    const videoId = await this.resolveVideoIdInnertube(yt, parsed, input);

    const info = await yt.getInfo(videoId);
    const basic = info.basic_info;
    if (!basic?.is_live && !info.livechat) {
      throw new Error(
        `No active live chat for this video/channel (is the stream live?). Video: ${videoId}`,
      );
    }

    const channelKey = basic?.channel_id || parsed.identifier || videoId;
    const sourceId = createSourceId('youtube', channelKey);
    if (this.channels.has(sourceId)) return this.channels.get(sourceId)!.source;

    const source: StreamSource = {
      id: sourceId,
      platform: 'youtube',
      identifier: channelKey,
      displayName: basic?.author || basic?.title || parsed.identifier,
      connected: false,
      input,
    };
    this.emitStatus(source);

    let liveChat;
    try {
      liveChat = info.getLiveChat();
    } catch (err) {
      throw new Error(
        err instanceof Error
          ? err.message
          : 'Could not open YouTube live chat (stream may be offline or chat disabled).',
      );
    }

    const state: YTChannelState = {
      source: { ...source, connected: true, error: undefined },
      mode: 'innertube',
      seenIds: new Set(),
      liveChat,
    };
    this.channels.set(sourceId, state);

    liveChat.on('chat-update', (action: unknown) => {
      const current = this.channels.get(sourceId);
      if (!current || current.mode !== 'innertube') return;
      const msg = mapInnertubeChatAction(action, current.source, current.seenIds);
      if (msg) this.emitMessage(msg);
    });

    liveChat.on('error', (err: Error) => {
      const current = this.channels.get(sourceId);
      if (!current) return;
      current.source = {
        ...current.source,
        connected: false,
        error: err?.message || String(err),
      };
      this.emitStatus(current.source);
    });

    liveChat.on('end', () => {
      const current = this.channels.get(sourceId);
      if (!current) return;
      current.source = {
        ...current.source,
        connected: false,
        error: 'Stream ended',
      };
      this.emitStatus(current.source);
    });

    liveChat.start();
    this.emitStatus(state.source);
    return state.source;
  }

  private async resolveVideoIdInnertube(
    yt: Innertube,
    parsed: ReturnType<typeof parseStreamInput>,
    input: string,
  ): Promise<string> {
    if (parsed.youtubeVideoId) return parsed.youtubeVideoId;

    const identifier = parsed.identifier.replace(/^@/, '');
    const candidates: string[] = [];

    if (/^https?:\/\//i.test(input)) {
      candidates.push(input);
      if (!/\/live\/?$/i.test(input) && !/[?&]v=/.test(input) && !/\/live\//i.test(input)) {
        candidates.push(input.replace(/\/?$/, '/live'));
      }
    }

    if (/^UC[\w-]{20,}$/.test(identifier)) {
      candidates.push(`https://www.youtube.com/channel/${identifier}/live`);
      candidates.push(`https://www.youtube.com/channel/${identifier}`);
    } else {
      candidates.push(`https://www.youtube.com/@${identifier}/live`);
      candidates.push(`https://www.youtube.com/@${identifier}`);
    }

    const tried = new Set<string>();
    for (const url of candidates) {
      if (tried.has(url)) continue;
      tried.add(url);
      try {
        const ep = await yt.resolveURL(url);
        const videoId = ep?.payload?.videoId as string | undefined;
        if (videoId) return videoId;

        const browseId = ep?.payload?.browseId as string | undefined;
        if (browseId?.startsWith('UC')) {
          const fromChannel = await this.findLiveOnChannel(yt, browseId);
          if (fromChannel) return fromChannel;
        }
      } catch {
        // try next candidate
      }
    }

    throw new Error(
      `Could not resolve a live YouTube video for "${parsed.identifier}". Paste a live watch/live URL, or make sure the channel is LIVE.`,
    );
  }

  private async findLiveOnChannel(yt: Innertube, channelId: string): Promise<string | null> {
    try {
      const liveEp = await yt.resolveURL(`https://www.youtube.com/channel/${channelId}/live`);
      const vid = liveEp?.payload?.videoId as string | undefined;
      if (vid) return vid;
    } catch {
      // fall through
    }

    try {
      const ch = await yt.getChannel(channelId);
      if (!ch.has_live_streams) return null;
      const lives = await ch.getLiveStreams();
      for (const item of lives.videos ?? []) {
        const anyItem = item as {
          id?: string;
          content_id?: string;
          is_live?: boolean;
          type?: string;
        };
        const id = anyItem.id || anyItem.content_id;
        if (!id) continue;
        if (anyItem.is_live === false) continue;
        return id;
      }
    } catch {
      // ignore
    }
    return null;
  }

  private async connectOfficialApi(
    input: string,
    parsed: ReturnType<typeof parseStreamInput>,
  ): Promise<StreamSource> {
    const yt = this.ensureApiClient();
    let videoId = parsed.youtubeVideoId;
    let channelTitle = parsed.identifier;
    let channelKey = parsed.identifier;

    if (!videoId) {
      const resolved = await this.resolveActiveLiveVideo(yt, parsed.identifier);
      videoId = resolved.videoId;
      channelTitle = resolved.title;
      channelKey = resolved.channelId || parsed.identifier;
    }

    const sourceId = createSourceId('youtube', channelKey);
    if (this.channels.has(sourceId)) return this.channels.get(sourceId)!.source;

    const source: StreamSource = {
      id: sourceId,
      platform: 'youtube',
      identifier: channelKey,
      displayName: channelTitle,
      connected: false,
      input,
    };
    this.emitStatus(source);

    const liveChatId = await this.getLiveChatId(yt, videoId!);
    if (!liveChatId) {
      source.error = 'No active live chat for this video/channel (is the stream live?)';
      this.emitStatus(source);
      throw new Error(source.error);
    }

    try {
      const vid = await yt.videos.list({ part: ['snippet'], id: [videoId!] });
      const sn = vid.data.items?.[0]?.snippet;
      if (sn?.channelTitle) source.displayName = sn.channelTitle;
      if (sn?.channelId) source.identifier = sn.channelId;
    } catch {
      // ignore
    }

    const state: YTChannelState = {
      source: { ...source, connected: true },
      mode: 'api',
      liveChatId,
      seenIds: new Set(),
    };
    this.channels.set(sourceId, state);
    this.emitStatus(state.source);
    this.schedulePoll(sourceId);
    return state.source;
  }

  private async resolveActiveLiveVideo(
    yt: youtube_v3.Youtube,
    identifier: string,
  ): Promise<{ videoId: string; title: string; channelId?: string }> {
    let channelId: string | undefined;

    if (/^UC[\w-]{20,}$/.test(identifier)) {
      channelId = identifier;
    } else {
      const handle = identifier.replace(/^@/, '');
      try {
        const byHandle = await yt.channels.list({
          part: ['id', 'snippet'],
          forHandle: handle,
        });
        channelId = byHandle.data.items?.[0]?.id ?? undefined;
        if (!channelId) {
          const search = await yt.search.list({
            part: ['snippet'],
            q: handle,
            type: ['channel'],
            maxResults: 1,
          });
          channelId = search.data.items?.[0]?.snippet?.channelId ?? undefined;
        }
      } catch {
        const search = await yt.search.list({
          part: ['snippet'],
          q: identifier,
          type: ['channel'],
          maxResults: 1,
        });
        channelId = search.data.items?.[0]?.snippet?.channelId ?? undefined;
      }
    }

    if (!channelId) throw new Error(`Could not resolve YouTube channel: ${identifier}`);

    const live = await yt.search.list({
      part: ['snippet'],
      channelId,
      eventType: 'live',
      type: ['video'],
      maxResults: 1,
    });
    const item = live.data.items?.[0];
    if (!item?.id?.videoId) {
      throw new Error(
        `No active live broadcast found for ${identifier}. Paste a live video URL instead.`,
      );
    }
    return {
      videoId: item.id.videoId,
      title: item.snippet?.channelTitle ?? identifier,
      channelId,
    };
  }

  private async getLiveChatId(
    yt: youtube_v3.Youtube,
    videoId: string,
  ): Promise<string | null> {
    const res = await yt.videos.list({
      part: ['liveStreamingDetails', 'snippet'],
      id: [videoId],
    });
    return res.data.items?.[0]?.liveStreamingDetails?.activeLiveChatId ?? null;
  }

  private schedulePoll(sourceId: string, delayMs = 0): void {
    const state = this.channels.get(sourceId);
    if (!state || state.mode !== 'api') return;
    if (state.pollTimer) clearTimeout(state.pollTimer);
    state.pollTimer = setTimeout(() => void this.poll(sourceId), delayMs);
  }

  private async poll(sourceId: string): Promise<void> {
    const state = this.channels.get(sourceId);
    if (!state || state.mode !== 'api' || !state.liveChatId) return;
    const yt = this.ensureApiClient();

    try {
      const res = await yt.liveChatMessages.list({
        liveChatId: state.liveChatId,
        part: ['snippet', 'authorDetails'],
        pageToken: state.nextPageToken,
        maxResults: 200,
      });

      const interval = res.data.pollingIntervalMillis ?? 5000;
      state.nextPageToken = res.data.nextPageToken ?? undefined;

      for (const item of res.data.items ?? []) {
        if (!item.id || state.seenIds.has(item.id)) continue;
        state.seenIds.add(item.id);
        if (state.seenIds.size > 5000) {
          const arr = [...state.seenIds];
          state.seenIds = new Set(arr.slice(-2000));
        }

        const msg = this.mapApiMessage(item, state.source);
        if (msg) this.emitMessage(msg);
      }

      this.schedulePoll(sourceId, interval);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      state.source = {
        ...state.source,
        connected: false,
        error: message,
      };
      this.emitStatus(state.source);
      this.schedulePoll(sourceId, 15000);
    }
  }

  private mapApiMessage(
    item: youtube_v3.Schema$LiveChatMessage,
    source: StreamSource,
  ): ChatMessage | null {
    const snippet = item.snippet;
    const author = item.authorDetails;
    if (!snippet || !author) return null;

    const type = snippet.type ?? 'textMessageEvent';
    if (type === 'tombstone' || type === 'chatEndedEvent') return null;

    const badges = youtubeAuthorBadges(author);
    let text = snippet.displayMessage ?? '';
    let donation: ChatMessage['donation'];

    if (type === 'superChatEvent' && snippet.superChatDetails) {
      donation = {
        kind: 'superchat',
        amount: Number(snippet.superChatDetails.amountMicros ?? 0) / 1_000_000,
        currency: snippet.superChatDetails.currency ?? undefined,
        label: snippet.superChatDetails.amountDisplayString ?? 'Super Chat',
      };
      text = snippet.superChatDetails.userComment || text;
    } else if (type === 'superStickerEvent' && snippet.superStickerDetails) {
      donation = {
        kind: 'superchat',
        amount: Number(snippet.superStickerDetails.amountMicros ?? 0) / 1_000_000,
        currency: snippet.superStickerDetails.currency ?? undefined,
        label: snippet.superStickerDetails.amountDisplayString ?? 'Super Sticker',
      };
    } else if (type === 'newSponsorEvent' || type === 'memberMilestoneChatEvent') {
      donation = {
        kind: 'membership',
        label: snippet.displayMessage ?? 'New member',
      };
    } else if (type === 'membershipGiftingEvent') {
      donation = {
        kind: 'membership',
        label: snippet.displayMessage ?? 'Gifted memberships',
      };
    }

    if (!text && !donation) return null;

    return {
      id: item.id ?? randomUUID(),
      platform: 'youtube',
      channelId: source.id,
      channelName: source.displayName,
      userId: author.channelId ?? 'unknown',
      username: author.displayName ?? 'unknown',
      displayName: author.displayName ?? 'unknown',
      message: text || donation?.label || '',
      timestamp: snippet.publishedAt ? Date.parse(snippet.publishedAt) : Date.now(),
      badges,
      avatarUrl: author.profileImageUrl ?? undefined,
      donation,
    };
  }

  async disconnect(sourceId: string): Promise<void> {
    const state = this.channels.get(sourceId);
    if (!state) return;
    if (state.pollTimer) clearTimeout(state.pollTimer);
    try {
      state.liveChat?.stop();
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

function formatYouTubeConnectError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (
    lower.includes('not live') ||
    lower.includes('no active live') ||
    lower.includes('offline') ||
    lower.includes('could not resolve')
  ) {
    return `${message} Creator must be LIVE. No Google Cloud / YOUTUBE_API_KEY is required for basic chat (Innertube).`;
  }
  return `YouTube connect failed: ${message}. Paste a live video URL while the stream is LIVE — no YOUTUBE_API_KEY required. Optional YOUTUBE_API_KEY enables official Data API fallback only.`;
}

function rememberId(seenIds: Set<string>, id: string): boolean {
  if (!id || seenIds.has(id)) return false;
  seenIds.add(id);
  if (seenIds.size > 5000) {
    const arr = [...seenIds];
    seenIds.clear();
    for (const x of arr.slice(-2000)) seenIds.add(x);
  }
  return true;
}

function mapInnertubeChatAction(
  action: unknown,
  source: StreamSource,
  seenIds: Set<string>,
): ChatMessage | null {
  if (!action || typeof action !== 'object') return null;
  const act = action as { is?: (type: unknown) => boolean; item?: unknown };
  if (typeof act.is === 'function') {
    if (!act.is(YTNodes.AddChatItemAction)) return null;
  } else if ((action as { type?: string }).type !== 'AddChatItemAction') {
    return null;
  }

  const item = act.item as
    | {
        type?: string;
        id?: string;
        message?: { toString?: () => string };
        author?: InnertubeAuthorLike;
        purchase_amount?: string;
        header_subtext?: { toString?: () => string };
        header_primary_text?: { toString?: () => string };
        timestamp?: number;
        timestamp_usec?: number | string;
        is?: (t: unknown) => boolean;
      }
    | undefined;
  if (!item) return null;

  const isText =
    item.type === 'LiveChatTextMessage' || item.is?.(YTNodes.LiveChatTextMessage);
  const isPaid =
    item.type === 'LiveChatPaidMessage' || item.is?.(YTNodes.LiveChatPaidMessage);
  const isSticker =
    item.type === 'LiveChatPaidSticker' || item.is?.(YTNodes.LiveChatPaidSticker);
  const isMember =
    item.type === 'LiveChatMembershipItem' ||
    item.is?.(YTNodes.LiveChatMembershipItem);

  if (!isText && !isPaid && !isSticker && !isMember) return null;

  const id = item.id || randomUUID();
  if (!rememberId(seenIds, id)) return null;

  const author = item.author;
  const displayName = author?.name || 'unknown';
  const userId = author?.id || 'unknown';
  const text = item.message?.toString?.() || '';
  let donation: ChatMessage['donation'];

  if (isPaid || isSticker) {
    donation = {
      kind: 'superchat',
      label: item.purchase_amount || (isSticker ? 'Super Sticker' : 'Super Chat'),
    };
  } else if (isMember) {
    donation = {
      kind: 'membership',
      label:
        item.header_primary_text?.toString?.() ||
        item.header_subtext?.toString?.() ||
        text ||
        'New member',
    };
  }

  if (!text && !donation) return null;

  const tsUsec = item.timestamp_usec != null ? Number(item.timestamp_usec) : NaN;
  const timestamp =
    item.timestamp ||
    (Number.isFinite(tsUsec) && tsUsec > 1e12 ? Math.floor(tsUsec / 1000) : Date.now());

  return {
    id,
    platform: 'youtube',
    channelId: source.id,
    channelName: source.displayName,
    userId,
    username: displayName,
    displayName,
    message: text || donation?.label || '',
    timestamp,
    badges: innertubeAuthorBadges(author),
    avatarUrl: pickInnertubeAvatar(author),
    donation,
  };
}

interface InnertubeAuthorLike {
  id?: string;
  name?: string;
  is_moderator?: boolean;
  is_verified?: boolean;
  is_verified_artist?: boolean;
  is_creator?: boolean;
  avatar_thumbnail_url?: string;
  best_thumbnail?: { url?: string };
  thumbnails?: Array<{ url?: string }>;
  badges?: Array<{
    type?: string;
    icon_type?: string;
    style?: string;
    label?: string;
    tooltip?: string;
    custom_thumbnail?: Array<{ url?: string }>;
  }>;
}

function pickInnertubeAvatar(author?: InnertubeAuthorLike): string | undefined {
  if (!author) return undefined;
  return (
    author.avatar_thumbnail_url ||
    author.best_thumbnail?.url ||
    author.thumbnails?.[0]?.url ||
    undefined
  );
}

export function innertubeAuthorBadges(author?: InnertubeAuthorLike): ChatBadge[] {
  const badges: ChatBadge[] = [];
  if (!author) return badges;

  const rawBadges = Array.isArray(author.badges) ? author.badges : [];
  const iconTypes = rawBadges.map((b) => String(b.icon_type ?? '').toUpperCase());
  const tips = rawBadges.map((b) => String(b.tooltip ?? b.label ?? '').toLowerCase());

  const isOwner =
    !!author.is_creator ||
    iconTypes.some((t) => t.includes('OWNER')) ||
    tips.some((t) => t.includes('owner'));
  const isMod =
    !!author.is_moderator ||
    iconTypes.some((t) => t.includes('MODERATOR')) ||
    tips.some((t) => t.includes('moderator'));
  const isVerified =
    !!author.is_verified ||
    !!author.is_verified_artist ||
    rawBadges.some((b) => String(b.style ?? '').includes('VERIFIED'));

  if (isOwner) {
    badges.push({ id: 'owner', label: 'Channel owner', color: '#ff0000' });
  }
  if (isMod) {
    badges.push({ id: 'moderator', label: 'Moderator', color: '#5e84f1' });
  }

  let memberAdded = false;
  for (const b of rawBadges) {
    const tip = String(b.tooltip ?? b.label ?? '');
    const icon = String(b.icon_type ?? '').toUpperCase();
    const customUrl = b.custom_thumbnail?.[0]?.url;
    const looksMember =
      !!customUrl ||
      icon.includes('SPONSOR') ||
      icon.includes('MEMBER') ||
      /member|sponsor|badge/i.test(tip);
    if (!looksMember) continue;
    if (icon.includes('OWNER') || icon.includes('MODERATOR') || icon.includes('VERIFIED')) {
      continue;
    }
    badges.push({
      id: 'member',
      label: tip || 'Member',
      color: '#0f9d58',
      imageUrl: customUrl,
    });
    memberAdded = true;
    break;
  }
  if (!memberAdded && tips.some((t) => t.includes('member') || t.includes('sponsor'))) {
    badges.push({ id: 'member', label: 'Member', color: '#0f9d58' });
  }

  if (isVerified) {
    badges.push({ id: 'verified', label: 'Verified', color: '#aaaaaa' });
  }

  return badges;
}

export function youtubeAuthorBadges(
  author: youtube_v3.Schema$LiveChatMessageAuthorDetails,
): ChatBadge[] {
  const badges: ChatBadge[] = [];
  if (author.isChatOwner) {
    badges.push({
      id: 'owner',
      label: 'Channel owner',
      color: '#ff0000',
      imageUrl: undefined,
    });
  }
  if (author.isChatModerator) {
    badges.push({
      id: 'moderator',
      label: 'Moderator',
      color: '#5e84f1',
    });
  }
  if (author.isChatSponsor) {
    badges.push({
      id: 'member',
      label: 'Member',
      color: '#0f9d58',
    });
  }
  if (author.isVerified) {
    badges.push({
      id: 'verified',
      label: 'Verified',
      color: '#aaaaaa',
    });
  }
  return badges;
}

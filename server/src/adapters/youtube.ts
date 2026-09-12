import { google, youtube_v3 } from 'googleapis';
import { randomUUID } from 'crypto';
import type { ChatBadge, ChatMessage, StreamSource } from '../../../shared/types.js';
import type { MessageHandler, PlatformAdapter, StatusHandler } from './types.js';
import { createSourceId } from './types.js';
import { parseStreamInput } from './parseInput.js';

interface YTChannelState {
  source: StreamSource;
  liveChatId: string;
  nextPageToken?: string;
  pollTimer?: ReturnType<typeof setTimeout>;
  seenIds: Set<string>;
}

/**
 * YouTube Live Chat via official Data API v3.
 * authorDetails exposes isChatOwner, isChatModerator, isChatSponsor, isVerified
 * (badge *images* for membership tiers are not in the public API — we render
 * clear role pills + optional profile image).
 */
export class YouTubeAdapter implements PlatformAdapter {
  readonly platform = 'youtube' as const;
  private yt: youtube_v3.Youtube | null = null;
  private channels = new Map<string, YTChannelState>();
  private messageHandlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private apiKey = process.env.YOUTUBE_API_KEY ?? '';

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

  private ensureClient(): youtube_v3.Youtube {
    if (!this.apiKey) {
      throw new Error(
        'YOUTUBE_API_KEY is required for live YouTube chat. Set it in .env or use Demo mode.',
      );
    }
    if (!this.yt) {
      this.yt = google.youtube({ version: 'v3', auth: this.apiKey });
    }
    return this.yt;
  }

  async connect(input: string): Promise<StreamSource> {
    const parsed = parseStreamInput(input);
    if (parsed.platform !== 'youtube') throw new Error('Not a YouTube channel');

    const yt = this.ensureClient();
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

    // Enrich title from video if needed
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
      // forHandle is supported on channels.list
      try {
        const byHandle = await yt.channels.list({
          part: ['id', 'snippet'],
          forHandle: handle,
        });
        channelId = byHandle.data.items?.[0]?.id ?? undefined;
        if (!channelId) {
          // fallback search
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
    if (!state) return;
    if (state.pollTimer) clearTimeout(state.pollTimer);
    state.pollTimer = setTimeout(() => void this.poll(sourceId), delayMs);
  }

  private async poll(sourceId: string): Promise<void> {
    const state = this.channels.get(sourceId);
    if (!state) return;
    const yt = this.ensureClient();

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

        const msg = this.mapMessage(item, state.source);
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
      // Retry after backoff
      this.schedulePoll(sourceId, 15000);
    }
  }

  private mapMessage(
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
    this.channels.delete(sourceId);
    this.emitStatus({ ...state.source, connected: false });
  }

  async disconnectAll(): Promise<void> {
    for (const id of [...this.channels.keys()]) await this.disconnect(id);
  }
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

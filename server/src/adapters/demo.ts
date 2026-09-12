import { randomUUID } from 'crypto';
import type { ChatBadge, ChatMessage, Platform, StreamSource } from '../../../shared/types.js';
import type { MessageHandler, PlatformAdapter, StatusHandler } from './types.js';
import { createSourceId } from './types.js';
import { TWITCH_GLOBAL_BADGE_URLS, labelForTwitchBadge } from './twitchBadges.js';
import { youtubeAuthorBadges } from './youtube.js';

const DEMO_CHANNELS: Record<Platform, { id: string; name: string }> = {
  twitch: { id: 'demo-streamer', name: 'DemoStreamer' },
  youtube: { id: 'UCDEMOYOUTUBE000000001', name: 'Demo YouTube Live' },
  tiktok: { id: 'demotiktok', name: '@demotiktok' },
};

interface ScriptedMessage {
  platform: Platform;
  delay: number;
  username: string;
  displayName: string;
  color?: string;
  message: string;
  badges: ChatBadge[];
  donation?: ChatMessage['donation'];
  avatarUrl?: string;
}

function twitchBadge(id: string, version = '1'): ChatBadge {
  return {
    id,
    version,
    label: labelForTwitchBadge(id, version),
    imageUrl:
      TWITCH_GLOBAL_BADGE_URLS[id]?.[version] ??
      TWITCH_GLOBAL_BADGE_URLS[id]?.['1'] ??
      TWITCH_GLOBAL_BADGE_URLS[id]?.['0'],
    color:
      id === 'broadcaster'
        ? '#e91916'
        : id === 'moderator'
          ? '#00ad03'
          : id === 'vip'
            ? '#e005b9'
            : id === 'subscriber'
              ? '#9146ff'
              : id === 'bits'
                ? '#9b45ff'
                : '#adadb8',
  };
}

const SCRIPT: ScriptedMessage[] = [
  {
    platform: 'twitch',
    delay: 400,
    username: 'demostreamer',
    displayName: 'DemoStreamer',
    color: '#e91916',
    message: 'Welcome to Chorus demo — Twitch chat with real badge art!',
    badges: [twitchBadge('broadcaster'), twitchBadge('subscriber', '12')],
  },
  {
    platform: 'youtube',
    delay: 900,
    username: 'yt_owner',
    displayName: 'Demo YouTube Live',
    message: 'YouTube roles: owner, mod, member, verified — rendered as native-style pills.',
    badges: youtubeAuthorBadges({
      isChatOwner: true,
      isChatModerator: false,
      isChatSponsor: false,
      isVerified: true,
    }),
  },
  {
    platform: 'tiktok',
    delay: 1400,
    username: 'demotiktok',
    displayName: 'Demo TikTok',
    message: 'TikTok gifts & roles (unofficial connector) — gifter levels show up here.',
    badges: [
      { id: 'moderator', label: 'Moderator', color: '#20d5ec' },
      { id: 'gifter', label: 'Gifter Lv.15', version: '15', color: '#ffb84d' },
    ],
  },
  {
    platform: 'twitch',
    delay: 2200,
    username: 'mod_maya',
    displayName: 'ModMaya',
    color: '#00ad03',
    message: 'Mods and VIPs get their badges next to the name ✨',
    badges: [twitchBadge('moderator'), twitchBadge('subscriber', '24')],
  },
  {
    platform: 'twitch',
    delay: 3000,
    username: 'vip_victor',
    displayName: 'VipVictor',
    color: '#e005b9',
    message: 'VIP badge from Twitch IRC tags + Helix badge CDN.',
    badges: [twitchBadge('vip'), twitchBadge('subscriber', '6'), twitchBadge('premium')],
  },
  {
    platform: 'youtube',
    delay: 3800,
    username: 'member_mia',
    displayName: 'MemberMia',
    message: 'Been a member for months — sponsor flag from Live Chat API.',
    badges: youtubeAuthorBadges({
      isChatOwner: false,
      isChatModerator: false,
      isChatSponsor: true,
      isVerified: false,
    }),
    avatarUrl: 'https://www.youtube.com/s/desktop/12d6b690/img/favicon_48x48.png',
  },
  {
    platform: 'youtube',
    delay: 4600,
    username: 'mod_yuki',
    displayName: 'ModYuki',
    message: 'Keep chat friendly — YouTube moderator badge.',
    badges: youtubeAuthorBadges({
      isChatOwner: false,
      isChatModerator: true,
      isChatSponsor: true,
      isVerified: false,
    }),
  },
  {
    platform: 'tiktok',
    delay: 5400,
    username: 'giftking',
    displayName: 'GiftKing',
    message: 'Rose x10',
    badges: [
      { id: 'gifter', label: 'Gifter Lv.30', version: '30', color: '#ffb84d' },
      { id: 'fanclub', label: 'Fan Club', color: '#ff6a88' },
    ],
    donation: { kind: 'gift', amount: 10, label: 'Rose x10 · 10💎' },
  },
  {
    platform: 'twitch',
    delay: 6200,
    username: 'bits_barry',
    displayName: 'BitsBarry',
    color: '#9b45ff',
    message: 'Cheer100 LETS GO',
    badges: [twitchBadge('bits', '100'), twitchBadge('subscriber', '3')],
    donation: { kind: 'bits', amount: 100, label: '100 Bits' },
  },
  {
    platform: 'youtube',
    delay: 7000,
    username: 'super_sam',
    displayName: 'SuperSam',
    message: 'Love the unified chat UI!',
    badges: youtubeAuthorBadges({
      isChatOwner: false,
      isChatModerator: false,
      isChatSponsor: false,
      isVerified: true,
    }),
    donation: {
      kind: 'superchat',
      amount: 5,
      currency: 'USD',
      label: '$5.00',
    },
  },
  {
    platform: 'tiktok',
    delay: 7800,
    username: 'lurker_lee',
    displayName: 'LurkerLee',
    message: 'first time here, this UI is clean 🔥',
    badges: [],
  },
  {
    platform: 'twitch',
    delay: 8600,
    username: 'prime_pat',
    displayName: 'PrimePat',
    color: '#00c8b0',
    message: 'Prime sub badge + turbo vibes',
    badges: [twitchBadge('premium'), twitchBadge('turbo')],
  },
];

const LOOP_LINES: Array<Omit<ScriptedMessage, 'delay'>> = [
  {
    platform: 'twitch',
    username: 'chatter_chris',
    displayName: 'ChatterChris',
    color: '#9146ff',
    message: 'PogChamp unified chat hits different',
    badges: [twitchBadge('subscriber', '1')],
  },
  {
    platform: 'youtube',
    username: 'yt_fan',
    displayName: 'YTFan42',
    message: 'Watching from YouTube 👋',
    badges: youtubeAuthorBadges({
      isChatSponsor: true,
      isChatModerator: false,
      isChatOwner: false,
      isVerified: false,
    }),
  },
  {
    platform: 'tiktok',
    username: 'tt_viewer',
    displayName: 'TTViewer',
    message: 'FYP brought me here',
    badges: [{ id: 'new-gifter', label: 'New Gifter', color: '#ffb84d' }],
  },
  {
    platform: 'twitch',
    username: 'mod_maya',
    displayName: 'ModMaya',
    color: '#00ad03',
    message: 'Reminder: filter by platform in the toolbar',
    badges: [twitchBadge('moderator'), twitchBadge('subscriber', '24')],
  },
  {
    platform: 'youtube',
    username: 'super_sam',
    displayName: 'SuperSam',
    message: 'Another Super Chat for the demo!',
    badges: youtubeAuthorBadges({ isVerified: true }),
    donation: { kind: 'superchat', amount: 2, currency: 'USD', label: '$2.00' },
  },
  {
    platform: 'tiktok',
    username: 'giftking',
    displayName: 'GiftKing',
    message: 'Fingerprint Heart',
    badges: [{ id: 'gifter', label: 'Gifter Lv.30', version: '30', color: '#ffb84d' }],
    donation: { kind: 'gift', amount: 499, label: 'Fingerprint Heart · 499💎' },
  },
];

/**
 * Demo adapter: injects sample streams + continuous mock chat so the UI
 * showcases icons and badges with zero API keys.
 */
export class DemoAdapter implements PlatformAdapter {
  readonly platform = 'twitch' as const; // unused — manages all three
  private messageHandlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private sources = new Map<string, StreamSource>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private loopTimer?: ReturnType<typeof setInterval>;
  private started = false;

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onStatus(handler: StatusHandler): void {
    this.statusHandlers.push(handler);
  }

  getSources(): StreamSource[] {
    return [...this.sources.values()];
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    for (const platform of ['twitch', 'youtube', 'tiktok'] as Platform[]) {
      const ch = DEMO_CHANNELS[platform];
      const source: StreamSource = {
        id: createSourceId(platform, ch.id),
        platform,
        identifier: ch.id,
        displayName: ch.name,
        connected: true,
        input: `demo:${platform}`,
      };
      this.sources.set(source.id, source);
      for (const h of this.statusHandlers) h(source);
    }

    for (const line of SCRIPT) {
      const t = setTimeout(() => this.emitLine(line), line.delay);
      this.timers.push(t);
    }

    // Continuous ambient chat after intro
    this.loopTimer = setInterval(() => {
      const line = LOOP_LINES[Math.floor(Math.random() * LOOP_LINES.length)];
      this.emitLine(line);
    }, 4500);
  }

  private emitLine(line: Omit<ScriptedMessage, 'delay'> & { delay?: number }): void {
    const ch = DEMO_CHANNELS[line.platform];
    const msg: ChatMessage = {
      id: randomUUID(),
      platform: line.platform,
      channelId: createSourceId(line.platform, ch.id),
      channelName: ch.name,
      userId: line.username,
      username: line.username,
      displayName: line.displayName,
      color: line.color,
      message: line.message,
      timestamp: Date.now(),
      badges: line.badges,
      donation: line.donation,
      avatarUrl: line.avatarUrl,
    };
    for (const h of this.messageHandlers) h(msg);
  }

  async connect(_input: string): Promise<StreamSource> {
    throw new Error('Demo mode manages its own streams. Disable DEMO_MODE to add live streams.');
  }

  async disconnect(sourceId: string): Promise<void> {
    this.sources.delete(sourceId);
  }

  async disconnectAll(): Promise<void> {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    if (this.loopTimer) clearInterval(this.loopTimer);
    this.sources.clear();
    this.started = false;
  }
}

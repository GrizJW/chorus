import type { ChatMessage, StreamSource } from '../../../shared/types.js';
import { parseStreamInput, resolveStreamInput } from '../adapters/parseInput.js';
import { TwitchAdapter } from '../adapters/twitch.js';
import { YouTubeAdapter } from '../adapters/youtube.js';
import { TikTokAdapter } from '../adapters/tiktok.js';
import { DemoAdapter } from '../adapters/demo.js';
import type { PlatformAdapter } from '../adapters/types.js';

export type HubListener = {
  onMessage: (msg: ChatMessage) => void;
  onStreamUpdate: (source: StreamSource) => void;
};

export class ChatHub {
  readonly demoMode: boolean;
  private twitch = new TwitchAdapter();
  private youtube = new YouTubeAdapter();
  private tiktok = new TikTokAdapter();
  private demo = new DemoAdapter();
  private listeners = new Set<HubListener>();
  private recent: ChatMessage[] = [];
  private readonly maxRecent = 300;

  constructor() {
    this.demoMode = (process.env.DEMO_MODE ?? 'false').toLowerCase() === 'true';

    const wire = (adapter: PlatformAdapter) => {
      adapter.onMessage((msg) => this.pushMessage(msg));
      adapter.onStatus((source) => this.broadcastStream(source));
    };

    wire(this.twitch);
    wire(this.youtube);
    wire(this.tiktok);
    wire(this.demo);

    if (this.demoMode) {
      this.demo.start();
    }
  }

  subscribe(listener: HubListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getRecentMessages(): ChatMessage[] {
    return [...this.recent];
  }

  getStreams(): StreamSource[] {
    if (this.demoMode) return this.demo.getSources();
    return [
      ...this.twitch.getSources(),
      ...this.youtube.getSources(),
      ...this.tiktok.getSources(),
    ];
  }

  async addStream(input: string): Promise<StreamSource> {
    if (this.demoMode) {
      throw new Error(
        'Demo mode is on (DEMO_MODE=true). Set DEMO_MODE=false in .env to connect live streams.',
      );
    }
    const resolved = await resolveStreamInput(input);
    const parsed = parseStreamInput(resolved);
    const adapter = this.adapterFor(parsed.platform);
    return adapter.connect(resolved);
  }

  async removeStream(id: string): Promise<void> {
    if (this.demoMode) {
      await this.demo.disconnect(id);
      return;
    }
    const platform = id.split(':')[0];
    if (platform === 'twitch') await this.twitch.disconnect(id);
    else if (platform === 'youtube') await this.youtube.disconnect(id);
    else if (platform === 'tiktok') await this.tiktok.disconnect(id);
  }

  private adapterFor(platform: string): PlatformAdapter {
    switch (platform) {
      case 'twitch':
        return this.twitch;
      case 'youtube':
        return this.youtube;
      case 'tiktok':
        return this.tiktok;
      default:
        throw new Error(`Unknown platform: ${platform}`);
    }
  }

  private pushMessage(msg: ChatMessage): void {
    this.recent.push(msg);
    if (this.recent.length > this.maxRecent) {
      this.recent = this.recent.slice(-this.maxRecent);
    }
    for (const l of this.listeners) l.onMessage(msg);
  }

  private broadcastStream(source: StreamSource): void {
    for (const l of this.listeners) l.onStreamUpdate(source);
  }
}

import type { Platform } from '../../../shared/types.js';

export interface ParsedStreamInput {
  platform: Platform;
  identifier: string;
  displayHint?: string;
  /** YouTube: video id when URL points at a live video */
  youtubeVideoId?: string;
  original: string;
}

/**
 * Resolve short / redirecting URLs (e.g. TikTok vm/vt) before parsing.
 */
export async function resolveStreamInput(raw: string): Promise<string> {
  const input = raw.trim();
  const shortTikTok = input.match(
    /^(?:https?:\/\/)?(?:vm|vt)\.tiktok\.com\/([A-Za-z0-9]+)\/?/i,
  );
  if (!shortTikTok) return input;

  const url = input.startsWith('http') ? input : `https://${input}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Chorus/1.0)' },
    });
    const finalUrl = res.url || url;
    if (/tiktok\.com\/@/i.test(finalUrl)) return finalUrl;
  } catch {
    // fall through
  }
  throw new Error(
    `Could not resolve TikTok short link. Paste a live URL like https://www.tiktok.com/@user/live instead.`,
  );
}

/**
 * Parse channel URL or username/handle into a platform + identifier.
 */
export function parseStreamInput(raw: string): ParsedStreamInput {
  const input = raw.trim();
  if (!input) throw new Error('Empty stream input');

  // Explicit platform:value
  const prefixed = input.match(/^(twitch|youtube|tiktok)\s*[:/]\s*(.+)$/i);
  if (prefixed) {
    const platform = prefixed[1].toLowerCase() as Platform;
    return finalize(platform, prefixed[2], input);
  }

  // Twitch: twitch.tv / m.twitch.tv / www.twitch.tv / player.twitch.tv?channel=
  const twitchPlayer = input.match(
    /(?:https?:\/\/)?(?:www\.)?player\.twitch\.tv\/?\?[^#]*channel=([a-zA-Z0-9_]{3,25})/i,
  );
  if (twitchPlayer) {
    return {
      platform: 'twitch',
      identifier: twitchPlayer[1].toLowerCase(),
      original: input,
    };
  }
  const twitchUrl = input.match(
    /(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([a-zA-Z0-9_]{3,25})/i,
  );
  if (twitchUrl) {
    return { platform: 'twitch', identifier: twitchUrl[1].toLowerCase(), original: input };
  }

  // YouTube live / watch video URLs (youtube.com, m.youtube.com, www)
  const ytLive = input.match(
    /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(?:live\/|watch\?(?:[^#]*&)?v=)([a-zA-Z0-9_-]{11})/i,
  );
  if (ytLive) {
    return {
      platform: 'youtube',
      identifier: ytLive[1],
      youtubeVideoId: ytLive[1],
      original: input,
    };
  }
  const ytShort = input.match(/(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/i);
  if (ytShort) {
    return {
      platform: 'youtube',
      identifier: ytShort[1],
      youtubeVideoId: ytShort[1],
      original: input,
    };
  }
  // youtube.com/@handle/live or /c/…/live etc.
  const ytHandleLive = input.match(
    /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)([^/?#\s]+)(?:\/live)?/i,
  );
  if (ytHandleLive) {
    const id = ytHandleLive[1].startsWith('@') ? ytHandleLive[1] : `@${ytHandleLive[1]}`;
    const isChannelId = /^UC[\w-]{20,}$/.test(ytHandleLive[1]);
    return {
      platform: 'youtube',
      identifier: isChannelId ? ytHandleLive[1] : id.replace(/^@@/, '@'),
      original: input,
    };
  }

  // TikTok: www / m — @user and @user/live
  const tiktokUrl = input.match(
    /(?:https?:\/\/)?(?:www\.|m\.|vm\.|vt\.)?tiktok\.com\/@([a-zA-Z0-9._]+)(?:\/live)?/i,
  );
  if (tiktokUrl) {
    return { platform: 'tiktok', identifier: tiktokUrl[1], original: input };
  }

  // Bare handles
  if (/^@?[a-zA-Z0-9._]{2,24}$/.test(input) && input.includes('.')) {
    return { platform: 'tiktok', identifier: input.replace(/^@/, ''), original: input };
  }

  // Bare Twitch login (alphanumeric + underscore only)
  if (/^[a-zA-Z0-9_]{3,25}$/.test(input)) {
    return { platform: 'twitch', identifier: input.toLowerCase(), original: input };
  }

  // @handle without domain → TikTok uniqueId
  if (input.startsWith('@')) {
    const handle = input.slice(1);
    return { platform: 'tiktok', identifier: handle, original: input };
  }

  if (/^@[a-zA-Z0-9._-]{3,}$/.test(input)) {
    return { platform: 'youtube', identifier: input, original: input };
  }

  throw new Error(
    `Could not parse stream input. Try:\n` +
      `  Twitch:  https://twitch.tv/username  or  https://m.twitch.tv/username\n` +
      `  YouTube: https://youtube.com/@handle  or  https://youtube.com/live/VIDEO_ID\n` +
      `  TikTok:  https://www.tiktok.com/@user/live  or  tiktok:username`,
  );
}

function finalize(platform: Platform, value: string, original: string): ParsedStreamInput {
  const cleaned = value.trim().replace(/^@/, '');
  if (platform === 'twitch') {
    return { platform, identifier: cleaned.toLowerCase(), original };
  }
  if (platform === 'youtube') {
    if (/^[a-zA-Z0-9_-]{11}$/.test(cleaned)) {
      return { platform, identifier: cleaned, youtubeVideoId: cleaned, original };
    }
    if (/^UC[\w-]{20,}$/.test(cleaned)) {
      return { platform, identifier: cleaned, original };
    }
    return { platform, identifier: `@${cleaned}`, original };
  }
  return { platform, identifier: cleaned, original };
}

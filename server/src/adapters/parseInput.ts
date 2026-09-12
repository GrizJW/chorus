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
 * Parse channel URL or username/handle into a platform + identifier.
 * Supports at least one form per platform (username and common URL shapes).
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

  // Twitch URLs
  const twitchUrl = input.match(
    /(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([a-zA-Z0-9_]{3,25})/i,
  );
  if (twitchUrl) {
    return { platform: 'twitch', identifier: twitchUrl[1].toLowerCase(), original: input };
  }

  // YouTube URLs
  const ytLive = input.match(
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:live\/|watch\?v=)([a-zA-Z0-9_-]{11})/i,
  );
  if (ytLive) {
    return {
      platform: 'youtube',
      identifier: ytLive[1],
      youtubeVideoId: ytLive[1],
      original: input,
    };
  }
  const ytShort = input.match(/(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/i);
  if (ytShort) {
    return {
      platform: 'youtube',
      identifier: ytShort[1],
      youtubeVideoId: ytShort[1],
      original: input,
    };
  }
  const ytHandle = input.match(
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)([^/?#\s]+)/i,
  );
  if (ytHandle) {
    const id = ytHandle[1].startsWith('@') ? ytHandle[1] : `@${ytHandle[1]}`;
    // channel/UC... keeps as-is without forcing @
    const isChannelId = /^UC[\w-]{20,}$/.test(ytHandle[1]);
    return {
      platform: 'youtube',
      identifier: isChannelId ? ytHandle[1] : id.replace(/^@@/, '@'),
      original: input,
    };
  }
  if (input.startsWith('@') && !input.includes('tiktok')) {
    // Ambiguous @handle — prefer YouTube handle if looks like yt, else tiktok later
    // Default: treat bare @ as TikTok uniqueId OR YouTube — we check platform hints
  }

  // TikTok URLs
  const tiktokUrl = input.match(
    /(?:https?:\/\/)?(?:www\.|vm\.)?tiktok\.com\/@([a-zA-Z0-9._]+)(?:\/live)?/i,
  );
  if (tiktokUrl) {
    return { platform: 'tiktok', identifier: tiktokUrl[1], original: input };
  }

  // Bare handles
  if (/^@?[a-zA-Z0-9._]{2,24}$/.test(input) && input.includes('.')) {
    // TikTok often has dots
    return { platform: 'tiktok', identifier: input.replace(/^@/, ''), original: input };
  }

  // Bare Twitch login (alphanumeric + underscore only)
  if (/^[a-zA-Z0-9_]{3,25}$/.test(input)) {
    return { platform: 'twitch', identifier: input.toLowerCase(), original: input };
  }

  // @handle without domain → TikTok uniqueId (common) or YouTube
  if (input.startsWith('@')) {
    const handle = input.slice(1);
    // Prefer YouTube when user typed youtube-style; otherwise TikTok
    return { platform: 'tiktok', identifier: handle, original: input };
  }

  // youtube/@handle without domain prefix
  if (/^@[a-zA-Z0-9._-]{3,}$/.test(input)) {
    return { platform: 'youtube', identifier: input, original: input };
  }

  throw new Error(
    `Could not parse stream input. Try:\n` +
      `  Twitch:  https://twitch.tv/username  or  username\n` +
      `  YouTube: https://youtube.com/@handle  or  youtube:@handle  or video URL\n` +
      `  TikTok:  https://tiktok.com/@user/live  or  tiktok:username`,
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

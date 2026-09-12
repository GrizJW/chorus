import type { ChatBadge } from '../../../shared/types.js';

/** Well-known global Twitch badge image URLs (static CDN). */
export const TWITCH_GLOBAL_BADGE_URLS: Record<string, Record<string, string>> = {
  broadcaster: {
    '1': 'https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/2',
  },
  moderator: {
    '1': 'https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b95-b7cb-7333d0e2e7f1/2',
  },
  vip: {
    '1': 'https://static-cdn.jtvnw.net/badges/v1/b817aba4-fad8-49e2-b88a-7cc744296210/2',
  },
  subscriber: {
    '0': 'https://static-cdn.jtvnw.net/badges/v1/5d9f2208-5dd8-11e7-8513-2ff4adfae661/2',
    '1': 'https://static-cdn.jtvnw.net/badges/v1/5d9f2208-5dd8-11e7-8513-2ff4adfae661/2',
  },
  premium: {
    '1': 'https://static-cdn.jtvnw.net/badges/v1/a1dd5073-19c3-4911-8cb4-c464a7bc1510/2',
  },
  partner: {
    '1': 'https://static-cdn.jtvnw.net/badges/v1/d12a2e27-16f6-41d0-ab77-b780518f00a3/2',
  },
  turbo: {
    '1': 'https://static-cdn.jtvnw.net/badges/v1/bd444ec6-8f34-4bf9-91f4-af1e3428d80f/2',
  },
  staff: {
    '1': 'https://static-cdn.jtvnw.net/badges/v1/d97c37bd-a6f5-4c38-8f57-4e4bef88af34/2',
  },
  admin: {
    '1': 'https://static-cdn.jtvnw.net/badges/v1/9ef7e029-4cdf-4d4d-a0d5-9e5dce0351c8/2',
  },
  bits: {
    '1': 'https://static-cdn.jtvnw.net/badges/v1/73b5c3fb-7f24-4ad4-9a5b-bb0495bed5f3/2',
    '100': 'https://static-cdn.jtvnw.net/badges/v1/09d93036-e7ce-431c-9a9e-7044297133f2/2',
    '1000': 'https://static-cdn.jtvnw.net/badges/v1/969bdbc9-c989-4bd8-ad45-4e2d6d1a8d8e/2',
  },
  'bits-leader': {
    '1': 'https://static-cdn.jtvnw.net/badges/v1/8efc2e6c-c3e3-4e1a-8e8a-f8a5e7b8c9d0/2',
  },
  founder: {
    '0': 'https://static-cdn.jtvnw.net/badges/v1/511b78a9-ab37-472f-956e-746e0a3c2e3c/2',
  },
  'glhf-pledge': {
    '1': 'https://static-cdn.jtvnw.net/badges/v1/31537e40-4e67-4e1e-8c3a-0e0d2b0f0c0e/2',
  },
  artist: {
    '1': 'https://static-cdn.jtvnw.net/badges/v1/4300a897-03dc-4d1a-8a0e-5c0e0e0e0e0e/2',
  },
};

const BADGE_LABELS: Record<string, string> = {
  broadcaster: 'Broadcaster',
  moderator: 'Moderator',
  vip: 'VIP',
  subscriber: 'Subscriber',
  premium: 'Prime Gaming',
  partner: 'Verified Partner',
  turbo: 'Turbo',
  staff: 'Twitch Staff',
  admin: 'Twitch Admin',
  bits: 'Bits',
  'bits-leader': 'Bits Leader',
  founder: 'Founder',
  'sub-gifter': 'Sub Gifter',
  'gift-leader': 'Gift Leader',
  predictions: 'Predictions',
  'no_audio': 'No Audio',
  'no_video': 'No Video',
};

export function labelForTwitchBadge(setId: string, version?: string): string {
  if (setId === 'subscriber' && version) {
    const months = Number(version);
    if (!Number.isNaN(months) && months > 0) return `Subscriber (${months} mo)`;
    return 'Subscriber';
  }
  if (setId === 'bits' && version) return `Bits (${version})`;
  return BADGE_LABELS[setId] ?? setId.replace(/-/g, ' ');
}

export type BadgeMap = Map<string, Map<string, string>>;

export function resolveTwitchBadges(
  badges: Record<string, string> | null | undefined,
  channelBadgeMap?: BadgeMap,
  globalBadgeMap?: BadgeMap,
): ChatBadge[] {
  if (!badges) return [];
  const result: ChatBadge[] = [];
  for (const [setId, version] of Object.entries(badges)) {
    const fromChannel = channelBadgeMap?.get(setId)?.get(version);
    const fromGlobal = globalBadgeMap?.get(setId)?.get(version);
    const fallback =
      TWITCH_GLOBAL_BADGE_URLS[setId]?.[version] ??
      TWITCH_GLOBAL_BADGE_URLS[setId]?.['1'] ??
      TWITCH_GLOBAL_BADGE_URLS[setId]?.['0'];
    result.push({
      id: setId,
      version,
      label: labelForTwitchBadge(setId, version),
      imageUrl: fromChannel ?? fromGlobal ?? fallback,
      color: colorForBadge(setId),
    });
  }
  // Stable display order similar to Twitch
  const order = [
    'broadcaster',
    'moderator',
    'vip',
    'staff',
    'admin',
    'partner',
    'subscriber',
    'founder',
    'premium',
    'bits',
    'turbo',
  ];
  result.sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return result;
}

function colorForBadge(setId: string): string {
  switch (setId) {
    case 'broadcaster':
      return '#e91916';
    case 'moderator':
      return '#00ad03';
    case 'vip':
      return '#e005b9';
    case 'subscriber':
      return '#9146ff';
    case 'bits':
      return '#9b45ff';
    case 'premium':
      return '#00c8b0';
    default:
      return '#adadb8';
  }
}

export async function fetchHelixBadgeMaps(
  clientId: string,
  accessToken: string,
  broadcasterId?: string,
): Promise<{ global: BadgeMap; channel: BadgeMap }> {
  const headers = {
    'Client-ID': clientId,
    Authorization: `Bearer ${accessToken}`,
  };
  const global = await fetchBadgeSet(
    'https://api.twitch.tv/helix/chat/badges/global',
    headers,
  );
  let channel: BadgeMap = new Map();
  if (broadcasterId) {
    channel = await fetchBadgeSet(
      `https://api.twitch.tv/helix/chat/badges?broadcaster_id=${broadcasterId}`,
      headers,
    );
  }
  return { global, channel };
}

async function fetchBadgeSet(url: string, headers: Record<string, string>): Promise<BadgeMap> {
  const map: BadgeMap = new Map();
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return map;
    const data = (await res.json()) as {
      data: Array<{
        set_id: string;
        versions: Array<{ id: string; image_url_2x: string }>;
      }>;
    };
    for (const set of data.data ?? []) {
      const versions = new Map<string, string>();
      for (const v of set.versions) versions.set(v.id, v.image_url_2x);
      map.set(set.set_id, versions);
    }
  } catch {
    // ignore — fallbacks still work
  }
  return map;
}

export async function getAppAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: 'POST' },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  } catch {
    return null;
  }
}

export async function resolveTwitchUserId(
  login: string,
  clientId: string,
  accessToken: string,
): Promise<{ id: string; displayName: string } | null> {
  try {
    const res = await fetch(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
      {
        headers: {
          'Client-ID': clientId,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data: Array<{ id: string; display_name: string }>;
    };
    const user = data.data?.[0];
    return user ? { id: user.id, displayName: user.display_name } : null;
  } catch {
    return null;
  }
}

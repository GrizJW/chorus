import { useState } from 'react';
import type { ChatBadge, Platform } from '@shared/types';

const PILL_SHORT: Record<string, string> = {
  owner: 'OWNER',
  moderator: 'MOD',
  member: 'MEMBER',
  verified: '✓',
  gifter: 'GIFT',
  fanclub: 'FAN',
  'new-gifter': 'NEW',
  broadcaster: 'HOST',
  vip: 'VIP',
  subscriber: 'SUB',
  premium: 'PRIME',
  bits: 'BITS',
  turbo: 'TURBO',
  staff: 'STAFF',
  partner: '✓',
  admin: 'ADMIN',
  founder: 'FOUNDER',
};

function pillLabel(badge: ChatBadge): string {
  if (badge.id === 'gifter' && badge.version) return `G${badge.version}`;
  return PILL_SHORT[badge.id] ?? badge.label.slice(0, 6).toUpperCase();
}

function BadgeItem({
  badge,
  platform,
}: {
  badge: ChatBadge;
  platform: Platform;
}) {
  const [imgFailed, setImgFailed] = useState(!badge.imageUrl);

  if (!imgFailed && badge.imageUrl) {
    return (
      <img
        className="badge-img"
        src={badge.imageUrl}
        alt={badge.label}
        title={badge.label}
        loading="lazy"
        onError={() => setImgFailed(true)}
      />
    );
  }

  const bg =
    badge.color ??
    (platform === 'youtube' ? '#5e84f1' : platform === 'tiktok' ? '#fe2c55' : '#9146ff');

  return (
    <span
      className="badge-pill"
      title={badge.label}
      style={{
        background: bg,
        color: needsDarkText(bg) ? '#0b0c10' : '#fff',
      }}
    >
      {pillLabel(badge)}
    </span>
  );
}

export function BadgeList({
  badges,
  platform,
}: {
  badges: ChatBadge[];
  platform: Platform;
}) {
  if (!badges.length) return null;
  return (
    <span className="badges" aria-label="badges">
      {badges.map((badge) => (
        <BadgeItem
          key={`${badge.id}-${badge.version ?? ''}-${badge.label}`}
          badge={badge}
          platform={platform}
        />
      ))}
    </span>
  );
}

function needsDarkText(color?: string): boolean {
  if (!color) return false;
  const c = color.replace('#', '');
  if (c.length !== 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

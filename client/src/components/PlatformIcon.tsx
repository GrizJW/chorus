import type { Platform } from '@shared/types';

const COLORS: Record<Platform, string> = {
  twitch: '#9146ff',
  youtube: '#ff0033',
  tiktok: '#000000',
};

export function PlatformIcon({
  platform,
  size = 18,
  withBg = false,
}: {
  platform: Platform;
  size?: number;
  withBg?: boolean;
}) {
  const icon = (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {platform === 'twitch' && (
        <path
          fill="#fff"
          d="M4.25 2 2 5.25v14.5h5V22l3.25-2.25H14.5L22 12.5V2H4.25Zm15.5 9.5-3.5 3.5H13l-2.25 2.25V15H7.5V4.25h12.25v7.25ZM14.5 7h1.75v4.5H14.5V7Zm-4.5 0H11.75v4.5H10V7Z"
        />
      )}
      {platform === 'youtube' && (
        <>
          <path
            fill="#fff"
            d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8Z"
          />
          <path fill={COLORS.youtube} d="M9.75 15.5V8.5L16 12l-6.25 3.5Z" />
        </>
      )}
      {platform === 'tiktok' && (
        <>
          <path
            fill="#25F4EE"
            d="M16.5 2c.4 2.4 1.8 4.2 4 5v2.7c-1.4-.1-2.7-.5-4-1.3v6.4c0 3.6-2.9 6.5-6.5 6.5S3.5 18.4 3.5 14.8 6.4 8.3 10 8.3c.3 0 .7 0 1 .1v2.9a3.6 3.6 0 0 0-1-.1 3.6 3.6 0 1 0 3.6 3.6V2h2.9Z"
            transform="translate(.5 .5)"
          />
          <path
            fill="#FE2C55"
            d="M15.7 1.2c.4 2.4 1.8 4.2 4 5v2.7c-1.4-.1-2.7-.5-4-1.3v6.4c0 3.6-2.9 6.5-6.5 6.5S2.7 17.6 2.7 14 5.6 7.5 9.2 7.5c.3 0 .7 0 1 .1v2.9a3.6 3.6 0 0 0-1-.1 3.6 3.6 0 1 0 3.6 3.6V1.2h2.9Z"
          />
          <path
            fill="#fff"
            d="M15.1 1.6c.4 2.4 1.8 4.2 4 5v2.2c-1.4-.1-2.7-.5-4-1.3v6.9c0 3.6-2.9 6.5-6.5 6.5S2.1 17.8 2.1 14.2 5 7.7 8.6 7.7c.3 0 .7 0 1 .1v2.4a3.6 3.6 0 0 0-1-.1 3.6 3.6 0 1 0 3.6 3.6V1.6h2.9Z"
          />
        </>
      )}
    </svg>
  );

  if (!withBg) return icon;

  const bg =
    platform === 'twitch'
      ? COLORS.twitch
      : platform === 'youtube'
        ? COLORS.youtube
        : 'linear-gradient(135deg,#25F4EE,#FE2C55)';

  return (
    <span
      className="msg-platform"
      style={{
        background: bg,
        boxShadow: `0 4px 14px ${
          platform === 'twitch'
            ? 'rgba(145,70,255,.32)'
            : platform === 'youtube'
              ? 'rgba(255,0,51,.26)'
              : 'rgba(254,44,85,.26)'
        }, inset 0 1px 0 rgba(255,255,255,.22)`,
      }}
      title={platform}
    >
      {icon}
    </span>
  );
}

export function platformLabel(platform: Platform): string {
  return platform === 'twitch' ? 'Twitch' : platform === 'youtube' ? 'YouTube' : 'TikTok';
}

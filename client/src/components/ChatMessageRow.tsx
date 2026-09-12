import type { ChatMessage } from '@shared/types';
import { PlatformIcon } from './PlatformIcon';
import { BadgeList } from './BadgeList';

function formatTime(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(ts));
  } catch {
    return '';
  }
}

export function ChatMessageRow({ message }: { message: ChatMessage }) {
  const nameColor =
    message.color ||
    (message.platform === 'twitch'
      ? '#bf94ff'
      : message.platform === 'youtube'
        ? '#ff8a9b'
        : '#ff7aa2');

  return (
    <article className="msg" data-platform={message.platform}>
      <PlatformIcon platform={message.platform} size={16} withBg />
      <div className="msg-body">
        <div className="msg-header">
          <BadgeList badges={message.badges} platform={message.platform} />
          <span className="username" style={{ color: nameColor }}>
            {message.displayName}
          </span>
          <span className="timestamp">{formatTime(message.timestamp)}</span>
        </div>
        <div className={`msg-text${message.isAction ? ' action' : ''}`}>
          {message.message}
        </div>
        {message.donation && (
          <div className={`donation ${message.donation.kind}`}>
            {message.donation.label ??
              `${message.donation.kind} ${message.donation.amount ?? ''}`.trim()}
          </div>
        )}
      </div>
    </article>
  );
}

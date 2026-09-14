import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, Platform } from '@shared/types';
import { ChatMessageRow } from './ChatMessageRow';

export function ChatFeed({
  messages,
  filter,
}: {
  messages: ChatMessage[];
  filter: Platform | 'all';
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [sticky, setSticky] = useState(true);
  const prevLen = useRef(0);

  const visible =
    filter === 'all' ? messages : messages.filter((m) => m.platform === filter);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (paused || !sticky) return;
    if (visible.length === prevLen.current && visible.length > 0) return;
    prevLen.current = visible.length;
    el.scrollTop = el.scrollHeight;
  }, [visible, paused, sticky]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setSticky(nearBottom);
  };

  return (
    <>
      {(paused || !sticky) && (
        <div className="chat-float">
          {paused && <span className="pause-hint">Paused on hover</span>}
          {!sticky && (
            <button
              className="chip active"
              onClick={() => {
                setSticky(true);
                const el = scrollerRef.current;
                if (el) el.scrollTop = el.scrollHeight;
              }}
            >
              Jump to latest
            </button>
          )}
        </div>
      )}
      <div
        className="chat-scroll"
        ref={scrollerRef}
        onScroll={onScroll}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {visible.length === 0 ? (
          <div className="empty-state">
            <div>
              <h3>Waiting for chat…</h3>
              <p>
                Messages from Twitch, YouTube, and TikTok will appear here with
                platform icons and role badges.
              </p>
            </div>
          </div>
        ) : (
          visible.map((m) => <ChatMessageRow key={m.id} message={m} />)
        )}
      </div>
    </>
  );
}

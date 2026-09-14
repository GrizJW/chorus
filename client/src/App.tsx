import { useEffect, useMemo, useState } from 'react';
import type { Platform } from '@shared/types';
import { useChatSocket } from './hooks/useChatSocket';
import { Sidebar } from './components/Sidebar';
import { ChatFeed } from './components/ChatFeed';
import { PlatformIcon, platformLabel } from './components/PlatformIcon';

type Filter = Platform | 'all';

const FOCUS_KEY = 'chorus-focus-chat';

function readFocusPref(): boolean {
  try {
    return localStorage.getItem(FOCUS_KEY) === '1';
  } catch {
    return false;
  }
}

export default function App() {
  const { messages, streams, demoMode, connected, error, addStream, removeStream, clearMessages } =
    useChatSocket();
  const [filter, setFilter] = useState<Filter>('all');
  const [focusChat, setFocusChat] = useState(readFocusPref);

  useEffect(() => {
    try {
      localStorage.setItem(FOCUS_KEY, focusChat ? '1' : '0');
    } catch {
      /* ignore quota / private mode */
    }
  }, [focusChat]);

  useEffect(() => {
    if (!focusChat) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocusChat(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusChat]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: messages.length,
      twitch: 0,
      youtube: 0,
      tiktok: 0,
    };
    for (const m of messages) c[m.platform] += 1;
    return c;
  }, [messages]);

  const filters: Filter[] = ['all', 'twitch', 'youtube', 'tiktok'];

  return (
    <div className={`app-shell${focusChat ? ' focus-chat' : ''}`}>
      {!focusChat && (
        <Sidebar
          streams={streams}
          demoMode={demoMode}
          connected={connected}
          error={error}
          onAdd={addStream}
          onRemove={removeStream}
        />
      )}

      <main className="panel chat-panel" style={{ position: 'relative' }}>
        <div className="toolbar">
          {filters.map((f) => (
            <button
              key={f}
              className={`chip${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f !== 'all' && <PlatformIcon platform={f} size={14} />}
              {f === 'all' ? 'All' : platformLabel(f)}
              <span className="count">{counts[f]}</span>
            </button>
          ))}
          <button
            type="button"
            className="chip chip-danger"
            onClick={clearMessages}
            title="Clear the message feed. Streams stay connected."
          >
            Clear chat
          </button>
          <button
            type="button"
            className={`chip${focusChat ? ' active' : ''}`}
            onClick={() => setFocusChat((v) => !v)}
            title={
              focusChat
                ? 'Show connect sidebar (Esc)'
                : 'Hide connect sidebar — fullscreen chat'
            }
            aria-pressed={focusChat}
          >
            {focusChat ? 'Exit focus' : 'Focus chat'}
          </button>
          <div className="spacer" />
          <span className="hint" style={{ margin: 0 }}>
            {focusChat ? 'Esc exits focus · Hover chat to pause auto-scroll' : 'Hover chat to pause auto-scroll'}
          </span>
        </div>
        <ChatFeed messages={messages} filter={filter} />
      </main>
    </div>
  );
}

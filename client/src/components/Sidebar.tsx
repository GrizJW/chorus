import { useState, type FormEvent } from 'react';
import type { StreamSource } from '@shared/types';
import { PlatformIcon, platformLabel } from './PlatformIcon';

export function Sidebar({
  streams,
  demoMode,
  connected,
  error,
  onAdd,
  onRemove,
}: {
  streams: StreamSource[];
  demoMode: boolean;
  connected: boolean;
  error: string | null;
  onAdd: (input: string) => Promise<void>;
  onRemove: (id: string) => void;
}) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || busy) return;
    setBusy(true);
    try {
      await onAdd(input.trim());
      setInput('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="panel sidebar">
      <div className="brand">
        <div className="brand-mark">C</div>
        <div>
          <h1>Chorus</h1>
          <p>Unified live chat</p>
        </div>
        <span className={`status-pill${demoMode ? '' : ' live'}`}>
          {demoMode ? 'Demo' : connected ? 'Live' : 'Offline'}
        </span>
      </div>

      <div className="sidebar-section">
        <h2>Add stream</h2>
        <form className="add-form" onSubmit={submit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="URL or username…"
            disabled={demoMode}
            aria-label="Stream URL or username"
          />
          <button className="primary" type="submit" disabled={demoMode || busy || !input.trim()}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </form>
        <p className="hint">
          {demoMode
            ? 'Demo mode is streaming sample messages with badges. Set DEMO_MODE=false in .env for live connectors.'
            : 'Twitch: twitch.tv/name · YouTube: youtube.com/@handle or live URL · TikTok: tiktok.com/@user/live or tiktok:user'}
        </p>

        {error && <div className="error-banner">{error}</div>}

        <h2>Channels ({streams.length})</h2>
        <div className="stream-list">
          {streams.length === 0 && (
            <p className="hint">No channels connected yet.</p>
          )}
          {streams.map((s) => (
            <div key={s.id} className="stream-item">
              <PlatformIcon platform={s.platform} size={16} withBg />
              <div className="meta">
                <div className="name">{s.displayName}</div>
                <div className="sub">
                  <span className={`dot ${s.connected ? 'on' : s.error ? 'err' : ''}`} />
                  {platformLabel(s.platform)}
                  {s.error ? ` · ${s.error}` : s.connected ? ' · connected' : ' · idle'}
                </div>
              </div>
              {!demoMode && (
                <button
                  className="icon-btn"
                  title="Disconnect"
                  onClick={() => onRemove(s.id)}
                  aria-label={`Disconnect ${s.displayName}`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChatMessage,
  ClientToServer,
  ServerToClient,
  StreamSource,
} from '@shared/types';

function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.host;
  // Vite proxies /ws in dev
  return `${proto}://${host}/ws`;
}

export function useChatSocket() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streams, setStreams] = useState<StreamSource[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);

  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        retryRef.current = 0;
      };

      ws.onclose = () => {
        setConnected(false);
        if (closed) return;
        const delay = Math.min(8000, 600 * 2 ** retryRef.current++);
        timer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        setError('WebSocket connection error — is the Chorus server running?');
      };

      ws.onmessage = (ev) => {
        let data: ServerToClient;
        try {
          data = JSON.parse(String(ev.data)) as ServerToClient;
        } catch {
          return;
        }

        switch (data.type) {
          case 'message':
            setMessages((prev) => {
              const next = [...prev, data.payload];
              return next.length > 500 ? next.slice(-500) : next;
            });
            break;
          case 'messages':
            setMessages(data.payload);
            break;
          case 'streams':
            setStreams(data.payload);
            break;
          case 'stream_update':
            setStreams((prev) => {
              const idx = prev.findIndex((s) => s.id === data.payload.id);
              if (idx === -1) return [...prev, data.payload];
              const copy = [...prev];
              copy[idx] = data.payload;
              return copy;
            });
            break;
          case 'status':
            setDemoMode(data.payload.demoMode);
            setConnected(data.payload.connected);
            break;
          case 'error':
            setError(data.payload.message);
            break;
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((msg: ClientToServer) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError('Not connected to server');
      return;
    }
    ws.send(JSON.stringify(msg));
  }, []);

  const addStream = useCallback(
    async (input: string) => {
      setError(null);
      // Prefer REST for clearer errors, also mirror over WS
      try {
        const res = await fetch('/api/streams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Failed to add stream');
        setStreams((prev) => {
          const idx = prev.findIndex((s) => s.id === body.id);
          if (idx === -1) return [...prev, body];
          const copy = [...prev];
          copy[idx] = body;
          return copy;
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      }
    },
    [],
  );

  const removeStream = useCallback(
    (id: string) => {
      setError(null);
      void fetch(`/api/streams/${encodeURIComponent(id)}`, { method: 'DELETE' });
      send({ type: 'remove_stream', id });
      setStreams((prev) => prev.filter((s) => s.id !== id));
    },
    [send],
  );

  return {
    messages,
    streams,
    demoMode,
    connected,
    error,
    setError,
    addStream,
    removeStream,
  };
}

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { ChatHub } from './services/chatHub.js';
import type { ClientToServer, ServerToClient } from '../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const isProd = process.env.NODE_ENV === 'production';

const hub = new ChatHub();
const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    demoMode: hub.demoMode,
    streams: hub.getStreams().length,
  });
});

app.get('/api/streams', (_req, res) => {
  res.json(hub.getStreams());
});

app.post('/api/streams', async (req, res) => {
  try {
    const input = String(req.body?.input ?? '');
    const source = await hub.addStream(input);
    res.json(source);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.delete('/api/streams/:id', async (req, res) => {
  try {
    await hub.removeStream(decodeURIComponent(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

if (isProd) {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function send(ws: WebSocket, msg: ServerToClient): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

wss.on('connection', (ws) => {
  send(ws, {
    type: 'status',
    payload: { demoMode: hub.demoMode, connected: true },
  });
  send(ws, { type: 'streams', payload: hub.getStreams() });
  send(ws, { type: 'messages', payload: hub.getRecentMessages() });

  const unsubscribe = hub.subscribe({
    onMessage: (payload) => send(ws, { type: 'message', payload }),
    onStreamUpdate: (payload) => send(ws, { type: 'stream_update', payload }),
  });

  ws.on('message', async (raw) => {
    let data: ClientToServer;
    try {
      data = JSON.parse(String(raw)) as ClientToServer;
    } catch {
      send(ws, { type: 'error', payload: { message: 'Invalid JSON' } });
      return;
    }

    try {
      if (data.type === 'add_stream') {
        const source = await hub.addStream(data.input);
        send(ws, { type: 'stream_update', payload: source });
        send(ws, { type: 'streams', payload: hub.getStreams() });
      } else if (data.type === 'remove_stream') {
        await hub.removeStream(data.id);
        send(ws, { type: 'streams', payload: hub.getStreams() });
      } else if (data.type === 'list_streams') {
        send(ws, { type: 'streams', payload: hub.getStreams() });
      }
    } catch (err) {
      send(ws, {
        type: 'error',
        payload: { message: err instanceof Error ? err.message : String(err) },
      });
    }
  });

  ws.on('close', () => unsubscribe());
});

server.listen(PORT, () => {
  console.log(`Chorus server listening on http://localhost:${PORT}`);
  console.log(`Demo mode: ${hub.demoMode ? 'ON' : 'OFF'}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
});

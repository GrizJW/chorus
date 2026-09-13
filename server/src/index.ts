import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { ChatHub } from './services/chatHub.js';
import type { ClientToServer, ServerToClient } from '../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type ChorusServerOptions = {
  port?: number;
  clientDist?: string;
  clientOrigin?: string;
  host?: string;
};

export type ChorusServerHandle = {
  server: http.Server;
  port: number;
  close: () => Promise<void>;
};

function findPackageRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        const json = JSON.parse(fs.readFileSync(pkg, 'utf8')) as { name?: string };
        if (json.name === 'chorus') return dir;
      } catch {
        /* keep walking */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '../../..');
}

function resolveClientDist(explicit?: string): string {
  if (explicit) return explicit;
  if (process.env.CHORUS_CLIENT_DIST) return process.env.CHORUS_CLIENT_DIST;
  return path.join(findPackageRoot(), 'client', 'dist');
}

export function startChorusServer(options: ChorusServerOptions = {}): Promise<ChorusServerHandle> {
  const PORT = Number(options.port ?? process.env.PORT ?? 8787);
  const HOST = options.host ?? process.env.HOST ?? '127.0.0.1';
  const CLIENT_ORIGIN =
    options.clientOrigin ?? process.env.CLIENT_ORIGIN ?? `http://${HOST}:${PORT}`;
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
    const clientDist = resolveClientDist(options.clientDist);
    if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
      console.warn(`Client build not found at ${clientDist}. Run npm run build:client.`);
    }
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

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, () => {
      console.log(`Chorus server listening on http://${HOST}:${PORT}`);
      console.log(`Demo mode: ${hub.demoMode ? 'ON' : 'OFF'}`);
      console.log(`WebSocket: ws://${HOST}:${PORT}/ws`);
      resolve({
        server,
        port: PORT,
        close: () =>
          new Promise<void>((res, rej) => {
            for (const client of wss.clients) {
              client.terminate();
            }
            wss.close();
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}

// CLI / npm start — Electron sets CHORUS_ELECTRON=1 and calls startChorusServer itself
if (process.env.CHORUS_ELECTRON !== '1') {
  startChorusServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

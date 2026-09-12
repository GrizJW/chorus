export type Platform = 'twitch' | 'youtube' | 'tiktok';

export interface ChatBadge {
  /** Stable id, e.g. "subscriber", "moderator", "vip" */
  id: string;
  /** Human label / tooltip */
  label: string;
  /** Image URL when available */
  imageUrl?: string;
  /** CSS color hint for fallback pill badges */
  color?: string;
  /** Version / tier (Twitch sub months, etc.) */
  version?: string;
}

export interface ChatMessage {
  id: string;
  platform: Platform;
  channelId: string;
  channelName: string;
  userId: string;
  username: string;
  displayName: string;
  color?: string;
  message: string;
  timestamp: number;
  badges: ChatBadge[];
  /** Bits / Super Chat / gift diamonds when present */
  donation?: {
    kind: 'bits' | 'superchat' | 'gift' | 'membership';
    amount?: number;
    currency?: string;
    label?: string;
  };
  isAction?: boolean;
  avatarUrl?: string;
}

export interface StreamSource {
  id: string;
  platform: Platform;
  /** Channel login, handle, or video/channel id depending on platform */
  identifier: string;
  displayName: string;
  connected: boolean;
  error?: string;
  /** Original URL or input used to add the stream */
  input: string;
}

export type ClientToServer =
  | { type: 'add_stream'; input: string }
  | { type: 'remove_stream'; id: string }
  | { type: 'list_streams' };

export type ServerToClient =
  | { type: 'message'; payload: ChatMessage }
  | { type: 'messages'; payload: ChatMessage[] }
  | { type: 'streams'; payload: StreamSource[] }
  | { type: 'stream_update'; payload: StreamSource }
  | { type: 'error'; payload: { message: string } }
  | { type: 'status'; payload: { demoMode: boolean; connected: boolean } };

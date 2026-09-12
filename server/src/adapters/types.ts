import type { ChatMessage, Platform, StreamSource } from '../../../shared/types.js';

export type MessageHandler = (message: ChatMessage) => void;
export type StatusHandler = (source: StreamSource) => void;

export interface PlatformAdapter {
  readonly platform: Platform;
  connect(input: string): Promise<StreamSource>;
  disconnect(sourceId: string): Promise<void>;
  disconnectAll(): Promise<void>;
  onMessage(handler: MessageHandler): void;
  onStatus(handler: StatusHandler): void;
  getSources(): StreamSource[];
}

export function createSourceId(platform: Platform, identifier: string): string {
  return `${platform}:${identifier.toLowerCase()}`;
}

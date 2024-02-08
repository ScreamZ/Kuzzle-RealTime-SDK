import { WebSocket } from "partysocket";

export interface SDKConfig {
  apiToken?: string;
  port?: number;
  ssl?: boolean;
  webSocket?: {
    protocols?: ConstructorParameters<typeof WebSocket>[1];
    options?: ConstructorParameters<typeof WebSocket>[2];
  };
}
export interface MessageHandler<T> {
  handleMessage: (message: KuzzleMessage<T>) => boolean;
  getPublicAPI(): object;
}

export type KuzzleMessage<Result> = {
  requestId: string;
  /**
   * This is badly named but in this is either
   * - request ID (but should rather rely on {@link KuzzleMessage.requestId})
   * - channel ID for notifications
   */
  room?: string;
  result: Result;
  error: unknown;
};

export type KuzzlePingMessage = { p: 1 | 2 };

export type SubscriptionUserInterest = "all" | "in" | "out";
export type SubscriptionScopeInterest = "all" | "in" | "out";

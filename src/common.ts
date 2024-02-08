import { WebSocket } from "partysocket";

export interface SDKConfig {
  apiToken?: string;
  debug?: boolean;
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

export type KuzzleMessage<Result = unknown> = {
  requestId: string;
  /**
   * This is badly named but in this is either
   * - For request response its same than requestId
   * - For document notification it's channel ID for notifications
   *
   * Therefore checking both is necessary to know what it is.
   */
  room?: string;
  result: Result;
  error: {
    code: number;
    message: string;
    id: string;
    props: string[];
    status: number;
  } | null;
};

export type KuzzleNotificationMessage<T = unknown> = KuzzleMessage<T> & {
  scope: "in" | "out";
  timestamp: number;
  event: "write" | "delete" | "publish";
  action: string;
};

type CommonKuzzleDocumentNotification<Type, P = unknown> = {
  timestamp: number;
  type: Type;
  event: "write" | "delete" | "publish";
  /**
   * - in: document enters (or stays) in the scope.
   * - out: document leaves the scope.
   */
  scope: "in" | "out";
  payload: P;
};

export type KuzzleDocumentNotification<T = unknown> =
  | CommonKuzzleDocumentNotification<"ephemeral", { _source: T }>
  | CommonKuzzleDocumentNotification<
      "document",
      {
        _id: string;
        _source: T;
        /**
         * List of fields that have been updated (only available on document partial updates)
         */
        _updatedFields?: string[];
      }
    >;

export type NotificationCallback = (
  notification: KuzzleDocumentNotification
) => void;

export type KuzzlePingMessage = { p: 1 | 2 };

export type SubscriptionUserInterest = "all" | "in" | "out";
export type SubscriptionScopeInterest = "all" | "in" | "out";

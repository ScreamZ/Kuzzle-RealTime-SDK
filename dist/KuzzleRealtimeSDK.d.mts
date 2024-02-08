import { WebSocket } from 'partysocket';

interface SDKConfig {
    apiToken?: string;
    port?: number;
    ssl?: boolean;
    webSocket?: {
        protocols?: ConstructorParameters<typeof WebSocket>[1];
        options?: ConstructorParameters<typeof WebSocket>[2];
    };
}
interface MessageHandler<T> {
    handleMessage: (message: KuzzleMessage<T>) => boolean;
    getPublicAPI(): object;
}
type KuzzleMessage<Result> = {
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
type SubscriptionUserInterest = "all" | "in" | "out";
type SubscriptionScopeInterest = "all" | "in" | "out";

declare class RequestHandler implements MessageHandler<unknown> {
    private socket;
    private apiToken?;
    private readonly pendingRequests;
    private readonly timeout;
    constructor(socket: WebSocket, apiToken?: string | undefined);
    getPublicAPI: () => {
        sendRequest: <Result extends object>(payload: object) => Promise<KuzzleMessage<Result>>;
    };
    handleMessage(message: KuzzleMessage<unknown>): boolean;
    sendRequest: <Result extends object>(payload: object) => Promise<KuzzleMessage<Result>>;
}

declare class Realtime implements MessageHandler<unknown> {
    private requestHandler;
    private readonly roomsMap;
    /**
     * Used to restore subscriptions in case of a reconnection.
     */
    private readonly subscriptionChannelPayloads;
    constructor(requestHandler: RequestHandler);
    /**
     * Subscribe to document notifications. Those could be ephemeral or persistent.
     *
     * @param filters Koncorde filters
     * @param cb Called when a notification is received and match filter
     */
    subscribeToDocumentNotifications: (args: {
        index: string;
        collection: string;
        scope: SubscriptionScopeInterest;
    }, filters: {} | undefined, cb: (notification: unknown) => void) => Promise<() => Promise<KuzzleMessage<object>> | undefined>;
    /**
     * Subscribe to presence notification, when user enter/leave same room.
     *
     * @param filters Koncorde filters
     * @param cb Called when a notification is received and match filter
     */
    subscribeToPresenceNotifications: (args: {
        index: string;
        collection: string;
        users: SubscriptionUserInterest;
    }, filters: {} | undefined, cb: (notification: unknown) => void) => Promise<() => Promise<KuzzleMessage<object>> | undefined>;
    /**
     * Send ephemeral notification. This is a one-time notification, not persisted in storage.
     *
     * Handled in the same way as {@link subscribeToDocumentNotifications} but with a slightly different payload.
     */
    sendEphemeralNotification: (args: {
        index: string;
        collection: string;
    }, payload: object) => Promise<KuzzleMessage<object>>;
    getPublicAPI: () => {
        subscribeToDocumentNotifications: (args: {
            index: string;
            collection: string;
            scope: SubscriptionScopeInterest;
        }, filters: {} | undefined, cb: (notification: unknown) => void) => Promise<() => Promise<KuzzleMessage<object>> | undefined>;
        subscribeToPresenceNotifications: (args: {
            index: string;
            collection: string;
            users: SubscriptionUserInterest;
        }, filters: {} | undefined, cb: (notification: unknown) => void) => Promise<() => Promise<KuzzleMessage<object>> | undefined>;
        sendEphemeralNotification: (args: {
            index: string;
            collection: string;
        }, payload: object) => Promise<KuzzleMessage<object>>;
    };
    handleMessage(data: KuzzleMessage<unknown>): boolean;
    /**
     * Restore any previous subscriptions in case of a reconnection.
     */
    restoreSubscriptions: () => Promise<void>;
    private registerSubscriptionCallback;
}

declare class KuzzleRealtimeSDK {
    private config?;
    readonly requestHandler: ReturnType<RequestHandler["getPublicAPI"]>;
    readonly realtime: ReturnType<Realtime["getPublicAPI"]>;
    constructor(host: string, config?: SDKConfig | undefined);
}

export { KuzzleRealtimeSDK };

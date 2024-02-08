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
type KuzzleMessage<Result = unknown> = {
    requestId: string;
    /**
     * This is badly named but in this is either
     * - request ID (but should rather rely on {@link KuzzleMessage.requestId})
     * - channel ID for notifications
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
type CommonKuzzleDocumentNotification<Type, P = unknown> = {
    timestamp: number;
    type: Type;
    scope: "in" | "out";
    payload: P;
};
type KuzzleDocumentNotification<T = unknown> = CommonKuzzleDocumentNotification<"ephemeral", {
    _source: T;
}> | CommonKuzzleDocumentNotification<"document", {
    _id: string;
    _source: T;
}>;
type SubscriptionUserInterest = "all" | "in" | "out";
type SubscriptionScopeInterest = "all" | "in" | "out";

declare class RequestHandler implements MessageHandler<unknown> {
    private socket;
    private apiToken?;
    private readonly pendingRequests;
    private readonly timeout;
    private volatile;
    constructor(socket: WebSocket, apiToken?: string | undefined);
    getPublicAPI: () => {
        sendRequest: <Result>(payload: object) => Promise<KuzzleMessage<Result>>;
        setVolatileData: (data: Record<string, unknown>) => void;
    };
    handleMessage(message: KuzzleMessage<unknown>): boolean;
    setVolatileData: (data: Record<string, unknown>) => void;
    sendRequest: <Result>(payload: object) => Promise<KuzzleMessage<Result>>;
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
    subscribeToDocumentNotifications: <T extends Object>(args: {
        index: string;
        collection: string;
        scope: SubscriptionScopeInterest;
    }, filters: {} | undefined, cb: (notification: KuzzleDocumentNotification<T>) => void) => Promise<() => Promise<KuzzleMessage<{
        roomId: string;
    }>> | undefined>;
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
    }, filters: {} | undefined, cb: (notification: unknown) => void) => Promise<() => Promise<KuzzleMessage<{
        roomId: string;
    }>> | undefined>;
    /**
     * Send ephemeral notification. This is a one-time notification, not persisted in storage.
     *
     * Handled in the same way as {@link subscribeToDocumentNotifications} but with a slightly different payload.
     */
    sendEphemeralNotification: (args: {
        index: string;
        collection: string;
    }, payload: object) => Promise<KuzzleMessage<unknown>>;
    getPublicAPI: () => {
        subscribeToDocumentNotifications: <T extends Object>(args: {
            index: string;
            collection: string;
            scope: SubscriptionScopeInterest;
        }, filters: {} | undefined, cb: (notification: KuzzleDocumentNotification<T>) => void) => Promise<() => Promise<KuzzleMessage<{
            roomId: string;
        }>> | undefined>;
        subscribeToPresenceNotifications: (args: {
            index: string;
            collection: string;
            users: SubscriptionUserInterest;
        }, filters: {} | undefined, cb: (notification: unknown) => void) => Promise<() => Promise<KuzzleMessage<{
            roomId: string;
        }>> | undefined>;
        sendEphemeralNotification: (args: {
            index: string;
            collection: string;
        }, payload: object) => Promise<KuzzleMessage<unknown>>;
    };
    handleMessage(data: KuzzleMessage): boolean;
    /**
     * Restore any previous subscriptions in case of a reconnection.
     */
    restoreSubscriptions: () => Promise<void>;
    private registerSubscriptionCallback;
}

declare class Controller {
    protected requestHandler: RequestHandler;
    constructor(requestHandler: RequestHandler);
}

declare class Collection extends Controller {
    exists: (index: string, collection: string) => Promise<boolean>;
    create: (index: string, collection: string, mapping?: object) => Promise<boolean>;
}

declare class Index extends Controller {
    exists: (index: string) => Promise<boolean>;
    create: (index: string) => Promise<boolean>;
}

declare class Document extends Controller {
    create: (index: string, collection: string, body: object, id?: string) => Promise<boolean>;
    update: (index: string, collection: string, id: string, body: object) => Promise<boolean>;
    get: <T>(index: string, collection: string, id: string) => Promise<{
        _id: string;
        _source: T;
    }>;
}

declare class KuzzleRealtimeSDK {
    private config?;
    readonly requestHandler: ReturnType<RequestHandler["getPublicAPI"]>;
    readonly realtime: ReturnType<Realtime["getPublicAPI"]>;
    readonly collection: Collection;
    readonly index: Index;
    readonly document: Document;
    get isConnected(): boolean;
    private readonly socket;
    constructor(host: string, config?: SDKConfig | undefined);
    disconnect(): void;
}

export { KuzzleRealtimeSDK };

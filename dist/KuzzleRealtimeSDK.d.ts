import { WebSocket } from 'partysocket';

interface SDKConfig {
    apiToken?: string;
    debug?: boolean;
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
type KuzzleDocumentNotification<T = unknown> = CommonKuzzleDocumentNotification<"ephemeral", {
    _source: T;
}> | CommonKuzzleDocumentNotification<"document", {
    _id: string;
    _source: T;
    /**
     * List of fields that have been updated (only available on document partial updates)
     */
    _updatedFields?: string[];
}>;
type SubscriptionUserInterest = "all" | "in" | "out";
type SubscriptionScopeInterest = "all" | "in" | "out";

declare class Logger {
    private isEnable;
    constructor(isEnable: boolean);
    log(...args: unknown[]): void;
    setEnable(enable: boolean): void;
}

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

type DocumentSubscriptionArgs = {
    index: string;
    collection: string;
    scope: SubscriptionScopeInterest;
};
type PresenceSubscriptionArgs = {
    index: string;
    collection: string;
    users: SubscriptionUserInterest;
};
declare class Realtime implements MessageHandler<unknown> {
    private requestHandler;
    private logger;
    private readonly roomsMap;
    /**
     * Used to restore subscriptions in case of a reconnection.
     */
    private readonly subscriptionChannelPayloads;
    constructor(requestHandler: RequestHandler, logger: Logger);
    /**
     * Subscribe to document notifications. Those could be ephemeral or persistent.
     *
     * @param filters Koncorde filters
     * @param cb Called when a notification is received and match filter
     */
    subscribeToDocumentNotifications: <T extends Object>(args: DocumentSubscriptionArgs, filters: {} | undefined, cb: (notification: KuzzleDocumentNotification<T>) => void) => Promise<UnsubscribeFn>;
    /**
     * Subscribe to presence notification, when user enter/leave same room.
     *
     * @param filters Koncorde filters
     * @param cb Called when a notification is received and match filter
     */
    subscribeToPresenceNotifications: (args: PresenceSubscriptionArgs, filters: {} | undefined, cb: (notification: unknown) => void) => Promise<UnsubscribeFn>;
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
        subscribeToDocumentNotifications: <T extends Object>(args: DocumentSubscriptionArgs, filters: {} | undefined, cb: (notification: KuzzleDocumentNotification<T>) => void) => Promise<UnsubscribeFn>;
        subscribeToPresenceNotifications: (args: PresenceSubscriptionArgs, filters: {} | undefined, cb: (notification: unknown) => void) => Promise<UnsubscribeFn>;
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
/**
 * Returns the number of remaining subscriptions for the room.
 */
type UnsubscribeFn = () => Promise<number>;

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
    get: <T extends object = object>(index: string, collection: string, id: string) => Promise<{
        _id: string;
        _source: T;
    }>;
    exists: (index: string, collection: string, id: string) => Promise<boolean>;
}

declare class KuzzleRealtimeSDK {
    private config?;
    readonly requestHandler: ReturnType<RequestHandler["getPublicAPI"]>;
    readonly realtime: ReturnType<Realtime["getPublicAPI"]>;
    readonly collection: Collection;
    readonly index: Index;
    readonly document: Document;
    readonly addEventListeners: (typeof WebSocket)["prototype"]["addEventListener"];
    readonly removeEventListeners: (typeof WebSocket)["prototype"]["removeEventListener"];
    get isConnected(): boolean;
    private readonly logger;
    private readonly socket;
    constructor(host: string, config?: SDKConfig | undefined);
    on(event: "open" | "close" | "error", cb: (event: Event) => void): void;
    disconnect(): void;
}

export { KuzzleRealtimeSDK };

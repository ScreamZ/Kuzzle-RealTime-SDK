import { WebSocket } from 'partysocket';

interface SDKConfig {
    /**
     * An initial API Token to use for authentication or any JWT stored to avoid authentication.
     * It will be overridden by any token returned by the in case of login or if you call {@link Authentication.logout} or {@link Authentication.login}
     */
    authToken?: string;
    debug?: boolean;
    port?: number;
    ssl?: boolean;
    webSocket?: {
        protocols?: ConstructorParameters<typeof WebSocket>[1];
        options?: ConstructorParameters<typeof WebSocket>[2];
    };
}
interface MessageHandler<T = unknown> {
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
type KuzzlePresenceNotification<T extends object = {}> = {
    volatile: T;
    /**
     * - in: User entered the room.
     * - out: User left the room.
     */
    scope: "in" | "out";
    current_users_in_room: number;
    timestamp: number;
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
    private authToken?;
    private readonly pendingRequests;
    private readonly timeout;
    private volatile;
    constructor(socket: WebSocket, authToken?: string | undefined);
    getPublicAPI: () => {
        sendRequest: <Result>(payload: object) => Promise<KuzzleMessage<Result>>;
        setVolatileData: (data: Record<string, unknown>) => void;
        setAuthToken: (token?: string) => void;
    };
    handleMessage(message: KuzzleMessage<unknown>): boolean;
    setVolatileData: (data: Record<string, unknown>) => void;
    sendRequest: <Result>(payload: object) => Promise<KuzzleMessage<Result>>;
    setAuthToken: (token?: string) => void;
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
    subscribeToPresenceNotifications: <T extends object>(args: PresenceSubscriptionArgs, filters: {} | undefined, cb: (notification: KuzzlePresenceNotification<T>) => void) => Promise<UnsubscribeFn>;
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
        subscribeToPresenceNotifications: <T_1 extends object>(args: PresenceSubscriptionArgs, filters: {} | undefined, cb: (notification: KuzzlePresenceNotification<T_1>) => void) => Promise<UnsubscribeFn>;
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
    create: <T extends object>(index: string, collection: string, body: T, id?: string) => Promise<boolean>;
    mCreate: <T extends object>(index: string, collection: string, documents: {
        _id?: string | undefined;
        body: T;
    }[], options?: mCreateOpts) => Promise<mCreateResult<T>>;
    update: <T extends object>(index: string, collection: string, id: string, body: Partial<T>) => Promise<boolean>;
    get: <T extends object = object>(index: string, collection: string, id: string) => Promise<{
        _id: string;
        _source: T;
    }>;
    exists: (index: string, collection: string, id: string) => Promise<boolean>;
    delete: (index: string, collection: string, id: string) => Promise<string>;
    deleteByQuery: <T extends object>(index: string, collection: string, query?: {}, options?: DeleteByQueryOpts) => Promise<{
        _id: string;
        source?: T | undefined;
    }[]>;
    search: <T extends object = object>(index: string, collection: string, body: SearchBody, options?: SearchOptions) => Promise<SearchResult<T>>;
}
type SearchBody = {
    query?: object;
    sort?: object;
    aggregations?: object;
};
type SearchOptions = {
    from?: number;
    size?: number;
    scroll?: string;
    lang?: string;
    verb?: string;
};
type SearchResult<T> = {
    total: number;
    hits: Array<{
        _id: string;
        index: string;
        collection: string;
        _score: number;
        _source: T;
        highlight?: object;
        inner_hits?: object;
    }>;
    scrollId?: string;
    aggregations?: object;
    remaining?: number;
};
type DeleteByQueryOpts = {
    silent?: boolean;
    lang?: "elasticsearch" | "koncorde";
    source?: boolean;
};
type mCreateOpts = {
    silent?: boolean;
    strict?: boolean;
};
type mCreateResult<T extends object> = {
    /**
     * Array of succeeded operations
     */
    successes: Array<{
        /**
         * Document unique identifier
         */
        _id: string;
        /**
         * Document content
         */
        _source: T;
        /**
         * Document version number
         */
        _version: number;
        /**
         * `true` if document is created
         */
        created: boolean;
    }>;
    /**
     * Arrays of errored operations
     */
    errors: mResponseErrors<T>;
};
type mResponseErrors<T extends object> = Array<{
    /**
     * Original document that caused the error
     */
    document: {
        _id: string;
        _source: T;
    };
    /**
     * HTTP error status code
     */
    status: number;
    /**
     * Human readable reason
     */
    reason: string;
}>;

declare class Authentication extends Controller {
    getCurrentUser: <T>() => Promise<GetCurrentUserResult<T>>;
    /**
     * Send login request to kuzzle with credentials
     *
     * @param strategy Name of the strategy to use
     * @param credentials Credentials object for the strategy
     * @param expiresIn Expiration time in ms library format. (e.g. "2h")
     *
     * @returns The encrypted JSON Web Token
     */
    login: (strategy: string, credentials: Record<string, unknown>, expiresIn?: string | number) => Promise<GetLoginResult>;
    /**
     * Revokes the provided authentication token if it's not an API key.
     * If there were any, real-time subscriptions are cancelled.
     *
     * Also remove the token from the SDK instance.
     *
     * @param global if true, also revokes all other active sessions that aren't using an API key, instead of just the current one (default: false)
     */
    logout: (global?: boolean) => Promise<void>;
}
type GetLoginResult = {
    _id: string;
    jwt: string;
    expiresAt: number;
    ttl: number;
};
type GetCurrentUserResult<T> = {
    _id: string;
    strategies: string[];
    _source: {
        profileIds: string[];
    } & T;
};

declare class KuzzleRealtimeSDK {
    private config?;
    readonly requestHandler: ReturnType<RequestHandler["getPublicAPI"]>;
    readonly realtime: ReturnType<Realtime["getPublicAPI"]>;
    readonly collection: Collection;
    readonly index: Index;
    readonly document: Document;
    readonly auth: Authentication;
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

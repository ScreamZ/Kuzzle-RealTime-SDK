import { WebSocket } from 'partysocket';
import { nanoid } from 'nanoid';

// src/KuzzleRealtimeSDK.ts

// src/handlers/PingHandler.ts
var PingHandler = class {
  constructor(socket) {
    this.socket = socket;
  }
  pingIntervalRef = null;
  handleMessage(message) {
    if ("p" in message) {
      if (message.p === 1)
        this.socket.send(JSON.stringify({ p: 2 }));
      return true;
    }
    return false;
  }
  initPing(frequency = 5e3) {
    this.stopPing();
    this.pingIntervalRef = setInterval(
      () => this.socket.send(JSON.stringify({ p: 1 })),
      frequency
    );
  }
  stopPing() {
    this.pingIntervalRef && clearInterval(this.pingIntervalRef);
  }
};

// src/Realtime/Room.ts
var Room = class {
  constructor(id) {
    this.id = id;
  }
  channelsMap = /* @__PURE__ */ new Map();
  notifyChannel(channel, message) {
    if (!this.channelsMap.has(channel))
      return;
    const mapped = {
      scope: message.scope,
      payload: message.result,
      timestamp: message.timestamp,
      event: message.event,
      type: message.event === "publish" ? "ephemeral" : "document"
    };
    this.channelsMap.get(channel).forEach((notify) => notify(mapped));
  }
  infos() {
    return {
      roomID: this.id,
      total: Array.from(this.channelsMap.values()).reduce(
        (acc, channelSet) => acc + channelSet.size,
        0
      ),
      perChannel: Array.from(this.channelsMap).reduce(
        (acc, [channel, channelSet]) => ({
          ...acc,
          [channel]: channelSet.size
        }),
        {}
      )
    };
  }
  /**
   * Return true if there is still some interest in this room. (i.e. at least one channel is still registered with a callback)
   */
  hasRemainingInterestForRoom() {
    return this.channelsMap.size > 0;
  }
  hasRemainingInterestForChannel(channel) {
    return this.channelsMap.has(channel) && this.channelsMap.get(channel).size > 0;
  }
  addObserver(forChannelID, withCb) {
    if (!this.channelsMap.has(forChannelID))
      this.channelsMap.set(forChannelID, /* @__PURE__ */ new Set());
    this.channelsMap.get(forChannelID).add(withCb);
  }
  removeObserver(channel, cb) {
    this.channelsMap.get(channel).delete(cb);
    if (this.channelsMap.get(channel).size === 0) {
      this.channelsMap.delete(channel);
    }
  }
};

// src/Realtime/Realtime.ts
var Realtime = class {
  constructor(requestHandler, logger) {
    this.requestHandler = requestHandler;
    this.logger = logger;
  }
  roomsMap = /* @__PURE__ */ new Map();
  /**
   * Used to restore subscriptions in case of a reconnection.
   */
  subscriptionChannelPayloads = /* @__PURE__ */ new Map();
  /**
   * Subscribe to document notifications. Those could be ephemeral or persistent.
   *
   * @param filters Koncorde filters
   * @param cb Called when a notification is received and match filter
   */
  subscribeToDocumentNotifications = (args, filters = {}, cb) => {
    const payload = {
      ...args,
      controller: "realtime",
      action: "subscribe",
      body: filters,
      users: "none"
    };
    return this.registerSubscriptionCallback(
      payload,
      cb
    );
  };
  /**
   * Subscribe to presence notification, when user enter/leave same room.
   *
   * @param filters Koncorde filters
   * @param cb Called when a notification is received and match filter
   */
  subscribeToPresenceNotifications = (args, filters = {}, cb) => {
    const payload = {
      ...args,
      controller: "realtime",
      action: "subscribe",
      body: filters,
      scope: "none"
      // No document in this callback.
    };
    return this.registerSubscriptionCallback(payload, cb);
  };
  /**
   * Send ephemeral notification. This is a one-time notification, not persisted in storage.
   *
   * Handled in the same way as {@link subscribeToDocumentNotifications} but with a slightly different payload.
   */
  sendEphemeralNotification = (args, payload) => {
    return this.requestHandler.sendRequest({
      ...args,
      controller: "realtime",
      action: "publish",
      body: payload
    });
  };
  // Internal API
  getPublicAPI = () => ({
    subscribeToDocumentNotifications: this.subscribeToDocumentNotifications,
    subscribeToPresenceNotifications: this.subscribeToPresenceNotifications,
    sendEphemeralNotification: this.sendEphemeralNotification
  });
  handleMessage(data) {
    const channelID = data.room;
    const roomID = channelID ? channelID.split("-")[0] : null;
    const matchingSubscriptionRoom = roomID ? this.roomsMap.get(roomID) : null;
    if (channelID && matchingSubscriptionRoom) {
      matchingSubscriptionRoom.notifyChannel(
        channelID,
        data
      );
      return true;
    }
    return false;
  }
  /**
   * Restore any previous subscriptions in case of a reconnection.
   */
  restoreSubscriptions = async () => {
    if (this.subscriptionChannelPayloads.size <= 0)
      return;
    await Promise.all(
      Array.from(this.subscriptionChannelPayloads).map(
        ([channelID, requestPayload]) => {
          this.logger.log("Restoring subscriptions for room", channelID);
          return this.requestHandler.sendRequest(requestPayload);
        }
      )
    );
    this.logger.log("Subscriptions restored.");
  };
  async registerSubscriptionCallback(payload, cb) {
    const response = await this.requestHandler.sendRequest(
      payload
    );
    if (response.error)
      throw new Error(`${response.error.id} - ${response.error.message}`);
    const { roomId: roomID, channel: channelID } = response.result;
    this.subscriptionChannelPayloads.set(channelID, payload);
    if (!this.roomsMap.has(roomID))
      this.roomsMap.set(roomID, new Room(roomID));
    const room = this.roomsMap.get(roomID);
    room.addObserver(channelID, cb);
    this.logger.log("New subscription", room.infos());
    return async () => {
      room.removeObserver(channelID, cb);
      if (!room.hasRemainingInterestForChannel(channelID))
        this.subscriptionChannelPayloads.delete(channelID);
      if (!room.hasRemainingInterestForRoom()) {
        this.logger.log(
          "Unsubscribing from room",
          roomID,
          "because no more interest."
        );
        await this.requestHandler.sendRequest({
          controller: "realtime",
          action: "unsubscribe",
          body: { roomId: roomID }
        });
      }
      return room.infos().total;
    };
  }
};
var RequestHandler = class {
  constructor(socket, authToken) {
    this.socket = socket;
    this.authToken = authToken;
  }
  pendingRequests = /* @__PURE__ */ new Map();
  timeout = 5e3;
  volatile = {};
  getPublicAPI = () => ({
    sendRequest: this.sendRequest,
    setVolatileData: this.setVolatileData,
    setAuthToken: this.setAuthToken
  });
  handleMessage(message) {
    if (message.requestId !== message.room)
      return false;
    const matchingRequestResolver = this.pendingRequests.get(message.requestId);
    if (!matchingRequestResolver)
      return false;
    matchingRequestResolver(message);
    this.pendingRequests.delete(message.requestId);
    return true;
  }
  setVolatileData = (data) => {
    this.volatile = data;
  };
  sendRequest = (payload) => new Promise((resolve, reject) => {
    const id = nanoid();
    const timeoutRef = setTimeout(
      () => reject("Request timed out"),
      this.timeout
    );
    this.pendingRequests.set(id, (responsePayload) => {
      clearTimeout(timeoutRef);
      return responsePayload.error ? reject(responsePayload.error) : resolve(responsePayload);
    });
    this.socket.send(
      JSON.stringify({
        ...payload,
        requestId: id,
        volatile: this.volatile,
        ...this.authToken && { jwt: this.authToken }
        // Add token if defined
      })
    );
  });
  setAuthToken = (token) => {
    this.authToken = token;
  };
};

// src/Controller.ts
var Controller = class {
  constructor(requestHandler) {
    this.requestHandler = requestHandler;
  }
};

// src/controllers/Collection.ts
var Collection = class extends Controller {
  exists = async (index, collection) => {
    const response = await this.requestHandler.sendRequest({
      controller: "collection",
      action: "exists",
      index,
      collection
    });
    return response.result;
  };
  create = async (index, collection, mapping) => {
    const response = await this.requestHandler.sendRequest({
      controller: "collection",
      action: "create",
      index,
      collection,
      body: mapping
    });
    return response.result;
  };
};

// src/controllers/Index.ts
var Index = class extends Controller {
  exists = async (index) => {
    const response = await this.requestHandler.sendRequest({
      controller: "index",
      action: "exists",
      index
    });
    return response.result;
  };
  create = async (index) => {
    const response = await this.requestHandler.sendRequest({
      controller: "index",
      action: "create",
      index
    });
    return response.result;
  };
};

// src/controllers/Document.ts
var Document = class extends Controller {
  create = async (index, collection, body, id) => {
    const response = await this.requestHandler.sendRequest({
      controller: "document",
      action: "create",
      index,
      collection,
      _id: id,
      body
    });
    return response.result;
  };
  update = async (index, collection, id, body) => {
    const response = await this.requestHandler.sendRequest({
      controller: "document",
      action: "update",
      index,
      collection,
      _id: id,
      body
    });
    return response.result;
  };
  get = async (index, collection, id) => {
    const response = await this.requestHandler.sendRequest({
      controller: "document",
      action: "get",
      index,
      collection,
      _id: id
    });
    return response.result;
  };
  exists = async (index, collection, id) => {
    const response = await this.requestHandler.sendRequest({
      controller: "document",
      action: "exists",
      index,
      collection,
      _id: id
    });
    return response.result;
  };
  delete = async (index, collection, id) => {
    const response = await this.requestHandler.sendRequest({
      controller: "document",
      action: "delete",
      index,
      collection,
      _id: id
    });
    return response.result._id;
  };
  search = async (index, collection, body, options = {}) => {
    const response = await this.requestHandler.sendRequest({
      controller: "document",
      action: "search",
      index,
      collection,
      body,
      ...options
    });
    return response.result;
  };
};

// src/Logger.ts
var Logger = class {
  constructor(isEnable) {
    this.isEnable = isEnable;
  }
  log(...args) {
    if (this.isEnable)
      console.log(...args);
  }
  setEnable(enable) {
    this.isEnable = enable;
  }
};

// src/controllers/Authentication.ts
var Authentication = class extends Controller {
  getCurrentUser = async () => {
    const res = await this.requestHandler.sendRequest({
      controller: "auth",
      action: "getCurrentUser"
    });
    return res.result;
  };
  /**
   * Send login request to kuzzle with credentials
   *
   * @param strategy Name of the strategy to use
   * @param credentials Credentials object for the strategy
   * @param expiresIn Expiration time in ms library format. (e.g. "2h")
   *
   * @returns The encrypted JSON Web Token
   */
  login = async (strategy, credentials, expiresIn) => {
    const res = await this.requestHandler.sendRequest({
      controller: "auth",
      action: "login",
      body: credentials,
      strategy,
      expiresIn
    });
    if (res.result.jwt)
      this.requestHandler.setAuthToken(res.result.jwt);
    return res.result;
  };
  /**
   * Revokes the provided authentication token if it's not an API key.
   * If there were any, real-time subscriptions are cancelled.
   *
   * Also remove the token from the SDK instance.
   *
   * @param global if true, also revokes all other active sessions that aren't using an API key, instead of just the current one (default: false)
   */
  logout = async (global) => {
    await this.requestHandler.sendRequest({
      controller: "auth",
      action: "logout",
      global
    });
    this.requestHandler.setAuthToken(void 0);
  };
};

// src/handlers/AuthenticationHandler.ts
var AuthenticationHandler = class {
  constructor(requestHandler) {
    this.requestHandler = requestHandler;
  }
  handleMessage(message) {
    var _a;
    if (((_a = message.error) == null ? void 0 : _a.id) === "security.token.invalid")
      this.requestHandler.setAuthToken(void 0);
    return false;
  }
  getPublicAPI() {
    return {};
  }
};

// src/KuzzleRealtimeSDK.ts
var KuzzleRealtimeSDK = class {
  constructor(host, config) {
    this.config = config;
    var _a, _b, _c, _d, _e, _f;
    this.logger = new Logger((config == null ? void 0 : config.debug) ?? false);
    this.socket = new WebSocket(
      `${((_a = this.config) == null ? void 0 : _a.ssl) ? "wss" : "ws"}://${host}:${((_b = this.config) == null ? void 0 : _b.port) || 7512}`,
      (_c = config == null ? void 0 : config.webSocket) == null ? void 0 : _c.protocols,
      (_d = config == null ? void 0 : config.webSocket) == null ? void 0 : _d.options
    );
    if (((_e = process == null ? void 0 : process.versions) == null ? void 0 : _e.node) !== null)
      this.socket.binaryType = "arraybuffer";
    this.addEventListeners = this.socket.addEventListener.bind(this.socket);
    this.removeEventListeners = this.socket.removeEventListener.bind(
      this.socket
    );
    const pingHandler = new PingHandler(this.socket);
    const requestHandler = new RequestHandler(
      this.socket,
      (_f = this.config) == null ? void 0 : _f.authToken
    );
    const authHandler = new AuthenticationHandler(requestHandler);
    const realtime = new Realtime(requestHandler, this.logger);
    this.requestHandler = requestHandler.getPublicAPI();
    this.realtime = realtime.getPublicAPI();
    this.collection = new Collection(requestHandler);
    this.index = new Index(requestHandler);
    this.document = new Document(requestHandler);
    this.auth = new Authentication(requestHandler);
    this.socket.addEventListener("message", (rawMessage) => {
      const message = JSON.parse(
        rawMessage.data || rawMessage
      );
      if (pingHandler.handleMessage(message))
        return;
      if (authHandler.handleMessage(message))
        return;
      if (requestHandler.handleMessage(message))
        return;
      if (realtime.handleMessage(message))
        return;
    });
    this.socket.addEventListener("open", async () => {
      this.logger.log("SDK - Socket opened to Kuzzle");
      pingHandler.initPing();
      await realtime.restoreSubscriptions();
    });
    this.socket.addEventListener("close", (event) => {
      this.logger.log(`SDK - Socket from Kuzzle closed [${event.reason}]`);
      pingHandler.stopPing();
    });
    this.socket.addEventListener("error", (event) => {
      this.logger.log("SDK - Socket error", event);
    });
  }
  // Controllers
  requestHandler;
  realtime;
  collection;
  index;
  document;
  auth;
  // Public methods
  addEventListeners;
  removeEventListeners;
  get isConnected() {
    return this.socket.readyState === this.socket.OPEN;
  }
  logger;
  socket;
  on(event, cb) {
    this.socket.addEventListener(event, cb);
  }
  disconnect() {
    this.socket.close();
  }
};

export { KuzzleRealtimeSDK };

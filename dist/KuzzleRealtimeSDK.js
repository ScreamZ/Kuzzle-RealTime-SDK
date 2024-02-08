'use strict';

var partysocket = require('partysocket');
var nanoid = require('nanoid');

// src/KuzzleRealtimeSDK.ts

// src/PingHandler.ts
var PingHandler = class {
  constructor(socket) {
    this.socket = socket;
  }
  pingIntervalRef = null;
  handleMessage(message) {
    if ("p" in message && message.p === 1) {
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
      type: message.action === "publish" ? "ephemeral" : "document"
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
  constructor(requestHandler) {
    this.requestHandler = requestHandler;
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
          console.log("Restoring subscriptions for room", channelID);
          return this.requestHandler.sendRequest(requestPayload);
        }
      )
    );
    console.log("Subscriptions restored.");
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
    console.log("Room", roomID, room.infos());
    return () => {
      room.removeObserver(channelID, cb);
      if (!room.hasRemainingInterestForChannel(channelID))
        this.subscriptionChannelPayloads.delete(channelID);
      if (!room.hasRemainingInterestForRoom()) {
        console.log(
          "Unsubscribing from room",
          roomID,
          "because no more interest."
        );
        return this.requestHandler.sendRequest({
          controller: "realtime",
          action: "unsubscribe",
          body: { roomId: roomID }
        });
      }
    };
  }
};
var RequestHandler = class {
  constructor(socket, apiToken) {
    this.socket = socket;
    this.apiToken = apiToken;
  }
  pendingRequests = /* @__PURE__ */ new Map();
  timeout = 5e3;
  volatile = {};
  getPublicAPI = () => ({
    sendRequest: this.sendRequest,
    setVolatileData: this.setVolatileData
  });
  handleMessage(message) {
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
    const id = nanoid.nanoid();
    const timeoutRef = setTimeout(
      () => reject("Request timed out"),
      this.timeout
    );
    this.pendingRequests.set(id, (responsePayload) => {
      clearTimeout(timeoutRef);
      resolve(responsePayload);
    });
    this.socket.send(
      JSON.stringify({
        ...payload,
        requestId: id,
        volatile: this.volatile,
        ...this.apiToken && { jwt: this.apiToken }
        // Add token if defined
      })
    );
  });
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
};

// src/KuzzleRealtimeSDK.ts
var KuzzleRealtimeSDK = class {
  constructor(host, config) {
    this.config = config;
    var _a, _b, _c, _d, _e, _f;
    this.socket = new partysocket.WebSocket(
      `${((_a = this.config) == null ? void 0 : _a.ssl) ? "wss" : "ws"}://${host}:${((_b = this.config) == null ? void 0 : _b.port) || 7512}`,
      (_c = config == null ? void 0 : config.webSocket) == null ? void 0 : _c.protocols,
      (_d = config == null ? void 0 : config.webSocket) == null ? void 0 : _d.options
    );
    if (((_e = process == null ? void 0 : process.versions) == null ? void 0 : _e.node) !== null)
      this.socket.binaryType = "arraybuffer";
    const pingHandler = new PingHandler(this.socket);
    const requestHandler = new RequestHandler(
      this.socket,
      (_f = this.config) == null ? void 0 : _f.apiToken
    );
    const realtime = new Realtime(requestHandler);
    this.requestHandler = requestHandler.getPublicAPI();
    this.realtime = realtime.getPublicAPI();
    this.collection = new Collection(requestHandler);
    this.index = new Index(requestHandler);
    this.document = new Document(requestHandler);
    this.socket.addEventListener("message", (rawMessage) => {
      const message = JSON.parse(
        rawMessage.data || rawMessage
      );
      if (pingHandler.handleMessage(message))
        return;
      if (requestHandler.handleMessage(message))
        return;
      if (realtime.handleMessage(message))
        return;
    });
    this.socket.addEventListener("open", async () => {
      console.log("SDK - Socket opened to Kuzzle");
      pingHandler.initPing();
      await realtime.restoreSubscriptions();
    });
    this.socket.addEventListener("close", (event) => {
      console.log(`SDK - Socket from Kuzzle closed [${event.reason}]`);
      pingHandler.stopPing();
    });
    this.socket.addEventListener("error", (event) => {
      console.log("SDK - Socket error", event);
    });
  }
  requestHandler;
  realtime;
  collection;
  index;
  document;
  get isConnected() {
    return this.socket.readyState === this.socket.OPEN;
  }
  socket;
  disconnect() {
    this.socket.close();
  }
};

exports.KuzzleRealtimeSDK = KuzzleRealtimeSDK;

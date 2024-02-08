import { WebSocket } from "partysocket";

import { KuzzleMessage, KuzzlePingMessage, SDKConfig } from "./common";
import { PingHandler } from "./PingHandler";
import { Realtime } from "./Realtime/Realtime";
import { RequestHandler } from "./RequestHandler";
import { Collection } from "./controllers/Collection";
import { Index } from "./controllers/Index";
import { Document } from "./controllers/Document";
import { Logger } from "./Logger";
import { Authentication } from "./controllers/Authentication";

export class KuzzleRealtimeSDK {
  // Controllers
  readonly requestHandler: ReturnType<RequestHandler["getPublicAPI"]>;
  readonly realtime: ReturnType<Realtime["getPublicAPI"]>;
  readonly collection: Collection;
  readonly index: Index;
  readonly document: Document;
  readonly auth: Authentication;

  // Public methods
  readonly addEventListeners: (typeof WebSocket)["prototype"]["addEventListener"];
  readonly removeEventListeners: (typeof WebSocket)["prototype"]["removeEventListener"];

  get isConnected() {
    return this.socket.readyState === this.socket.OPEN;
  }

  private readonly logger: Logger;
  private readonly socket: WebSocket;

  constructor(host: string, private config?: SDKConfig) {
    this.logger = new Logger(config?.debug ?? false);
    this.socket = new WebSocket(
      `${this.config?.ssl ? "wss" : "ws"}://${host}:${
        this.config?.port || 7512
      }`,
      config?.webSocket?.protocols,
      config?.webSocket?.options
    );
    if (process?.versions?.node !== null)
      this.socket.binaryType = "arraybuffer"; // https://github.com/partykit/partykit/issues/774#issuecomment-1926694586

    this.addEventListeners = this.socket.addEventListener.bind(this.socket);
    this.removeEventListeners = this.socket.removeEventListener.bind(
      this.socket
    );

    // Handlers
    const pingHandler = new PingHandler(this.socket);
    const requestHandler = new RequestHandler(
      this.socket,
      this.config?.authToken
    );
    const realtime = new Realtime(requestHandler, this.logger);

    // Bind public APIs
    this.requestHandler = requestHandler.getPublicAPI();
    this.realtime = realtime.getPublicAPI();
    this.collection = new Collection(requestHandler);
    this.index = new Index(requestHandler);
    this.document = new Document(requestHandler);
    this.auth = new Authentication(requestHandler);

    // Sockets
    this.socket.addEventListener("message", (rawMessage) => {
      const message: KuzzleMessage<unknown> | KuzzlePingMessage = JSON.parse(
        rawMessage.data || rawMessage
      );

      // Short-circuit if message is a ping
      if (pingHandler.handleMessage(message)) return;

      // Short-circuit if message is a response to a request
      if (requestHandler.handleMessage(message)) return;

      // Short-circuit if message is handled by realtime
      if (realtime.handleMessage(message)) return;
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

  on(event: "open" | "close" | "error", cb: (event: Event) => void) {
    this.socket.addEventListener(event, cb);
  }

  disconnect() {
    this.socket.close();
  }
}

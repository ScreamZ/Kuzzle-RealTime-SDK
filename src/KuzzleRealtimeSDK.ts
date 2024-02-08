import { WebSocket } from "partysocket";

import { KuzzleMessage, KuzzlePingMessage, SDKConfig } from "./common";
import { PingHandler } from "./PingHandler";
import { Realtime } from "./Realtime/Realtime";
import { RequestHandler } from "./RequestHandler";

export class KuzzleRealtimeSDK {
  readonly requestHandler: ReturnType<RequestHandler["getPublicAPI"]>;
  readonly realtime: ReturnType<Realtime["getPublicAPI"]>;

  constructor(host: string, private config?: SDKConfig) {
    const socket = new WebSocket(
      `${this.config?.ssl ? "wss" : "ws"}://${host}:${
        this.config?.port || 7512
      }`,
      config?.webSocket?.protocols,
      config?.webSocket?.options
    );
    if (process?.versions?.node !== null) socket.binaryType = "arraybuffer"; // https://github.com/partykit/partykit/issues/774#issuecomment-1926694586

    // Handlers
    const pingHandler = new PingHandler(socket);
    const requestHandler = new RequestHandler(socket, this.config?.apiToken);
    const realtime = new Realtime(requestHandler);

    // Bind public APIs
    this.requestHandler = requestHandler.getPublicAPI();
    this.realtime = realtime.getPublicAPI();

    // Sockets
    socket.addEventListener("message", (rawMessage) => {
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

    socket.addEventListener("open", async () => {
      console.log("SDK - Socket opened to Kuzzle");
      pingHandler.initPing();
      await realtime.restoreSubscriptions();
    });

    socket.addEventListener("close", (event) => {
      console.log(`SDK - Socket from Kuzzle closed [${event.reason}]`);
      pingHandler.stopPing();
    });

    socket.addEventListener("error", (event) => {
      console.log("SDK - Socket error", event);
    });
  }
}

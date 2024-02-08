import "partysocket/event-target-polyfill";

import { WebSocket } from "partysocket";

import { KuzzleMessage, KuzzlePingMessage } from "./common";
import { PingHandler } from "./PingHandler";
import { Realtime } from "./Realtime/Realtime";
import { RequestHandler } from "./RequestHandler";

export class KuzzleRealtimeSDK {
  readonly requestHandler: ReturnType<RequestHandler["getPublicAPI"]>;
  readonly realtime: ReturnType<Realtime["getPublicAPI"]>;

  constructor(host: string, apiToken: string, port?: number) {
    const socket = new WebSocket(`ws://${host}:${port || 7515}`);

    // Handlers
    const pingHandler = new PingHandler(socket);
    const requestHandler = new RequestHandler(socket, apiToken);
    this.requestHandler = requestHandler.getPublicAPI();
    const realtime = new Realtime(requestHandler);
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
      console.log("SDK - Socket from Kuzzle closed", event.reason);
      pingHandler.stopPing();
    });

    socket.addEventListener("error", (event) => {
      console.log("SDK - Socket error", event.error.message);
    });
  }
}

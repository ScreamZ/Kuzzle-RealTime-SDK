import "partysocket/event-target-polyfill";

import { WebSocket } from "partysocket";

import { KuzzleMessage, KuzzlePingMessage } from "./common";
import { PingHandler } from "./PingHandler";
import { Realtime } from "./Realtime/Realtime";
import { RequestHandler } from "./RequestHandler";

export class KuzzleRealtimeSDK {
  readonly requestHandler;
  readonly realtime;

  constructor(host: string, apiToken: string, port?: number) {
    const socket = new WebSocket(`ws://${host}:${port || 7515}`);
    const pingHandler = new PingHandler(socket);
    const requestHandler = new RequestHandler(socket, apiToken);
    this.requestHandler = requestHandler.getPublicAPI();
    const realtime = new Realtime(requestHandler);
    this.realtime = realtime.getPublicAPI();

    // message is received
    socket.addEventListener("message", (rawMessage) => {
      const message: KuzzleMessage<unknown> | KuzzlePingMessage = JSON.parse(rawMessage.data || rawMessage);

      // Short-circuit if message is a ping
      if (pingHandler.handleMessage(message)) return;

      // Short-circuit if message is a response to a request
      if (requestHandler.handleMessage(message)) return;

      // Short-circuit if message is handled by realtime
      if (realtime.handleMessage(message)) return;
    });

    socket.addEventListener("open", async () => {
      console.log("Connection opened");
      pingHandler.initPing();
      await realtime.restoreSubscriptions();
    });

    socket.addEventListener("close", (event) => {
      pingHandler.stopPing();
      console.log("closed", event);
    });

    socket.addEventListener("error", (event) => {
      console.log("error", event);
    });
  }
}

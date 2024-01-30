import { WebSocket } from "partysocket";

import { KuzzleMessage, KuzzlePingMessage } from "./common";

export class PingHandler {
  private pingIntervalRef: NodeJS.Timer | null = null;

  constructor(private readonly socket: WebSocket) {}

  handleMessage(message: KuzzleMessage<unknown> | KuzzlePingMessage): message is KuzzlePingMessage {
    if ("p" in message) {
      this.socket.send(JSON.stringify({ p: message.p === 1 ? 2 : 1 }));
      return true;
    }
    return false;
  }

  initPing(frequency = 2000) {
    this.pingIntervalRef = setInterval(() => {
      this.socket.send(JSON.stringify({ p: 1 }));
    }, frequency);
  }

  stopPing() {
    this.pingIntervalRef && clearInterval(this.pingIntervalRef);
  }
}

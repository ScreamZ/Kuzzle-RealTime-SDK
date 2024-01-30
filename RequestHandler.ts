import { WebSocket } from "partysocket";

import { KuzzleMessage, MessageHandler } from "./common";

export class RequestHandler implements MessageHandler<unknown> {
  private pendingRequests: Map<string, (response: KuzzleMessage<unknown>) => void> = new Map();

  constructor(private socket: WebSocket, private apiToken: string) {}

  getPublicAPI() {
    return {
      sendRequest: this.sendRequest.bind(this),
    };
  }

  public handleMessage(message: KuzzleMessage<unknown>): boolean {
    const matchingRequestResolver = this.pendingRequests.get(message.requestId);

    if (!matchingRequestResolver) return false;

    matchingRequestResolver(message);
    this.pendingRequests.delete(message.requestId);
    return true;
  }

  public sendRequest<Result extends object>(payload: object) {
    return new Promise<KuzzleMessage<Result>>((resolve) => {
      const id = (Date.now() * Math.random()).toString(); // TODO: uuid or nanoid
      this.pendingRequests.set(id, resolve as (response: KuzzleMessage<unknown>) => void);
      // TODO: implement timeout
      this.socket.send(
        JSON.stringify({
          ...payload,
          requestId: id,
          jwt: this.apiToken,
        }),
      );
    });
  }
}

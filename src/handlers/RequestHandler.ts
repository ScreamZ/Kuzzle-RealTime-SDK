import { WebSocket } from "partysocket";
import { nanoid } from "nanoid";

import { KuzzleMessage, MessageHandler } from "../common";

type RequestHandlerFn = (response: KuzzleMessage<unknown>) => void;

export class RequestHandler implements MessageHandler<unknown> {
  private readonly pendingRequests = new Map<string, RequestHandlerFn>();
  private readonly timeout = 5000;
  private volatile: Record<string, unknown> = {};

  constructor(private socket: WebSocket, private authToken?: string) {}

  getPublicAPI = () => ({
    sendRequest: this.sendRequest,
    setVolatileData: this.setVolatileData,
    setAuthToken: this.setAuthToken,
  });

  handleMessage(message: KuzzleMessage<unknown>): boolean {
    // If request ID is not the same as room, it's a notification.
    if (message.requestId !== message.room) return false;

    const matchingRequestResolver = this.pendingRequests.get(message.requestId);

    if (!matchingRequestResolver) return false;

    matchingRequestResolver(message);
    this.pendingRequests.delete(message.requestId);
    return true;
  }

  public setVolatileData = (data: Record<string, unknown>) => {
    this.volatile = data;
  };

  public sendRequest = <Result>(payload: object) =>
    new Promise<KuzzleMessage<Result>>((resolve, reject) => {
      const id = nanoid();

      // Init timeout
      const timeoutRef = setTimeout(
        () => reject("Request timed out"),
        this.timeout
      );

      // Add handler and timeout clearer.
      this.pendingRequests.set(id, (responsePayload) => {
        clearTimeout(timeoutRef);

        return responsePayload.error
          ? reject(responsePayload.error)
          : resolve(responsePayload as KuzzleMessage<Result>);
      });

      // Send request
      this.socket.send(
        JSON.stringify({
          ...payload,
          requestId: id,
          volatile: this.volatile,
          ...(this.authToken && { jwt: this.authToken }), // Add token if defined
        })
      );
    });

  public setAuthToken = (token?: string) => {
    this.authToken = token;
  };
}

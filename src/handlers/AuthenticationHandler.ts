import { KuzzleMessage, MessageHandler } from "../common";
import { RequestHandler } from "./RequestHandler";

export class AuthenticationHandler implements MessageHandler<unknown> {
  constructor(private requestHandler: RequestHandler) {}

  handleMessage(message: KuzzleMessage<unknown>): boolean {
    // Always let message pass through, but clear token if it's invalid
    if (message.error?.id === "security.token.invalid")
      this.requestHandler.setAuthToken(undefined);

    return false;
  }

  getPublicAPI(): object {
    return {};
  }
}

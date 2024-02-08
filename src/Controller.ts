import { RequestHandler } from "./handlers/RequestHandler";

export class Controller {
  constructor(protected requestHandler: RequestHandler) {}
}

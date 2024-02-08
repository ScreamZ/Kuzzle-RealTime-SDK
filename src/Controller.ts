import { RequestHandler } from "./RequestHandler";

export class Controller {
  constructor(protected requestHandler: RequestHandler) {}
}

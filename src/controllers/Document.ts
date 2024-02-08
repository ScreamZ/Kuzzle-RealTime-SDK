import { Controller } from "../Controller";

export class Document extends Controller {
  create = async (
    index: string,
    collection: string,
    body: object,
    id?: string
  ) => {
    const response = await this.requestHandler.sendRequest<boolean>({
      controller: "document",
      action: "create",
      index,
      collection,
      _id: id,
      body,
    });

    return response.result;
  };

  get = async (index: string, collection: string, id: string) => {
    const response = await this.requestHandler.sendRequest<object>({
      controller: "document",
      action: "get",
      index,
      collection,
      _id: id,
    });

    return response.result;
  };
}

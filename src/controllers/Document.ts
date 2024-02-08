import { Controller } from "../Controller";

export class Document extends Controller {
  create = async <T extends object>(
    index: string,
    collection: string,
    body: T,
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

  update = async <T extends object>(
    index: string,
    collection: string,
    id: string,
    body: T
  ) => {
    const response = await this.requestHandler.sendRequest<boolean>({
      controller: "document",
      action: "update",
      index,
      collection,
      _id: id,
      body,
    });

    return response.result;
  };

  get = async <T extends object = object>(
    index: string,
    collection: string,
    id: string
  ) => {
    const response = await this.requestHandler.sendRequest<{
      _id: string;
      _source: T;
    }>({
      controller: "document",
      action: "get",
      index,
      collection,
      _id: id,
    });

    return response.result;
  };

  exists = async (index: string, collection: string, id: string) => {
    const response = await this.requestHandler.sendRequest<boolean>({
      controller: "document",
      action: "exists",
      index,
      collection,
      _id: id,
    });

    return response.result;
  };
}

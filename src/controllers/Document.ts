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

  mCreate = async <T extends object>(
    index: string,
    collection: string,
    documents: Array<{ _id?: string; body: T }>,
    options: mCreateOpts = {}
  ) => {
    const response = await this.requestHandler.sendRequest<mCreateResult<T>>({
      controller: "document",
      action: "mCreate",
      index,
      collection,
      body: { documents },
      ...options,
    });

    return response.result;
  };

  update = async <T extends object, Opts extends UpdateUpsertOpts>(
    index: string,
    collection: string,
    id: string,
    body: Partial<T>,
    opts?: Opts
  ) => {
    const response = await this.requestHandler.sendRequest<
      UpdateUpsertResult<T, Opts>
    >({
      controller: "document",
      action: "update",
      index,
      collection,
      _id: id,
      body,
      ...opts,
    });

    return response.result;
  };

  upsert = async <T extends object, Opts extends UpdateUpsertOpts>(
    index: string,
    collection: string,
    _id: string,
    body: { changes: Partial<T>; default?: Partial<T> },
    opts?: Opts
  ) => {
    const response = await this.requestHandler.sendRequest<
      UpdateUpsertResult<T, Opts>
    >({
      controller: "document",
      action: "upsert",
      index,
      collection,
      _id,
      body,
      ...opts,
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

  delete = async (index: string, collection: string, id: string) => {
    const response = await this.requestHandler.sendRequest<{ _id: string }>({
      controller: "document",
      action: "delete",
      index,
      collection,
      _id: id,
    });

    return response.result._id;
  };

  deleteByQuery = async <T extends object, Opts extends DeleteByQueryOpts>(
    index: string,
    collection: string,
    query = {},
    options?: Opts
  ) => {
    const response = await this.requestHandler.sendRequest<
      DeleteByQueryResult<T, Opts>
    >({
      controller: "document",
      action: "deleteByQuery",
      index,
      collection,
      body: { query },
      ...options,
    });

    return response.result.documents;
  };

  search = async <T extends object = object>(
    index: string,
    collection: string,
    body: SearchBody,
    options: SearchOptions = {}
  ) => {
    const response = await this.requestHandler.sendRequest<SearchResult<T>>({
      controller: "document",
      action: "search",
      index,
      collection,
      body,
      ...options,
    });

    return response.result;
  };
}

type SearchBody = {
  query?: object;
  sort?: object;
  aggregations?: object;
};

type SearchOptions = {
  from?: number;
  size?: number;
  scroll?: string;
  lang?: string;
  verb?: string;
};

type SearchResult<T> = {
  total: number;
  hits: Array<{
    _id: string;
    index: string;
    collection: string;
    _score: number;
    _source: T;
    highlight?: object;
    inner_hits?: object;
  }>;
  scrollId?: string;
  aggregations?: object;
  remaining?: number;
};

type DeleteByQueryOpts = {
  silent?: boolean;
  lang?: "elasticsearch" | "koncorde";
  source?: boolean;
};

type DeleteByQueryResult<T extends object, Opts extends DeleteByQueryOpts> = {
  documents: Array<
    { _id: string } & (Opts["source"] extends true ? { source: T } : {})
  >;
};

type mCreateOpts = {
  silent?: boolean;
  strict?: boolean;
};

type UpdateUpsertOpts = {
  /** If set to `wait_for`, Kuzzle will not respond until the update is indexed. */
  refresh?: "wait_for" | "false";
  /**
   * Conflicts may occurs if the same document gets updated multiple times within a short timespan, in a database cluster. You can set the retryOnConflict optional argument (with a retry count), to tell Kuzzle to retry the failing updates the specified amount of times before rejecting the request with an error.
   */
  retryOnConflict?: number;
  /** If set to `true` Kuzzle will return the entire updated document body in the response. */
  source?: boolean;
  /** If set, then Kuzzle will not generate notifications */
  silent?: boolean;
};

type UpdateUpsertResult<T extends object, Opts extends UpdateUpsertOpts> = {
  id: string;
  /** Updated document version */
  _version: number;
  /** If `true`, a new document was created, otherwise the document existed and was updated */
  created: boolean;
} & (Opts["source"] extends true
  ? {
      /** Actualized document content */
      _source: T;
    }
  : {});

export type mCreateResult<T extends object> = {
  /**
   * Array of succeeded operations
   */
  successes: Array<{
    /**
     * Document unique identifier
     */
    _id: string;

    /**
     * Document content
     */
    _source: T;

    /**
     * Document version number
     */
    _version: number;

    /**
     * `true` if document is created
     */
    created: boolean;
  }>;

  /**
   * Arrays of errored operations
   */
  errors: mResponseErrors<T>;
};

type mResponseErrors<T extends object> = Array<{
  /**
   * Original document that caused the error
   */
  document: {
    _id: string;
    _source: T;
  };

  /**
   * HTTP error status code
   */
  status: number;

  /**
   * Human readable reason
   */
  reason: string;
}>;

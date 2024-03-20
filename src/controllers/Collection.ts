import { Controller } from "../Controller";

export class Collection extends Controller {
	exists = async (index: string, collection: string) => {
		const response = await this.requestHandler.sendRequest<boolean>({
			controller: "collection",
			action: "exists",
			index,
			collection,
		});

		return response.result;
	};

	create = async (index: string, collection: string, mapping?: object) => {
		const response = await this.requestHandler.sendRequest<boolean>({
			controller: "collection",
			action: "create",
			index,
			collection,
			body: mapping,
		});

		return response.result;
	};
}

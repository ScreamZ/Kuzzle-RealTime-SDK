import { Controller } from "../Controller";

export class Index extends Controller {
	exists = async (index: string) => {
		const response = await this.requestHandler.sendRequest<boolean>({
			controller: "index",
			action: "exists",
			index,
		});

		return response.result;
	};

	create = async (index: string) => {
		const response = await this.requestHandler.sendRequest<boolean>({
			controller: "index",
			action: "create",
			index,
		});

		return response.result;
	};
}

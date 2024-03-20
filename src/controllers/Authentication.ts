import { Controller } from "../Controller";

export class Authentication extends Controller {
	getCurrentUser = async <T>() => {
		const res = await this.requestHandler.sendRequest<GetCurrentUserResult<T>>({
			controller: "auth",
			action: "getCurrentUser",
		});

		return res.result;
	};

	/**
	 * Send login request to kuzzle with credentials
	 *
	 * @param strategy Name of the strategy to use
	 * @param credentials Credentials object for the strategy
	 * @param expiresIn Expiration time in ms library format. (e.g. "2h")
	 *
	 * @returns The encrypted JSON Web Token
	 */
	login = async (
		strategy: string,
		credentials: Record<string, unknown>,
		expiresIn?: string | number,
	): Promise<GetLoginResult> => {
		const res = await this.requestHandler.sendRequest<GetLoginResult>({
			controller: "auth",
			action: "login",
			body: credentials,
			strategy,
			expiresIn,
		});

		// Set the token in the SDK instance
		if (res.result.jwt) this.requestHandler.setAuthToken(res.result.jwt);

		return res.result;
	};

	/**
	 * Revokes the provided authentication token if it's not an API key.
	 * If there were any, real-time subscriptions are cancelled.
	 *
	 * Also remove the token from the SDK instance.
	 *
	 * @param global if true, also revokes all other active sessions that aren't using an API key, instead of just the current one (default: false)
	 */
	logout = async (global?: boolean) => {
		await this.requestHandler.sendRequest({
			controller: "auth",
			action: "logout",
			global,
		});

		this.requestHandler.setAuthToken(undefined);
	};
}

type GetLoginResult = {
	_id: string;
	jwt: string;
	expiresAt: number;
	ttl: number;
};

type GetCurrentUserResult<T> = {
	_id: string;
	strategies: string[];
	_source: { profileIds: string[] } & T;
};

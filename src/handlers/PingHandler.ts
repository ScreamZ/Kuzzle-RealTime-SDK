import type { WebSocket } from "partysocket";

import type { KuzzleMessage, KuzzlePingMessage } from "../common";

export class PingHandler {
	private pingIntervalRef: NodeJS.Timeout | null = null;

	constructor(private readonly socket: WebSocket) {}

	handleMessage(
		message: KuzzleMessage<unknown> | KuzzlePingMessage,
	): message is KuzzlePingMessage {
		if ("p" in message) {
			if (message.p === 1) this.socket.send(JSON.stringify({ p: 2 })); // Respond to request
			return true;
		}
		return false;
	}

	initPing(frequency = 5000) {
		this.stopPing();
		this.pingIntervalRef = setInterval(
			() => this.socket.send(JSON.stringify({ p: 1 })),
			frequency,
		);
	}

	stopPing() {
		this.pingIntervalRef && clearInterval(this.pingIntervalRef);
	}
}

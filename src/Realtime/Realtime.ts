import type { Logger } from "../Logger";
import type {
	KuzzleDocumentNotification,
	KuzzleMessage,
	KuzzleNotificationMessage,
	KuzzlePresenceNotification,
	MessageHandler,
	NotificationCallback,
	SubscriptionScopeInterest,
	SubscriptionUserInterest,
} from "../common";
import type { RequestHandler } from "../handlers/RequestHandler";
import { type ChannelInterest, Room } from "./Room";

type SubscriptionResult = {
	/**
	 * Koncorde room ID
	 */
	roomId: string;
	/**
	 * Channel ID is in the form of "roomID-channelIDHash"
	 * Depends on users/scope/cluster property
	 */
	channel: string;
};

type DocumentSubscriptionArgs = {
	index: string;
	collection: string;
	scope: SubscriptionScopeInterest;
};

type PresenceSubscriptionArgs = {
	index: string;
	collection: string;
	users: SubscriptionUserInterest;
};

export class Realtime implements MessageHandler<unknown> {
	private readonly roomsMap = new Map<string, Room>();
	/**
	 * Used to restore subscriptions in case of a reconnection.
	 */
	private readonly subscriptionChannelPayloads = new Map<string, object>();

	constructor(
		private requestHandler: RequestHandler,
		private readonly sdkInstanceId: string,
		private logger: Logger,
	) {}

	/**
	 * Subscribe to document notifications. Those could be ephemeral or persistent.
	 *
	 * @param filters Koncorde filters
	 * @param cb Called when a notification is received and match filter
	 */
	public subscribeToDocumentNotifications = <T extends Record<string, unknown>>(
		args: DocumentSubscriptionArgs,
		filters: Record<string, unknown>,
		cb: (notification: KuzzleDocumentNotification<T>) => void,
		/**
		 * Whether or not receive notification triggered by this instance of the SDK.
		 * If you managed auto-update locally of your document and this local update auto-trigger another remote doc update/ event publish (such as with observer or proxy).
		 * This might make a deadly loop and you should disable this
		 */
		interestInSelfNotifications = true,
	): Promise<UnsubscribeFn> => {
		const payload = {
			...args,
			controller: "realtime",
			action: "subscribe",
			body: filters,
			users: "none",
		};

		// Register callback for notifications.
		return this.registerSubscriptionCallback(
			payload,
			cb as NotificationCallback,
			interestInSelfNotifications,
		);
	};

	/**
	 * Subscribe to presence notification, when user enter/leave same room.
	 *
	 * @param filters Koncorde filters
	 * @param cb Called when a notification is received and match filter
	 */
	public subscribeToPresenceNotifications = <T extends object>(
		args: PresenceSubscriptionArgs,
		filters: Record<string, unknown>,
		cb: (notification: KuzzlePresenceNotification<T>) => void,
		/**
		 * Whether or not receive notification triggered by this instance of the SDK.
		 * If you managed auto-update locally of your document and this local update auto-trigger another remote doc update/ event publish (such as with observer or proxy).
		 * This might make a deadly loop and you should disable this
		 */
		interestInSelfNotifications = true,
	): Promise<UnsubscribeFn> => {
		const payload = {
			...args,
			controller: "realtime",
			action: "subscribe",
			body: filters,
			scope: "none", // No document in this callback.
		};

		// Register callback for notifications.
		return this.registerSubscriptionCallback(
			payload,
			cb as NotificationCallback,
			interestInSelfNotifications,
		);
	};

	/**
	 * Send ephemeral notification. This is a one-time notification, not persisted in storage.
	 *
	 * Handled in the same way as {@link subscribeToDocumentNotifications} but with a slightly different payload.
	 */
	public sendEphemeralNotification = (
		args: { index: string; collection: string },
		payload: object,
	) => {
		return this.requestHandler.sendRequest({
			...args,
			controller: "realtime",
			action: "publish",
			body: payload,
		});
	};

	// Internal API
	getPublicAPI = () => ({
		subscribeToDocumentNotifications: this.subscribeToDocumentNotifications,
		subscribeToPresenceNotifications: this.subscribeToPresenceNotifications,
		sendEphemeralNotification: this.sendEphemeralNotification,
	});

	handleMessage(data: KuzzleMessage): boolean {
		const channelID: string | undefined = data.room;
		const roomID = channelID ? channelID.split("-")[0] : null; // Channel ID is in the form of "roomID-channelIDHash"

		const matchingSubscriptionRoom = roomID ? this.roomsMap.get(roomID) : null;

		if (channelID && matchingSubscriptionRoom) {
			this.logger.log(
				"Received notification for room",
				roomID,
				"channel",
				channelID,
				JSON.stringify(data),
			);
			matchingSubscriptionRoom.notifyChannel(
				channelID,
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				data as KuzzleNotificationMessage<any>,
			);
			return true;
		}

		return false;
	}

	/**
	 * Restore any previous subscriptions in case of a reconnection.
	 */
	restoreSubscriptions = async () => {
		if (this.subscriptionChannelPayloads.size <= 0) return;

		await Promise.all(
			Array.from(this.subscriptionChannelPayloads).map(
				([channelID, requestPayload]) => {
					this.logger.log("Restoring subscriptions for room", channelID);
					return this.requestHandler.sendRequest(requestPayload);
				},
			),
		);
		this.logger.log("Subscriptions restored.");
	};

	private async registerSubscriptionCallback(
		payload: object,
		cb: NotificationCallback,
		interestedInSelfNotifications: boolean,
	): Promise<UnsubscribeFn> {
		const response =
			await this.requestHandler.sendRequest<SubscriptionResult>(payload);
		if (response.error)
			throw new Error(`${response.error.id} - ${response.error.message}`);
		const { roomId: roomID, channel: channelID } = response.result;

		// Add payload to restore subscriptions in case of a reconnection.
		this.subscriptionChannelPayloads.set(channelID, payload);

		// Create room if not exists
		if (!this.roomsMap.has(roomID))
			this.roomsMap.set(roomID, new Room(roomID, this.sdkInstanceId));

		const room = this.roomsMap.get(roomID)!;

		// Update channels for room
		const channelInterest: ChannelInterest = {
			interestedInSelfNotifications,
			notify: cb,
		};

		room.addObserver(channelID, channelInterest); // Add channel to room

		this.logger.log("New subscription", room.infos());

		return async () => {
			// Detach observer and update room
			room.removeObserver(channelID, channelInterest);

			// Remove handler for restoring subscriptions in case of a reconnection.
			if (!room.hasRemainingInterestForChannel(channelID))
				this.subscriptionChannelPayloads.delete(channelID);

			// Unsubscribe from room if no more interest.
			if (!room.hasRemainingInterestForRoom()) {
				this.logger.log(
					"Unsubscribing from room",
					roomID,
					"because no more interest.",
				);
				await this.requestHandler.sendRequest<{ roomId: string }>({
					controller: "realtime",
					action: "unsubscribe",
					body: { roomId: roomID },
				});
			}

			return room.infos().total;
		};
	}
}

/**
 * Returns the number of remaining subscriptions for the room.
 */
type UnsubscribeFn = () => Promise<number>;

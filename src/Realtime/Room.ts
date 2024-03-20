import type {
	KuzzleDocumentNotification,
	KuzzleNotificationMessage,
	KuzzlePresenceNotification,
	NotificationCallback,
} from "../common";

export type ChannelInterest = {
	interestedInSelfNotifications: boolean;
	notify: NotificationCallback;
};

export class Room {
	private readonly channelsMap = new Map<string, Set<ChannelInterest>>();

	constructor(
		private readonly id: string,
		private readonly sdkInstanceId: string,
	) {}

	notifyChannel(
		channel: string,
		message: KuzzleNotificationMessage<{
			_id: string;
			_source: unknown;
			count?: number;
		}>,
	) {
		// We just skip silently because this only happens if the at some point the user subscribed to a channel like presence notification, or document notification and then unsubscribed from it. Resulting in a notification being sent to a channel that is not registered anymore. And kuzzle only allows to unsubscribe from a room, not from a channel. {@link https://docs.kuzzle.io/core/2/api/controllers/realtime/unsubscribe/}
		if (!this.channelsMap.has(channel)) return;

		const isFromSelf = this.sdkInstanceId === message.volatile?.sdkInstanceId;

		switch (message.type) {
			case "TokenExpired":
				//TODO: Handled in AuthenticationHandler, we should not receive this.
				// OR TODO handle it here.
				break;
			case "document": {
				const mapped: KuzzleDocumentNotification = {
					scope: message.scope!,
					payload: message.result,
					timestamp: message.timestamp,
					event: message.event,
					type: message.event === "publish" ? "ephemeral" : "document",
				};
				for (const {
					interestedInSelfNotifications,
					notify,
				} of this.channelsMap.get(channel)!) {
					(interestedInSelfNotifications || !isFromSelf) && notify(mapped);
				}

				break;
			}
			case "user": {
				const mapped: KuzzlePresenceNotification = {
					current_users_in_room: message.result.count!,
					scope: message.user!,
					timestamp: message.timestamp,
					volatile: message.volatile,
				};
				for (const {
					interestedInSelfNotifications,
					notify,
				} of this.channelsMap.get(channel)!) {
					(interestedInSelfNotifications || !isFromSelf) && notify(mapped);
				}
			}
		}
	}

	infos() {
		return {
			roomID: this.id,
			total: Array.from(this.channelsMap.values()).reduce(
				(acc, channelSet) => acc + channelSet.size,
				0,
			),
			perChannel: Array.from(this.channelsMap).reduce(
				(acc, [channel, channelSet]) =>
					Object.assign(acc, {
						[channel]: channelSet.size,
					}),
				{},
			),
		};
	}

	/**
	 * Return true if there is still some interest in this room. (i.e. at least one channel is still registered with a callback)
	 */
	hasRemainingInterestForRoom() {
		return this.channelsMap.size > 0;
	}

	hasRemainingInterestForChannel(channel: string) {
		return (
			this.channelsMap.has(channel) && this.channelsMap.get(channel)!.size > 0
		);
	}

	addObserver(forChannelID: string, channelInterest: ChannelInterest) {
		if (!this.channelsMap.has(forChannelID))
			this.channelsMap.set(forChannelID, new Set());

		this.channelsMap.get(forChannelID)!.add(channelInterest);
	}

	removeObserver(channel: string, channelInterest: ChannelInterest) {
		this.channelsMap.get(channel)!.delete(channelInterest);
		if (this.channelsMap.get(channel)!.size === 0) {
			this.channelsMap.delete(channel);
		}
	}
}

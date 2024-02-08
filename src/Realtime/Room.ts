import {
  KuzzleDocumentNotification,
  KuzzleNotificationMessage,
  NotificationCallback,
} from "../common";

export class Room {
  private readonly channelsMap = new Map<string, Set<NotificationCallback>>();

  constructor(private readonly id: string) {}

  notifyChannel(
    channel: string,
    message: KuzzleNotificationMessage<{ _id: string; _source: unknown }>
  ) {
    // We just skip silently because this only happens if the at some point the user subscribed to a channel like presence notification, or document notification and then unsubscribed from it. Resulting in a notification being sent to a channel that is not registered anymore. And kuzzle only allows to unsubscribe from a room, not from a channel. {@link https://docs.kuzzle.io/core/2/api/controllers/realtime/unsubscribe/}
    if (!this.channelsMap.has(channel)) return;

    const mapped: KuzzleDocumentNotification = {
      scope: message.scope,
      payload: message.result,
      timestamp: message.timestamp,
      type: message.action === "publish" ? "ephemeral" : "document",
    };

    this.channelsMap.get(channel)!.forEach((notify) => notify(mapped));
  }

  infos() {
    return {
      roomID: this.id,
      total: Array.from(this.channelsMap.values()).reduce(
        (acc, channelSet) => acc + channelSet.size,
        0
      ),
      perChannel: Array.from(this.channelsMap).reduce(
        (acc, [channel, channelSet]) => ({
          ...acc,
          [channel]: channelSet.size,
        }),
        {}
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

  addObserver(forChannelID: string, withCb: NotificationCallback) {
    if (!this.channelsMap.has(forChannelID))
      this.channelsMap.set(forChannelID, new Set());
    this.channelsMap.get(forChannelID)!.add(withCb);
  }

  removeObserver(channel: string, cb: NotificationCallback) {
    this.channelsMap.get(channel)!.delete(cb);
    if (this.channelsMap.get(channel)!.size === 0) {
      this.channelsMap.delete(channel);
    }
  }
}

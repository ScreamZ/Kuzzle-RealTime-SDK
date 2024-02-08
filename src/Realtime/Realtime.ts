import {
  KuzzleDocumentNotification,
  KuzzleMessage,
  KuzzleNotificationMessage,
  MessageHandler,
  NotificationCallback,
  SubscriptionScopeInterest,
  SubscriptionUserInterest,
} from "../common";
import { RequestHandler } from "../RequestHandler";
import { Room } from "./Room";

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

export class Realtime implements MessageHandler<unknown> {
  private readonly roomsMap = new Map<string, Room>();
  /**
   * Used to restore subscriptions in case of a reconnection.
   */
  private readonly subscriptionChannelPayloads = new Map<string, object>();

  constructor(private requestHandler: RequestHandler) {}

  /**
   * Subscribe to document notifications. Those could be ephemeral or persistent.
   *
   * @param filters Koncorde filters
   * @param cb Called when a notification is received and match filter
   */
  public subscribeToDocumentNotifications = <T extends Object>(
    args: {
      index: string;
      collection: string;
      scope: SubscriptionScopeInterest;
    },
    filters = {},
    cb: (notification: KuzzleDocumentNotification<T>) => void
  ) => {
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
      cb as NotificationCallback
    );
  };

  /**
   * Subscribe to presence notification, when user enter/leave same room.
   *
   * @param filters Koncorde filters
   * @param cb Called when a notification is received and match filter
   */
  public subscribeToPresenceNotifications = (
    args: {
      index: string;
      collection: string;
      users: SubscriptionUserInterest;
    },
    filters = {},
    cb: (notification: unknown) => void
  ) => {
    const payload = {
      ...args,
      controller: "realtime",
      action: "subscribe",
      body: filters,
      scope: "none", // No document in this callback.
    };

    // Register callback for notifications.
    return this.registerSubscriptionCallback(payload, cb);
  };

  /**
   * Send ephemeral notification. This is a one-time notification, not persisted in storage.
   *
   * Handled in the same way as {@link subscribeToDocumentNotifications} but with a slightly different payload.
   */
  public sendEphemeralNotification = (
    args: { index: string; collection: string },
    payload: object
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
      matchingSubscriptionRoom.notifyChannel(
        channelID,
        data as KuzzleNotificationMessage<any>
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
          console.log("Restoring subscriptions for room", channelID);
          return this.requestHandler.sendRequest(requestPayload);
        }
      )
    );
    console.log("Subscriptions restored.");
  };

  private async registerSubscriptionCallback(
    payload: object,
    cb: NotificationCallback
  ) {
    const response = await this.requestHandler.sendRequest<SubscriptionResult>(
      payload
    );
    if (response.error)
      throw new Error(`${response.error.id} - ${response.error.message}`);
    const { roomId: roomID, channel: channelID } = response.result;

    // Add payload to restore subscriptions in case of a reconnection.
    this.subscriptionChannelPayloads.set(channelID, payload);

    // Create room if not exists
    if (!this.roomsMap.has(roomID)) this.roomsMap.set(roomID, new Room(roomID));

    const room = this.roomsMap.get(roomID)!;

    // Update channels for room
    room.addObserver(channelID, cb); // Add channel to room

    console.log("Room", roomID, room.infos());

    return () => {
      // Detach observer and update room
      room.removeObserver(channelID, cb);

      // Remove handler for restoring subscriptions in case of a reconnection.
      if (!room.hasRemainingInterestForChannel(channelID))
        this.subscriptionChannelPayloads.delete(channelID);

      // Unsubscribe from room if no more interest.
      if (!room.hasRemainingInterestForRoom()) {
        console.log(
          "Unsubscribing from room",
          roomID,
          "because no more interest."
        );
        return this.requestHandler.sendRequest({
          controller: "realtime",
          action: "unsubscribe",
          body: { roomId: roomID },
        });
      }
    };
  }
}

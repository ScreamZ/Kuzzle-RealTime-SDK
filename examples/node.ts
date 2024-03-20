import { KuzzleRealtimeSDK } from "../src/KuzzleRealtimeSDK";

const sdk = new KuzzleRealtimeSDK("localhost", {
  authToken: "SomeApiToken",
});

sdk.realtime.subscribeToPresenceNotifications(
  { index: "freakshow", collection: "presence", users: "all" },
  {},
  console.log,
  false
);

sdk.document.update<{ name: string }>("freakshow", "presence", "1", {
  name: "John",
});

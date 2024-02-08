import { KuzzleRealtimeSDK } from "../KuzzleRealtimeSDK";

const aaa = new KuzzleRealtimeSDK("192.168.1.140");
const res = await aaa.requestHandler.sendRequest({
  controller: "server",
  action: "now",
});

console.log(res);

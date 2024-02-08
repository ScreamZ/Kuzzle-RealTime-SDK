import { defineConfig } from "tsup";

var isRelease = process.env.RELEASE ? true : false;

export default defineConfig({
  entry: ["src/KuzzleRealtimeSDK.ts"],
  format: ["esm", "cjs"],
  dts: isRelease,
  sourcemap: !isRelease,
  silent: isRelease,
  clean: true,
  treeshake: isRelease,
});

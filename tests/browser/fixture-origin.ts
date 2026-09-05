const configuredPort = process.env.SHOW_NIGHT_BROWSER_FIXTURE_PORT ?? "4317";
if (!/^\d{4,5}$/.test(configuredPort) || Number(configuredPort) < 1024 || Number(configuredPort) > 65535) {
  throw new Error("SHOW_NIGHT_BROWSER_FIXTURE_PORT must be a local unprivileged TCP port.");
}

export const FIXTURE_PORT = Number(configuredPort);
export const OFFLINE_ORIGIN = `http://127.0.0.1:${FIXTURE_PORT}`;
export const OFFLINE_WEBSOCKET_ORIGIN = `ws://127.0.0.1:${FIXTURE_PORT}`;

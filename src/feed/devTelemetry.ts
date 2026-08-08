export type FeedTelemetryDetails = Record<string, unknown>;

export type FeedTelemetryReporter = (
  event: string,
  details?: FeedTelemetryDetails,
) => void;

const endpoint = '/__fennec/dev-telemetry';
let warnedAboutDelivery = false;

export const reportDevFeedTelemetry: FeedTelemetryReporter = (
  event,
  details = {},
) => {
  if (!import.meta.env.DEV) return;

  const payload = {
    source: 'browser-feed',
    timestamp: new Date().toISOString(),
    event,
    ...details,
  };

  console.debug('[fennec:feed]', payload);
  void fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((error) => {
    if (warnedAboutDelivery) return;
    warnedAboutDelivery = true;
    console.warn(
      '[fennec:feed] Could not forward development telemetry to Vite.',
      error,
    );
  });
};

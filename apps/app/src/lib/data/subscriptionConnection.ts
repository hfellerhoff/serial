let connected = false;

export function isDataSubscriptionConnected() {
  return connected;
}

export function setDataSubscriptionConnected(nextConnected: boolean) {
  connected = nextConnected;
}

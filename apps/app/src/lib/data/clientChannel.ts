const CLIENT_ID_RANDOM_RADIX = 36;

let dataSubscriptionClientId: string | null = null;

function createDataSubscriptionClientId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const randomPart = Math.random().toString(CLIENT_ID_RANDOM_RADIX).slice(2);
  return `${Date.now().toString(CLIENT_ID_RANDOM_RADIX)}-${randomPart}`;
}

export function getDataSubscriptionClientId() {
  dataSubscriptionClientId ??= createDataSubscriptionClientId();
  return dataSubscriptionClientId;
}

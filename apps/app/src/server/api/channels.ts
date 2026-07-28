export function getUserChannel(userId: string): string {
  return `user:${userId}`;
}

export function getClientChannel(userId: string, clientId: string): string {
  return `${getUserChannel(userId)}:client:${clientId}`;
}

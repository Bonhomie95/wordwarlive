// Lightweight online-presence tracker. Used for:
//   - Friend list "is online" badges
//   - Private match invites — we need to find the host's live socket
//
// In-memory only. For multi-server deployments this should be Redis. For
// a single-node MVP this is fine.

const userToSocket = new Map<string, string>();
const socketToUser = new Map<string, string>();

export function markOnline(userId: string, socketId: string): void {
    // If user had a stale socket, replace it.
    const oldSocket = userToSocket.get(userId);
    if (oldSocket) socketToUser.delete(oldSocket);

    userToSocket.set(userId, socketId);
    socketToUser.set(socketId, userId);
}

export function markOffline(socketId: string): void {
    const userId = socketToUser.get(socketId);
    if (!userId) return;
    socketToUser.delete(socketId);
    // Only clear userToSocket if this socket is the one mapped to that user
    // (might have already been replaced by a fresh connection).
    if (userToSocket.get(userId) === socketId) {
        userToSocket.delete(userId);
    }
}

export function socketIdFor(userId: string): string | null {
    return userToSocket.get(userId) ?? null;
}

export function isOnline(userId: string): boolean {
    return userToSocket.has(userId);
}

export function onlineUserIds(): string[] {
    return [...userToSocket.keys()];
}

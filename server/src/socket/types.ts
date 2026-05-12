// Server-side re-export of the wire types. The mobile app has its own copy
// at mobile/src/types/index.ts — keep them in sync when the protocol changes.

export type {
    Tile,
    PowerUp,
    PublicUser,
    ClientToServerEvents,
    ServerToClientEvents,
    QueueStatus,
    MatchFound,
    MatchStart,
    GuessAck,
    GuessBroadcast,
    MatchOver,
} from '../types/index.js';

// Friends + private matches.
//
//   POST   /api/friends/code               — generate a shareable invite code
//   POST   /api/friends/redeem             — redeem someone else's code
//   GET    /api/friends                    — list your friends
//   DELETE /api/friends/:friendId          — remove a friend
//   POST   /api/private-match/code         — create a private match invite
//
// Joining the private match is over the socket via 'private_join'.

import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { isOnline } from '../socket/presence.js';
import {
    createFriendInviteCode,
    createPrivateMatchCode,
    listFriends,
    redeemFriendInviteCode,
    removeFriend,
} from '../services/friendsService.js';

export const friendsRouter = Router();

friendsRouter.post('/friends/code', requireAuth, async (req, res) => {
    const code = await createFriendInviteCode(req.session!.userId);
    res.json({ code });
});

friendsRouter.post('/friends/redeem', requireAuth, async (req, res) => {
    const code = String(req.body?.code ?? '');
    if (!code) return res.status(400).json({ error: 'Missing code' });
    const result = await redeemFriendInviteCode(code, req.session!.userId);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
});

friendsRouter.get('/friends', requireAuth, async (req, res) => {
    const friends = await listFriends(req.session!.userId);
    // listFriends returns isOnline:false as a placeholder — fill it in
    // here from the live socket presence map.
    res.json({
        friends: friends.map((f) => ({ ...f, isOnline: isOnline(f.userId) })),
    });
});

friendsRouter.delete('/friends/:friendId', requireAuth, async (req, res) => {
    await removeFriend(req.session!.userId, req.params.friendId!);
    res.json({ ok: true });
});

friendsRouter.post('/private-match/code', requireAuth, async (req, res) => {
    const wordLength = req.body?.wordLength
        ? Number(req.body.wordLength)
        : null;
    if (wordLength !== null && (wordLength < 4 || wordLength > 10)) {
        return res.status(400).json({ error: 'wordLength must be 4-10' });
    }
    const code = await createPrivateMatchCode(req.session!.userId, wordLength);
    res.json({ code });
});

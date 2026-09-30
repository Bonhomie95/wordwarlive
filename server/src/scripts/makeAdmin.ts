// Promote (or demote) a user to admin from the command line.
//
//   npm run make-admin -- someone@example.com          # grant
//   npm run make-admin -- someone@example.com --revoke  # revoke
//
// The user must already exist (they need to have signed up with email auth so
// they have a password to log in to the admin panel with).

import { col, connectMongo, closeMongo } from '../db/mongo.js';

async function main() {
    const args = process.argv.slice(2);
    const email = args.find((a) => !a.startsWith('--'));
    const revoke = args.includes('--revoke');
    if (!email) {
        console.error('Usage: npm run make-admin -- <email> [--revoke]');
        process.exit(1);
    }
    await connectMongo();
    const u = await col('users').findOneAndUpdate(
        { email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        { $set: { is_admin: !revoke, is_super_admin: !revoke, updated_at: new Date() } },
        { returnDocument: 'after', projection: { id: 1, username: 1, email: 1, auth_provider: 1, is_admin: 1 } }
    );
    if (!u) {
        console.error(`No user found with email ${email}. They must sign up first.`);
        process.exit(1);
    }
    if (u.auth_provider !== 'email') {
        console.warn(
            `⚠  ${email} signed up via "${u.auth_provider}", not email — they have no password and cannot log into the admin panel. Have them create an email/password account.`
        );
    }
    console.log(`✅ ${u.username} <${u.email}> is_admin=${u.is_admin}`);
    await closeMongo();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

// Promote (or demote) a user to admin from the command line.
//
//   npm run make-admin -- someone@example.com          # grant
//   npm run make-admin -- someone@example.com --revoke  # revoke
//
// The user must already exist (they need to have signed up with email auth so
// they have a password to log in to the admin panel with).

import { pool } from '../db/pool.js';

async function main() {
    const args = process.argv.slice(2);
    const email = args.find((a) => !a.startsWith('--'));
    const revoke = args.includes('--revoke');
    if (!email) {
        console.error('Usage: npm run make-admin -- <email> [--revoke]');
        process.exit(1);
    }
    const res = await pool.query(
        `UPDATE users SET is_admin = $1, updated_at = now()
         WHERE lower(email) = lower($2)
         RETURNING id, username, email, auth_provider, is_admin`,
        [!revoke, email]
    );
    if (res.rowCount === 0) {
        console.error(`No user found with email ${email}. They must sign up first.`);
        process.exit(1);
    }
    const u = res.rows[0];
    if (u.auth_provider !== 'email') {
        console.warn(
            `⚠  ${email} signed up via "${u.auth_provider}", not email — they have no password and cannot log into the admin panel. Have them create an email/password account.`
        );
    }
    console.log(`✅ ${u.username} <${u.email}> is_admin=${u.is_admin}`);
    await pool.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

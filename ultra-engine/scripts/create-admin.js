// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Create Admin User                        ║
// ║  Run manually: node scripts/create-admin.js             ║
// ╚══════════════════════════════════════════════════════════╝

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const bcrypt = require('bcryptjs');
const db = require('../src/db');

async function createAdmin() {
  const email = process.env['ADMIN_EMAIL'];
  const cred = process.env['ADMIN_' + 'PASSWORD'];

  if (!email || !cred) {
    console.error('ADMIN_EMAIL and admin credentials must be set in .env');
    process.exit(1);
  }

  const existing = await db.queryOne('SELECT id FROM auth_users WHERE email = $1', [email]);
  if (existing) {
    console.log(`Admin already exists: ${email} (id: ${existing.id})`);
    process.exit(0);
  }

  const hash = await bcrypt.hash(cred, 10);
  const user = await db.queryOne(
    'INSERT INTO auth_users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
    [email, hash]
  );

  console.log(`Admin created: ${user.email} (id: ${user.id})`);
  process.exit(0);
}

createAdmin().catch(err => {
  console.error('Failed to create admin:', err.message);
  process.exit(1);
});

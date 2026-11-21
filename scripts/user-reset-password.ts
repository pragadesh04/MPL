/**
 * npm run user:reset-password -- <username>
 *
 * PHASE 0 STUB. Lane A (A8) implements it: create a one-time `password_resets` row (valid 30 min,
 * token stored hashed, created_by = null for the operator) and print the reset link built from
 * PUBLIC_APP_URL (PLAN §2.5). The npm script entry already exists so package.json stays frozen.
 */
import './load-env';

const username = process.argv[2];
if (!username) {
  console.error('Usage: npm run user:reset-password -- <username>');
  process.exit(1);
}
console.error(`user:reset-password is not implemented yet (Lane A, A8). Username: ${username}`);
process.exit(1);

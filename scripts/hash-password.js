// Gera o hash de uma senha para colar em src/users.js
// Uso: npm run hash-password -- <senha>
const crypto = require('crypto');

const password = process.argv[2];
if (!password) {
  console.error('uso: npm run hash-password -- <senha>');
  process.exit(1);
}
const salt = crypto.randomBytes(16).toString('hex');
console.log(`${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`);

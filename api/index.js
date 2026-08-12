require('dotenv').config();

console.log('[cold-start] api/index.js v3 loading (dialectModule fix)');

const app = require('../app');

module.exports = app;
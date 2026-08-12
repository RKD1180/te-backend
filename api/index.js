require('dotenv').config();

const pg = require('pg');

console.log('[cold-start] api/index.js v5 loading (uuid ESM fix)');

const app = require('../app');

module.exports = app;
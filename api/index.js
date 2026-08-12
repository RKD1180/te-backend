require('dotenv').config();

const pg = require('pg');

console.log('[cold-start] api/index.js v4 loading (pg explicitly required)');

const app = require('../app');

module.exports = app;
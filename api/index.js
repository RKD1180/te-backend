require('dotenv').config();

const app = require('../app');

// Run pending migrations on cold start so a fresh database is usable
// immediately after deploy. Safe to run repeatedly (tracked in the
// `migrations` table); failures are swallowed here so the API still
// boots — run `npm run migrate` manually if you prefer explicit setup.
const { sequelize } = require('../models');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const runMigrations = async () => {
  try {
    const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        hash VARCHAR(64) NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      );
    `);

    const [executed] = await sequelize.query('SELECT name FROM migrations');
    const executedNames = executed.map((r) => r.name);

    if (!fs.existsSync(MIGRATIONS_DIR)) {
      return;
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const pending = files.filter((f) => !executedNames.includes(f));

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const hash = crypto.createHash('sha256').update(sql).digest('hex');

      await sequelize.query(sql);
      await sequelize.query(
        'INSERT INTO migrations (name, hash) VALUES (:name, :hash)',
        { replacements: { name: file, hash } }
      );
      console.log(`✓ ${file}`);
    }
  } catch (error) {
    console.error('Migration skipped on cold start:', error.message);
  }
};

sequelize
  .authenticate()
  .then(() => runMigrations())
  .catch((error) => console.error('DB connection failed on cold start:', error.message));

module.exports = app;
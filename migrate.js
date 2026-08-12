const { sequelize } = require('./models');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const ensureMigrationTable = async () => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      hash VARCHAR(64) NOT NULL,
      executed_at TIMESTAMP DEFAULT NOW()
    );
  `);
};

const getExecutedMigrations = async () => {
  const [results] = await sequelize.query('SELECT name FROM migrations ORDER BY id');
  return results.map((r) => r.name);
};

const getMigrationFiles = () => {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    return [];
  }
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
};

const calculateHash = (content) => {
  return crypto.createHash('sha256').update(content).digest('hex');
};

const runMigration = async (fileName) => {
  const filePath = path.join(MIGRATIONS_DIR, fileName);
  const sql = fs.readFileSync(filePath, 'utf8');
  const hash = calculateHash(sql);

  console.log(`Running migration: ${fileName}`);
  
  try {
    await sequelize.query(sql);
    await sequelize.query(
      'INSERT INTO migrations (name, hash) VALUES (:name, :hash)',
      { replacements: { name: fileName, hash } }
    );
    console.log(`✓ Completed: ${fileName}`);
  } catch (error) {
    console.error(`✗ Failed: ${fileName}`);
    console.error(error.message);
    throw error;
  }
};

const migrate = async () => {
  try {
    console.log('Starting migrations...\n');
    
    await sequelize.authenticate();
    console.log('Database connected.\n');

    await ensureMigrationTable();
    
    const executed = await getExecutedMigrations();
    const migrationFiles = getMigrationFiles();
    
    const pending = migrationFiles.filter((file) => !executed.includes(file));
    
    if (pending.length === 0) {
      console.log('No pending migrations.');
      process.exit(0);
    }

    console.log(`Found ${pending.length} pending migration(s):`);
    pending.forEach((f) => console.log(`  - ${f}`));
    console.log('');

    for (const file of pending) {
      await runMigration(file);
    }

    console.log('\nAll migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\nMigration failed:', error.message);
    process.exit(1);
  }
};

migrate();

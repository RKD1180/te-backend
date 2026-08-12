const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = require('./app');
const { sequelize } = require('./models');
const { setupSocketIO } = require('./sockets/socketHandler');
const { setSocketIO, startStockRecovery } = require('./services/stockRecovery');

const PORT = process.env.PORT || 3001;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Make io accessible in routes
app.set('io', io);

// Setup Socket.IO
setupSocketIO(io);

// Set Socket.IO for stock recovery service
setSocketIO(io);

const runMigrations = async () => {
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');

  const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

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

  if (pending.length === 0) {
    return;
  }

  console.log(`Running ${pending.length} migration(s)...`);

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
};

const startServer = async () => {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    // Run migrations
    await runMigrations();
    console.log('Migrations completed.');

    // Start stock recovery service
    startStockRecovery();

    // Start server
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`WebSocket server ready`);
      console.log(`Stock recovery service started`);
    });
  } catch (error) {
    console.error('Unable to start server:', error);
    process.exit(1);
  }
};

startServer();

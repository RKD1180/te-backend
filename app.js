const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const dropRoutes = require('./routes/drops');
const reservationRoutes = require('./routes/reservations');
const purchaseRoutes = require('./routes/purchases');
const { authenticate } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/logger');
const { sendResponse } = require('./utils/response');

const app = express();

// CORS: allow multiple origins via comma-separated CORS_ORIGIN env var.
// With credentials enabled, the matching origin must be echoed back exactly
// (a wildcard '*' is not allowed), so we use the origin callback form.
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(origin)) {
      return callback(null, origin || false);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
}));
app.use(express.json());
app.use(requestLogger);

// Public Routes
app.use('/api/auth', authRoutes);

// Protected Routes
app.use('/api/users', authenticate, userRoutes);
app.use('/api/drops', authenticate, dropRoutes);
app.use('/api/reserve', authenticate, reservationRoutes);
app.use('/api/purchase', authenticate, purchaseRoutes);

// Root
app.get('/', (req, res) => {
  sendResponse(res, {
    message: 'Sneaker Drop API is running',
    data: { health: '/api/health', docs: '/README' },
  });
});

// Health check
app.get('/api/health', (req, res) => {
  sendResponse(res, { data: { timestamp: new Date().toISOString() }, message: 'Server is running' });
});

// Error handling
app.use(errorHandler);

module.exports = app;

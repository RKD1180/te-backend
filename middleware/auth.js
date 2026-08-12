const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { sendError } = require('../utils/response');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, { message: 'No token provided', code: 401 });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findByPk(decoded.id);
    if (!user) {
      return sendError(res, { message: 'User not found', code: 401 });
    }

    req.userId = decoded.id;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return sendError(res, { message: 'Token expired', code: 401 });
    }
    if (error.name === 'JsonWebTokenError') {
      return sendError(res, { message: 'Invalid token', code: 401 });
    }
    return sendError(res, { message: 'Authentication failed', code: 500 });
  }
};

module.exports = { authenticate };

const { sendError } = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  if (err.name === 'SequelizeValidationError') {
    return sendError(res, {
      message: 'Validation error',
      code: 400,
      data: err.errors.map((e) => e.message),
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return sendError(res, {
      message: 'Resource already exists',
      code: 409,
      data: err.errors.map((e) => e.message),
    });
  }

  if (err.name === 'SequelizeDatabaseError') {
    return sendError(res, { message: 'Database error', code: 500 });
  }

  sendError(res, {
    message: err.message || 'Internal server error',
    code: err.status || 500,
  });
};

module.exports = errorHandler;

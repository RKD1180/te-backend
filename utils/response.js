const sendResponse = (res, { success = true, message = '', data = null, code = 200 }) => {
  return res.status(code).json({
    success,
    message,
    data,
    code,
  });
};

const sendError = (res, { message = 'Internal server error', code = 500, data = null }) => {
  return res.status(code).json({
    success: false,
    message,
    data,
    code,
  });
};

module.exports = { sendResponse, sendError };

const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { sendResponse, sendError } = require('../utils/response');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

const register = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return sendError(res, { message: 'Username and password are required', code: 400 });
    }

    if (username.length < 3) {
      return sendError(res, { message: 'Username must be at least 3 characters', code: 400 });
    }

    if (password.length < 6) {
      return sendError(res, { message: 'Password must be at least 6 characters', code: 400 });
    }

    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return sendError(res, { message: 'Username already exists', code: 409 });
    }

    const user = await User.create({ username, password });
    const token = generateToken(user.id);

    sendResponse(res, {
      message: 'User registered successfully',
      data: { user: user.toSafeJSON(), token },
      code: 201,
    });
  } catch (error) {
    console.error('Error registering user:', error);
    sendError(res, { message: 'Failed to register user', code: 500 });
  }
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return sendError(res, { message: 'Username and password are required', code: 400 });
    }

    const user = await User.findOne({ where: { username } });
    if (!user) {
      return sendError(res, { message: 'Invalid credentials', code: 401 });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return sendError(res, { message: 'Invalid credentials', code: 401 });
    }

    const token = generateToken(user.id);

    sendResponse(res, {
      message: 'Login successful',
      data: { user: user.toSafeJSON(), token },
    });
  } catch (error) {
    console.error('Error logging in:', error);
    sendError(res, { message: 'Failed to login', code: 500 });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return sendError(res, { message: 'User not found', code: 404 });
    }
    sendResponse(res, { data: user.toSafeJSON() });
  } catch (error) {
    console.error('Error getting user:', error);
    sendError(res, { message: 'Failed to get user', code: 500 });
  }
};

module.exports = { register, login, getMe };

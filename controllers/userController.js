const { User } = require('../models');
const { sendResponse, sendError } = require('../utils/response');

const getUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      order: [['created_at', 'DESC']],
      attributes: { exclude: ['password'] },
    });
    sendResponse(res, { data: users });
  } catch (error) {
    console.error('Error fetching users:', error);
    sendError(res, { message: 'Failed to fetch users', code: 500 });
  }
};

const createUser = async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || username.length < 3) {
      return sendError(res, { message: 'Username must be at least 3 characters', code: 400 });
    }

    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return sendError(res, { message: 'Username already exists', code: 409 });
    }

    const user = await User.create({ username, password: 'default123' });
    sendResponse(res, { message: 'User created successfully', data: user.toSafeJSON(), code: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    sendError(res, { message: 'Failed to create user', code: 500 });
  }
};

module.exports = { getUsers, createUser };

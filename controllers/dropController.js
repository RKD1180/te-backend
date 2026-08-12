const { Drop, Purchase, User } = require('../models');
const { sendResponse, sendError } = require('../utils/response');

const getDrops = async (req, res) => {
  try {
    const drops = await Drop.findAll({
      order: [['created_at', 'DESC'], ['id', 'ASC']],
    });

    const dropsWithPurchases = await Promise.all(
      drops.map(async (drop) => {
        const purchases = await Purchase.findAll({
          where: { drop_id: drop.id },
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'username'],
            },
          ],
          order: [['purchased_at', 'DESC']],
          limit: 3,
        });

        const dropJson = drop.toJSON();
        dropJson.recent_purchases = purchases.map((p) => p.toJSON());
        return dropJson;
      })
    );

    sendResponse(res, { data: dropsWithPurchases });
  } catch (error) {
    console.error('Error fetching drops:', error);
    sendError(res, { message: 'Failed to fetch drops', code: 500 });
  }
};

const getDropById = async (req, res) => {
  try {
    const { id } = req.params;

    const drop = await Drop.findByPk(id);

    if (!drop) {
      return sendError(res, { message: 'Drop not found', code: 404 });
    }

    const purchases = await Purchase.findAll({
      where: { drop_id: id },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username'],
        },
      ],
      order: [['purchased_at', 'DESC']],
      limit: 3,
    });

    const dropJson = drop.toJSON();
    dropJson.recent_purchases = purchases.map((p) => p.toJSON());

    sendResponse(res, { data: dropJson });
  } catch (error) {
    console.error('Error fetching drop:', error);
    sendError(res, { message: 'Failed to fetch drop', code: 500 });
  }
};

const createDrop = async (req, res) => {
  try {
    const { name, price, total_stock, starts_at, ends_at } = req.body;

    if (!name || !price || !total_stock || !starts_at) {
      return sendError(res, { message: 'Missing required fields: name, price, total_stock, starts_at', code: 400 });
    }

    if (price <= 0 || total_stock <= 0) {
      return sendError(res, { message: 'Price and total_stock must be positive numbers', code: 400 });
    }

    const drop = await Drop.create({
      name,
      price,
      total_stock,
      available_stock: total_stock,
      starts_at: new Date(starts_at),
      ends_at: ends_at ? new Date(ends_at) : null,
    });

    sendResponse(res, { message: 'Drop created successfully', data: drop, code: 201 });
  } catch (error) {
    console.error('Error creating drop:', error);
    sendError(res, { message: 'Failed to create drop', code: 500 });
  }
};

module.exports = { getDrops, getDropById, createDrop };

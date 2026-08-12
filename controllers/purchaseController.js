const { sequelize, Reservation, Purchase, User, Drop } = require('../models');
const { sendResponse, sendError } = require('../utils/response');

const purchase = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { reservationId, userId } = req.body;

    if (!reservationId || !userId) {
      await transaction.rollback();
      return sendError(res, { message: 'Missing reservationId or userId', code: 400 });
    }

    const reservation = await Reservation.findByPk(reservationId, { transaction });

    if (!reservation) {
      await transaction.rollback();
      return sendError(res, { message: 'Reservation not found', code: 404 });
    }

    if (reservation.user_id !== userId) {
      await transaction.rollback();
      return sendError(res, { message: 'Reservation does not belong to this user', code: 403 });
    }

    if (reservation.status !== 'active') {
      await transaction.rollback();
      return sendError(res, { message: 'Reservation is no longer active', code: 400 });
    }

    const now = new Date();
    if (new Date(reservation.expires_at) < now) {
      await reservation.update({ status: 'expired' }, { transaction });
      await transaction.rollback();
      return sendError(res, { message: 'Reservation has expired', code: 400 });
    }

    await reservation.update({ status: 'completed' }, { transaction });

    const purchaseRecord = await Purchase.create(
      {
        user_id: userId,
        drop_id: reservation.drop_id,
        reservation_id: reservationId,
        purchased_at: now,
      },
      { transaction }
    );

    await transaction.commit();

    const user = await User.findByPk(userId);
    const drop = await Drop.findByPk(reservation.drop_id);

    const io = req.app.get('io');
    if (io) {
      io.emit('stock-updated', { 
        dropId: reservation.drop_id, 
        availableStock: drop.available_stock 
      });
    }

    sendResponse(res, {
      message: 'Purchase completed successfully',
      data: {
        id: purchaseRecord.id,
        dropName: drop.name,
        purchasedAt: purchaseRecord.purchased_at,
      },
      code: 201,
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error completing purchase:', error);
    sendError(res, { message: 'Failed to complete purchase', code: 500 });
  }
};

module.exports = { purchase };

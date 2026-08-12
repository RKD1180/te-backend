const { sequelize, Drop, Reservation, User } = require('../models');
const { Op } = require('sequelize');
const { sendResponse, sendError } = require('../utils/response');

const reserve = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { dropId, userId } = req.body;

    if (!dropId || !userId) {
      await transaction.rollback();
      return sendError(res, { message: 'Missing dropId or userId', code: 400 });
    }

    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      return sendError(res, { message: 'User not found', code: 404 });
    }

    const [drop] = await sequelize.query(
      'SELECT * FROM drops WHERE id = :dropId FOR UPDATE',
      {
        replacements: { dropId },
        type: sequelize.QueryTypes.SELECT,
        transaction,
      }
    );

    if (!drop) {
      await transaction.rollback();
      return sendError(res, { message: 'Drop not found', code: 404 });
    }

    const now = new Date();
    if (new Date(drop.starts_at) > now) {
      await transaction.rollback();
      return sendError(res, { message: 'Drop has not started yet', code: 400 });
    }

    if (drop.ends_at && new Date(drop.ends_at) < now) {
      await transaction.rollback();
      return sendError(res, { message: 'Drop has ended', code: 400 });
    }

    const existingReservation = await Reservation.findOne({
      where: {
        user_id: userId,
        drop_id: dropId,
        status: 'active',
        expires_at: { [Op.gt]: now },
      },
      transaction,
    });

    if (existingReservation) {
      await transaction.rollback();
      return sendError(res, { message: 'You already have an active reservation for this item', code: 409 });
    }

    if (drop.available_stock <= 0) {
      await transaction.rollback();
      return sendError(res, { message: 'Out of stock', code: 409 });
    }

    await sequelize.query(
      'UPDATE drops SET available_stock = available_stock - 1 WHERE id = :dropId',
      {
        replacements: { dropId },
        type: sequelize.QueryTypes.UPDATE,
        transaction,
      }
    );

    const reservationDuration = parseInt(process.env.RESERVATION_DURATION_SECONDS) || 60;
    const expiresAt = new Date(now.getTime() + reservationDuration * 1000);

    const reservation = await Reservation.create(
      {
        user_id: userId,
        drop_id: dropId,
        expires_at: expiresAt,
        status: 'active',
      },
      { transaction }
    );

    await transaction.commit();

    const updatedDrop = await Drop.findByPk(dropId);
    
    const io = req.app.get('io');
    if (io) {
      io.emit('stock-updated', { 
        dropId, 
        availableStock: updatedDrop.available_stock 
      });
    }

    sendResponse(res, {
      message: 'Item reserved successfully',
      data: { reservation, availableStock: updatedDrop.available_stock },
      code: 201,
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error reserving item:', error);
    sendError(res, { message: 'Failed to reserve item', code: 500 });
  }
};

const cancelReservation = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;

    const reservation = await Reservation.findByPk(id, { transaction });

    if (!reservation) {
      await transaction.rollback();
      return sendError(res, { message: 'Reservation not found', code: 404 });
    }

    if (reservation.status !== 'active') {
      await transaction.rollback();
      return sendError(res, { message: 'Reservation is not active', code: 400 });
    }

    await reservation.update({ status: 'expired' }, { transaction });

    await sequelize.query(
      'UPDATE drops SET available_stock = available_stock + 1 WHERE id = :dropId',
      {
        replacements: { dropId: reservation.drop_id },
        type: sequelize.QueryTypes.UPDATE,
        transaction,
      }
    );

    await transaction.commit();

    const updatedDrop = await Drop.findByPk(reservation.drop_id);
    
    const io = req.app.get('io');
    if (io) {
      io.emit('stock-updated', { 
        dropId: reservation.drop_id, 
        availableStock: updatedDrop.available_stock 
      });
    }

    sendResponse(res, { message: 'Reservation cancelled' });
  } catch (error) {
    await transaction.rollback();
    console.error('Error cancelling reservation:', error);
    sendError(res, { message: 'Failed to cancel reservation', code: 500 });
  }
};

module.exports = { reserve, cancelReservation };

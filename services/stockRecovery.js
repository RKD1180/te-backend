const { sequelize, Drop, Reservation } = require('../models');
const { Op } = require('sequelize');

let io = null;

const setSocketIO = (socketIO) => {
  io = socketIO;
};

const checkExpiredReservations = async () => {
  const transaction = await sequelize.transaction();
  
  try {
    const now = new Date();

    // Find all expired active reservations
    const expiredReservations = await Reservation.findAll({
      where: {
        status: 'active',
        expires_at: { [Op.lt]: now },
      },
      transaction,
    });

    if (expiredReservations.length === 0) {
      await transaction.commit();
      return;
    }

    console.log(`[Stock Recovery] Found ${expiredReservations.length} expired reservations`);

    for (const reservation of expiredReservations) {
      // Mark reservation as expired
      await reservation.update({ status: 'expired' }, { transaction });

      // Restore stock
      await sequelize.query(
        'UPDATE drops SET available_stock = available_stock + 1 WHERE id = :dropId',
        {
          replacements: { dropId: reservation.drop_id },
          type: sequelize.QueryTypes.UPDATE,
          transaction,
        }
      );

      // Get updated stock
      const [drop] = await sequelize.query(
        'SELECT available_stock FROM drops WHERE id = :dropId',
        {
          replacements: { dropId: reservation.drop_id },
          type: sequelize.QueryTypes.SELECT,
          transaction,
        }
      );

      // Emit socket event
      if (io && drop) {
        io.emit('stock-updated', {
          dropId: reservation.drop_id,
          availableStock: drop.available_stock,
        });
        io.emit('reservation-expired', {
          dropId: reservation.drop_id,
          reservationId: reservation.id,
        });
      }

      console.log(`[Stock Recovery] Restored stock for drop ${reservation.drop_id}. New stock: ${drop?.available_stock}`);
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    console.error('[Stock Recovery] Error:', error);
  }
};

const startStockRecovery = () => {
  const intervalMs = parseInt(process.env.STOCK_RECOVERY_INTERVAL_MS) || 5000;
  
  console.log(`[Stock Recovery] Starting with interval: ${intervalMs}ms`);
  
  setInterval(checkExpiredReservations, intervalMs);
};

module.exports = { setSocketIO, startStockRecovery, checkExpiredReservations };

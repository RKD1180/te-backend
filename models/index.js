const sequelize = require('../config/database');
const User = require('./User');
const Drop = require('./Drop');
const Reservation = require('./Reservation');
const Purchase = require('./Purchase');

// Associations
User.hasMany(Reservation, { foreignKey: 'user_id', as: 'reservations' });
Reservation.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(Purchase, { foreignKey: 'user_id', as: 'purchases' });
Purchase.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Drop.hasMany(Reservation, { foreignKey: 'drop_id', as: 'reservations' });
Reservation.belongsTo(Drop, { foreignKey: 'drop_id', as: 'drop' });

Drop.hasMany(Purchase, { foreignKey: 'drop_id', as: 'purchases' });
Purchase.belongsTo(Drop, { foreignKey: 'drop_id', as: 'drop' });

Reservation.hasOne(Purchase, { foreignKey: 'reservation_id', as: 'purchase' });
Purchase.belongsTo(Reservation, { foreignKey: 'reservation_id', as: 'reservation' });

module.exports = {
  sequelize,
  User,
  Drop,
  Reservation,
  Purchase,
};

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const Purchase = sequelize.define('Purchase', {
  id: {
    type: DataTypes.UUID,
    defaultValue: () => uuidv4(),
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  drop_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'drops',
      key: 'id',
    },
  },
  reservation_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'reservations',
      key: 'id',
    },
  },
  purchased_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'purchases',
  timestamps: false,
});

module.exports = Purchase;

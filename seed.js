require('dotenv').config();
const { sequelize, User, Drop, Purchase } = require('./models');
const bcrypt = require('bcryptjs');

const seed = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    // Clear existing data
    await sequelize.query('DELETE FROM purchases');
    await sequelize.query('DELETE FROM reservations');
    await sequelize.query('DELETE FROM drops');
    await sequelize.query('DELETE FROM users');
    console.log('Cleared existing data.');

    // Create users with hashed passwords
    const hashedPassword = await bcrypt.hash('password123', 10);
    const users = await User.bulkCreate([
      { username: 'sneakerhead_01', password: hashedPassword },
      { username: 'jordan_fan', password: hashedPassword },
      { username: 'yeezy_collector', password: hashedPassword },
      { username: 'nike_addict', password: hashedPassword },
      { username: 'drop_hunter', password: hashedPassword },
    ]);
    console.log(`Created ${users.length} users`);

    // Create drops
    const now = new Date();
    const drops = await Drop.bulkCreate([
      {
        name: 'Air Jordan 1 Retro High OG "Chicago"',
        price: 180.00,
        total_stock: 100,
        available_stock: 100,
        starts_at: new Date(now.getTime() - 60000),
        ends_at: new Date(now.getTime() + 86400000),
      },
      {
        name: 'Nike Dunk Low "Panda"',
        price: 110.00,
        total_stock: 200,
        available_stock: 200,
        starts_at: new Date(now.getTime() - 60000),
        ends_at: new Date(now.getTime() + 86400000),
      },
      {
        name: 'Yeezy Boost 350 V2 "Onyx"',
        price: 230.00,
        total_stock: 50,
        available_stock: 50,
        starts_at: new Date(now.getTime() - 60000),
        ends_at: new Date(now.getTime() + 86400000),
      },
      {
        name: 'New Balance 550 "White Green"',
        price: 120.00,
        total_stock: 150,
        available_stock: 150,
        starts_at: new Date(now.getTime() - 60000),
        ends_at: new Date(now.getTime() + 86400000),
      },
      {
        name: 'Travis Scott x Air Max 1 "Baroque Brown"',
        price: 250.00,
        total_stock: 75,
        available_stock: 0,
        starts_at: new Date(now.getTime() - 86400000),
        ends_at: new Date(now.getTime() - 1000),
      },
    ]);
    console.log(`Created ${drops.length} drops`);

    // Create some purchases for activity feed
    const purchases = await Purchase.bulkCreate([
      { user_id: users[0].id, drop_id: drops[0].id, purchased_at: new Date(now.getTime() - 300000) },
      { user_id: users[1].id, drop_id: drops[0].id, purchased_at: new Date(now.getTime() - 240000) },
      { user_id: users[2].id, drop_id: drops[0].id, purchased_at: new Date(now.getTime() - 180000) },
      { user_id: users[3].id, drop_id: drops[1].id, purchased_at: new Date(now.getTime() - 120000) },
      { user_id: users[4].id, drop_id: drops[2].id, purchased_at: new Date(now.getTime() - 60000) },
    ]);
    console.log(`Created ${purchases.length} purchases`);

    console.log('\nSeed completed successfully!');
    console.log('\nTest Users (password: password123):');
    users.forEach((u) => console.log(`  - ${u.username}`));

    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
};

seed();

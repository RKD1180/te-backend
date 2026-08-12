const setupSocketIO = (io) => {
  io.on('connection', (socket) => {
    socket.on('disconnect', () => {});
  });

  return io;
};

module.exports = { setupSocketIO };

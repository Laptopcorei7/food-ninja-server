const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io;

function initSocket(server) {
  io = new Server(server, {
    cors: { origin: '*' },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token?.replace('Bearer ', '');
    if (!token) return next(new Error('Unauthorized'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    // Each user automatically joins a room named after their userId
    // so controllers can emit order:status directly to a user
    socket.join(socket.userId);

    socket.on('chat:join', ({ chatId }) => socket.join(chatId));
    socket.on('chat:leave', ({ chatId }) => socket.leave(chatId));
  });
}

function getIO() {
  return io;
}

module.exports = { initSocket, getIO };

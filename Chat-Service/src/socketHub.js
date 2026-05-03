let ioInstance = null;

exports.attachIo = (io) => {
  ioInstance = io;
};

exports.emitToUser = (userId, event, payload) => {
  if (!ioInstance || !Number.isFinite(Number(userId))) return;
  const id = Number(userId);
  ioInstance.to(`user:${id}`).emit(event, payload);
};

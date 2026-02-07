const chatService = require("../services/chat.service");

exports.getMyConversations = async (req, res) => {
  const conversations = await chatService.getMyConversations(
    req.user.id,
    req.headers.authorization || "",
  );
  res.json(conversations);
};

exports.getMessages = async (req, res) => {
  const messages = await chatService.getMessages(
    req.user.id,
    Number(req.params.otherUserId),
  );
  res.json(messages);
};

exports.sendMessage = async (req, res) => {
  const message = await chatService.sendMessage(
    req.user.id,
    Number(req.params.otherUserId),
    req.body.content,
    {
      senderName: req.body.senderName,
      receiverName: req.body.receiverName,
      conversationName: req.body.conversationName,
    },
    req.headers.authorization || "",
  );
  res.status(201).json(message);
};

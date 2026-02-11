const friendshipService = require("../services/friendship.service");

exports.sendRequest = async (req, res) => {
  const result = await friendshipService.sendRequest(
    req.user.id,
    Number(req.params.userId),
    {
      userName: req.body.userName,
    },
    req.headers.authorization || "",
  );
  res.status(201).json(result);
};

exports.acceptRequest = async (req, res) => {
  const result = await friendshipService.acceptRequest(
    req.user.id,
    Number(req.params.userId),
    {
      userName: req.body.userName,
    },
    req.headers.authorization || "",
  );
  res.json(result);
};

exports.rejectRequest = async (req, res) => {
  const result = await friendshipService.rejectRequest(
    req.user.id,
    Number(req.params.userId),
    {
      userName: req.body.userName,
    },
    req.headers.authorization || "",
  );
  res.json(result);
};

exports.blockUser = async (req, res) => {
  const result = await friendshipService.blockUser(
    req.user.id,
    Number(req.params.userId),
    req.headers.authorization || "",
  );
  res.status(201).json(result);
};

exports.unblockUser = async (req, res) => {
  const result = await friendshipService.unblockUser(
    req.user.id,
    Number(req.params.userId),
    req.headers.authorization || "",
  );
  res.json(result);
};

exports.getStatus = async (req, res) => {
  const status = await friendshipService.getStatus(
    req.user.id,
    Number(req.params.userId),
  );
  res.json(status);
};

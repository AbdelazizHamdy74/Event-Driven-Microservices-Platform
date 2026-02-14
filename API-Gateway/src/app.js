require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const https = require("https");
const { createObservability } = require("../../shared/http/observability");
const { createRateLimiter } = require("../../shared/http/rateLimit");
const { securityHeaders } = require("../../shared/http/security");
const { notFoundHandler, errorHandler } = require("../../shared/http/errors");

const app = express();
const { requestLogger, healthHandler, metricsHandler } =
  createObservability("api-gateway");

const proxyTimeoutMs = Number(process.env.GATEWAY_PROXY_TIMEOUT_MS) || 15000;

const serviceRegistry = {
  userService: process.env.USER_SERVICE_URL || "http://localhost:3001",
  postService: process.env.POST_SERVICE_URL || "http://localhost:3002",
  commentService: process.env.COMMENT_SERVICE_URL || "http://localhost:3003",
  friendshipService:
    process.env.FRIENDSHIP_SERVICE_URL || "http://localhost:3004",
  chatService: process.env.CHAT_SERVICE_URL || "http://localhost:3005",
  likeService: process.env.LIKE_SERVICE_URL || "http://localhost:3006",
};

const routeMappings = [
  { prefix: "/auth", target: serviceRegistry.userService, name: "user-service" },
  { prefix: "/users", target: serviceRegistry.userService, name: "user-service" },
  { prefix: "/posts", target: serviceRegistry.postService, name: "post-service" },
  {
    prefix: "/comments",
    target: serviceRegistry.commentService,
    name: "comment-service",
  },
  {
    prefix: "/friendships",
    target: serviceRegistry.friendshipService,
    name: "friendship-service",
  },
  { prefix: "/chats", target: serviceRegistry.chatService, name: "chat-service" },
  { prefix: "/likes", target: serviceRegistry.likeService, name: "like-service" },
];

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const removeHopByHopHeaders = (headers = {}) => {
  const sanitized = { ...headers };
  Object.keys(sanitized).forEach((headerName) => {
    if (HOP_BY_HOP_HEADERS.has(headerName.toLowerCase())) {
      delete sanitized[headerName];
    }
  });
  return sanitized;
};

const createProxyMiddleware = ({ target, serviceName }) => {
  return (req, res, next) => {
    let upstreamUrl;
    try {
      upstreamUrl = new URL(req.originalUrl, target);
    } catch (_err) {
      const error = new Error(`Invalid upstream URL for ${serviceName}`);
      error.status = 500;
      return next(error);
    }

    const transport = upstreamUrl.protocol === "https:" ? https : http;
    const headers = removeHopByHopHeaders(req.headers);
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    headers.host = upstreamUrl.host;
    headers["x-forwarded-for"] = headers["x-forwarded-for"]
      ? `${headers["x-forwarded-for"]}, ${clientIp}`
      : clientIp;
    headers["x-forwarded-host"] = req.headers.host || "";
    headers["x-forwarded-proto"] = req.protocol;
    headers["x-request-id"] = req.requestId || headers["x-request-id"] || "";

    const upstreamRequest = transport.request(
      {
        protocol: upstreamUrl.protocol,
        hostname: upstreamUrl.hostname,
        port:
          Number(upstreamUrl.port) ||
          (upstreamUrl.protocol === "https:" ? 443 : 80),
        method: req.method,
        path: `${upstreamUrl.pathname}${upstreamUrl.search}`,
        headers,
        timeout: proxyTimeoutMs,
      },
      (upstreamResponse) => {
        const responseHeaders = removeHopByHopHeaders(upstreamResponse.headers);
        Object.entries(responseHeaders).forEach(([name, value]) => {
          if (typeof value !== "undefined") {
            res.setHeader(name, value);
          }
        });

        res.status(upstreamResponse.statusCode || 502);
        upstreamResponse.pipe(res);
      },
    );

    upstreamRequest.on("timeout", () => {
      upstreamRequest.destroy(new Error("Upstream request timeout"));
    });

    upstreamRequest.on("error", (cause) => {
      if (res.headersSent) return;
      const error = new Error(`Gateway failed to reach ${serviceName}`);
      error.status = 502;
      error.cause = cause;
      next(error);
    });

    req.on("aborted", () => {
      upstreamRequest.destroy();
    });

    req.pipe(upstreamRequest);
  };
};

const checkServiceHealth = (serviceName, serviceUrl) =>
  new Promise((resolve) => {
    let url;
    try {
      url = new URL("/health", serviceUrl);
    } catch (_err) {
      return resolve({
        service: serviceName,
        url: serviceUrl,
        status: "invalid-url",
        ok: false,
      });
    }

    const transport = url.protocol === "https:" ? https : http;
    const healthRequest = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
        method: "GET",
        path: `${url.pathname}${url.search}`,
        timeout: 3000,
      },
      (healthResponse) => {
        const ok =
          (healthResponse.statusCode || 500) >= 200 &&
          (healthResponse.statusCode || 500) < 300;
        resolve({
          service: serviceName,
          url: serviceUrl,
          status: ok ? "up" : "down",
          statusCode: healthResponse.statusCode || null,
          ok,
        });
        healthResponse.resume();
      },
    );

    healthRequest.on("timeout", () => {
      healthRequest.destroy(new Error("timeout"));
    });

    healthRequest.on("error", (error) => {
      resolve({
        service: serviceName,
        url: serviceUrl,
        status: "down",
        ok: false,
        error: error.message,
      });
    });

    healthRequest.end();
  });

app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(cors());
app.use(securityHeaders);
app.use(
  createRateLimiter({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    max: Number(process.env.RATE_LIMIT_MAX) || 120,
  }),
);
app.use(requestLogger);

app.get("/health", healthHandler);
app.get("/metrics", metricsHandler);

app.get("/", (_req, res) => {
  res.json({
    service: "api-gateway",
    routes: routeMappings.map((route) => ({
      prefix: route.prefix,
      service: route.name,
      target: route.target,
    })),
  });
});

app.get("/health/services", async (_req, res) => {
  const checks = await Promise.all(
    Object.entries(serviceRegistry).map(([serviceName, serviceUrl]) =>
      checkServiceHealth(serviceName, serviceUrl),
    ),
  );

  const allUp = checks.every((check) => check.ok);

  res.status(allUp ? 200 : 503).json({
    status: allUp ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    services: checks,
  });
});

routeMappings.forEach((route) => {
  app.use(
    route.prefix,
    createProxyMiddleware({
      target: route.target,
      serviceName: route.name,
    }),
  );
});

app.use(notFoundHandler);
app.use(errorHandler);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`API Gateway running on port ${port}`);
});

const http = require("http");
const https = require("https");

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_USER_SERVICE_URL = "http://localhost:3001";

const toAuthorizationHeader = (authorization) => {
  if (typeof authorization !== "string") return "";

  const value = authorization.trim();
  if (!value) return "";

  return value.startsWith("Bearer ") ? value : `Bearer ${value}`;
};

const validateUserSession = ({
  authorization,
  userServiceUrl = DEFAULT_USER_SERVICE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) =>
  new Promise((resolve) => {
    const authHeader = toAuthorizationHeader(authorization);
    if (!authHeader) {
      resolve({
        ok: false,
        status: 401,
        message: "Unauthorized",
      });
      return;
    }

    let sessionUrl;
    try {
      sessionUrl = new URL("/auth/session", userServiceUrl);
    } catch (_error) {
      resolve({
        ok: false,
        status: 502,
        message: "Auth service unavailable",
      });
      return;
    }

    const transport = sessionUrl.protocol === "https:" ? https : http;
    const request = transport.request(
      {
        protocol: sessionUrl.protocol,
        hostname: sessionUrl.hostname,
        port:
          Number(sessionUrl.port) ||
          (sessionUrl.protocol === "https:" ? 443 : 80),
        method: "GET",
        path: `${sessionUrl.pathname}${sessionUrl.search}`,
        headers: {
          authorization: authHeader,
        },
        timeout: timeoutMs,
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          let payload = null;
          try {
            payload = body ? JSON.parse(body) : null;
          } catch (_error) {
            payload = null;
          }

          const status = response.statusCode || 502;
          if (status >= 200 && status < 300 && payload?.user?.id) {
            resolve({
              ok: true,
              status,
              user: payload.user,
            });
            return;
          }

          resolve({
            ok: false,
            status,
            message: payload?.message || "Unauthorized",
          });
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("Auth service timeout"));
    });

    request.on("error", () => {
      resolve({
        ok: false,
        status: 502,
        message: "Auth service unavailable",
      });
    });

    request.end();
  });

module.exports = {
  validateUserSession,
};

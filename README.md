# MicroSocial

Event-Driven Microservices Social Platform

MicroSocial is a backend social platform built with Node.js, Express, Kafka, and MySQL.
The system is designed to be scalable, loosely coupled, and event-driven.

---

## Architecture Overview

Services:

- API Gateway (`3000`)
- User Service (`3001`)
- Post Service (`3002`)
- Comment Service (`3003`)
- Friendship Service (`3004`)
- Chat Service (`3005`)
- Like Service (`3006`)
- Notification Service (Kafka consumer, no HTTP API)

Each service:

- Owns its own database
- Communicates asynchronously via Kafka events
- Can be deployed independently

---

## Event-Driven Flow (Kafka)

Published events:

- USER_CREATED
- POST_CREATED
- POST_UPDATED
- POST_DELETED
- CHAT_MESSAGE_CREATED
- COMMENT_CREATED
- COMMENT_UPDATED
- COMMENT_DELETED
- POST_LIKED
- POST_UNLIKED
- FRIEND_REQUEST_SENT
- FRIEND_REQUEST_ACCEPTED
- FRIEND_REQUEST_REJECTED
- FRIEND_BLOCKED
- FRIEND_UNBLOCKED

Notification Service consumes:

- `user-events`
- `post-events`
- `chat-events`
- `comment-events`
- `like-events`
- `friendship-events`

and stores notifications in `notification_service.notifications`.

---

## Service Endpoints

### API Gateway (`http://localhost:3000`)

Client-facing entry point for all HTTP APIs:

- `POST /auth/signup`
- `POST /auth/login`
- `GET /auth/users` (admin)
- `POST /users` (admin)
- `GET /users/:id`
- `PUT /users/:id`
- `DELETE /users/:id`
- `POST /posts`
- `GET /posts`
- `GET /posts/:id`
- `PUT /posts/:id`
- `DELETE /posts/:id`
- `POST /comments/posts/:postId`
- `GET /comments/posts/:postId`
- `GET /comments/posts/:postId/:commentId`
- `PUT /comments/posts/:postId/:commentId`
- `DELETE /comments/posts/:postId/:commentId`
- `GET /comments`
- `POST /friendships/requests/:userId`
- `POST /friendships/requests/:userId/accept`
- `POST /friendships/requests/:userId/reject`
- `POST /friendships/blocks/:userId`
- `DELETE /friendships/blocks/:userId`
- `GET /friendships/status/:userId`
- `GET /chats`
- `GET /chats/:otherUserId/messages`
- `POST /chats/:otherUserId/messages`
- `POST /likes/posts/:postId`
- `DELETE /likes/posts/:postId`
- `GET /likes/posts/:postId/count`
- `GET /health`
- `GET /metrics`
- `GET /health/services`

Internal services remain available on their own ports for service-to-service calls.

---

### User Service (`http://localhost:3001`)

- `POST /auth/signup`
- `POST /auth/login`
- `GET /auth/users` (admin)
- `POST /users` (admin)
- `GET /users/:id`
- `PUT /users/:id`
- `DELETE /users/:id`

### Post Service (`http://localhost:3002`)

- `POST /posts`
- `GET /posts`
- `GET /posts/:id`
- `PUT /posts/:id`
- `DELETE /posts/:id`

### Comment Service (`http://localhost:3003`)

- `POST /comments/posts/:postId`
- `GET /comments/posts/:postId`
- `GET /comments/posts/:postId/:commentId`
- `PUT /comments/posts/:postId/:commentId`
- `DELETE /comments/posts/:postId/:commentId`
- `GET /comments`

### Friendship Service (`http://localhost:3004`)

- `POST /friendships/requests/:userId`
- `POST /friendships/requests/:userId/accept`
- `POST /friendships/requests/:userId/reject`
- `POST /friendships/blocks/:userId`
- `DELETE /friendships/blocks/:userId`
- `GET /friendships/status/:userId`

### Chat Service (`http://localhost:3005`)

- `GET /chats`
- `GET /chats/:otherUserId/messages`
- `POST /chats/:otherUserId/messages`

### Like Service (`http://localhost:3006`)

- `POST /likes/posts/:postId`
- `DELETE /likes/posts/:postId`
- `GET /likes/posts/:postId/count`

Notes:

- Like/Unlike now resolves the post owner internally from Post Service.
- `POST /likes/posts/:postId` no longer requires `postOwnerId` in request body.

---

## Monitoring, Logging, and Runtime Safety (Implemented)

Applied to all HTTP services:

- API Gateway
- User Service
- Post Service
- Comment Service
- Friendship Service
- Chat Service
- Like Service

### Observability

- Request logging with method, path, status, duration, and request id
- Response header `X-Request-Id`
- `GET /health` for liveness checks
- `GET /metrics` for lightweight runtime counters and memory usage

### Rate Limiting

- Per-IP in-memory rate limiter
- Response headers:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`
- 429 response when exceeded

Environment variables:

- `RATE_LIMIT_WINDOW_MS` (default: `60000`)
- `RATE_LIMIT_MAX` (default: `120`)

### Security Enhancements

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- `Cross-Origin-Resource-Policy: same-site`
- `x-powered-by` disabled

### Error Handling and 404

- Unified JSON error responses through global error middleware
- Invalid token errors are returned as `401` JSON
- Unknown routes return JSON `404`

Example 404 response:

```json
{
  "message": "Route not found: GET /unknown-route"
}
```

---

## Security

- JWT authentication
- Role-based authorization
- Middleware-based access control
- Consistent JSON error responses
- Basic secure HTTP headers
- Rate limiting

---

## Tech Stack

- Node.js
- Express.js
- Apache Kafka
- MySQL
- JWT

---

## Future Features

- Centralized metrics/log pipeline (Prometheus/Grafana/ELK)
- Advanced security hardening (WAF, stricter CORS policy, secret rotation)

---

## Running the Project

1. Start Kafka and Zookeeper.
2. Ensure MySQL is running.
3. Create service databases and apply each `schema.sql`.
4. Run HTTP services:
   - `API-Gateway`
   - `User-Service`
   - `Post-Service`
   - `Comment-Service`
   - `Friendship-Service`
   - `Chat-Service`
   - `Like-Service`
5. Run `Notification-Service` consumer.
6. Verify health checks:
   - `GET http://localhost:3000/health`
   - `GET http://localhost:3000/health/services`
   - `GET http://localhost:3001/health`
   - `GET http://localhost:3002/health`
   - `GET http://localhost:3003/health`
   - `GET http://localhost:3004/health`
   - `GET http://localhost:3005/health`
   - `GET http://localhost:3006/health`

---

## Author

Abdelaziz  
Backend / Full Stack Developer  
Microservices and Event-Driven Systems

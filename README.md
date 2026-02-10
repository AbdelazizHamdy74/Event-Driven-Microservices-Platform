# MicroSocial

Event-Driven Microservices Social Platform

MicroSocial is a backend social platform built using Node.js, Express, Kafka, and a microservices architecture.
The system is designed to be scalable, loosely coupled, and event-driven.

---

## Architecture Overview

The platform follows microservices architecture with Apache Kafka as the event broker.

Services:

- User Service
- Post Service
- Notification Service
- Chat Service
- Comment Service
- Like Service
- Friendship Service

Each service:

- Has its own database
- Communicates asynchronously via Kafka events
- Is independently deployable

---

## Event-Driven Flow (Kafka)

Services publish events such as:

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

The Notification Service consumes these events and stores notifications accordingly.

---

## Services Breakdown

### User Service

Responsible for:

- User signup and login
- Authentication using JWT
- Role-based access control (Admin / User)

Endpoints:

- POST /signup
- POST /login
- GET /users (Admin only)

---

### Post Service

Responsible for:

- Creating, updating, deleting posts
- Fetching user posts
- Publishing post-related events to Kafka

Endpoints:

- POST /posts
- GET /posts
- PUT /posts/:id
- DELETE /posts/:id

---

### Comment Service

Responsible for:

- Create, update, delete comments
- Fetch user comments
- Fetch comments for a specific post
- Enforce comments belong to an existing post
- Auto-delete comments when a post is deleted
- Publishing comment-related events to Kafka

Endpoints:

- POST /comments/posts/:postId
- GET /comments/posts/:postId
- GET /comments/posts/:postId/:commentId
- PUT /comments/posts/:postId/:commentId
- DELETE /comments/posts/:postId/:commentId
- GET /comments

---

### Chat Service

Responsible for:

- Real-time messaging
- Conversations and message history
- Publishing chat-related events to Kafka

Endpoints:

- GET /chats
- GET /chats/:otherUserId/messages
- POST /chats/:otherUserId/messages

---

### Notification Service

Responsible for:

- Consuming Kafka events
- Creating notifications for users
- Storing notifications in database

Consumed Topics:

- user-events
- post-events
- chat-events
- comment-events
- like-events
- friendship-events

---

### Like Service

Responsible for:

- Like / Unlike
- Prevent double-like
- Count likes
- Publishing like-related events

Endpoints:

- POST /likes/posts/:postId
- DELETE /likes/posts/:postId
- GET /likes/posts/:postId/count

Notes:

- POST /likes/posts/:postId expects postOwnerId in the body.

---

### Friendship Service

Responsible for:

- Send, accept, and reject friend requests
- Block and unblock users
- Track friendship status between users
- Publishing friendship-related events

Endpoints:

- POST /friendships/requests/:userId
- POST /friendships/requests/:userId/accept
- POST /friendships/requests/:userId/reject
- POST /friendships/blocks/:userId
- DELETE /friendships/blocks/:userId
- GET /friendships/status/:userId

---

## Security

- JWT Authentication
- Role-based authorization
- Middleware-based access control
- Helmet (recommended)

---

## Tech Stack

- Node.js
- Express.js
- Apache Kafka
- MySQL
- JWT
- Docker (planned)
- Redis (planned)

---

## Future Features

- WebSocket support
- API Gateway
- Monitoring and Logging
- Rate Limiting and Security Enhancements

---

## Running the Project (Basic)

1. Start Kafka and Zookeeper
2. Run each service independently
3. Ensure topics are created
4. Test APIs using Postman

---

## Author

Abdelaziz
Backend / Full Stack Developer
Microservices and Event-Driven Systems

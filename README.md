# MicroSocial 🧩  
Event-Driven Microservices Social Platform

MicroSocial is a backend social platform built using **Node.js**, **Express**, **Kafka**, and **Microservices Architecture**.  
The system is designed to be scalable, loosely coupled, and event-driven.

---

## 🏗️ Architecture Overview

The platform follows **Microservices Architecture** with **Apache Kafka** as the event broker.

### Services:
- **User Service**
- **Post Service**
- **Notification Service**
- (Planned) Chat Service
- (Planned) Comment Service
- (Planned) Like Service

Each service:
- Has its own database
- Communicates asynchronously via Kafka events
- Is independently deployable

---

## 🔄 Event-Driven Flow (Kafka)

Services publish events such as:
- `USER_CREATED`
- `POST_CREATED`
- `POST_UPDATED`
- `POST_DELETED`

The **Notification Service** consumes these events and stores notifications accordingly.

---

## 📦 Services Breakdown

### 👤 User Service
Responsible for:
- User signup & login
- Authentication using JWT
- Role-based access control (Admin / User)

Endpoints:
- `POST /signup`
- `POST /login`
- `GET /users` (Admin only)

---

### 📝 Post Service
Responsible for:
- Creating, updating, deleting posts
- Fetching user posts
- Publishing post-related events to Kafka

Endpoints:
- `POST /posts`
- `GET /posts`
- `PUT /posts/:id`
- `DELETE /posts/:id`

---

### 🔔 Notification Service
Responsible for:
- Consuming Kafka events
- Creating notifications for users
- Storing notifications in database

Consumed Topics:
- `user-events`
- `post-events`

---

## 🔐 Security
- JWT Authentication
- Role-based authorization
- Middleware-based access control
- Helmet (recommended)

---

## 🧠 Tech Stack

- Node.js
- Express.js
- Apache Kafka
- MySQL
- JWT
- Docker (planned)
- Redis (planned)

---

## 🚀 Future Features

- 💬 Chat Service (Real-time messaging)
- 💬 Comment Service
- ❤️ Like Service
- 📡 WebSocket support
- 🔍 API Gateway
- 📊 Monitoring & Logging
- 🛡️ Rate Limiting & Security Enhancements

---

## 🧪 Running the Project (Basic)

1. Start Kafka & Zookeeper
2. Run each service independently
3. Ensure topics are created
4. Test APIs using Postman

---

## 👨‍💻 Author
**Abdelaziz**  
Backend / Full Stack Developer  
Microservices & Event-Driven Systems

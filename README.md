# Virtual Event Management Backend

Backend API for a virtual event management platform built with Node.js and Express.

The system supports:
- User registration and login with password hashing and JWT authentication
- Role-based authorization for organizers and attendees
- Event CRUD operations in memory
- Participant registration and registration management in memory
- Email notifications for successful user and event registration

## Tech Stack

- Node.js
- Express
- bcryptjs for password hashing
- jsonwebtoken for token-based authentication
- nodemailer for email notifications
- Jest and Supertest for testing

## In-Memory Data Model

No database is used. Data is stored in memory and resets when the server restarts.

- Users: array in [src/store.js](src/store.js)
- Events: array in [src/store.js](src/store.js)

User object shape:
- id
- name
- email
- passwordHash
- role (organizer or attendee)

Event object shape:
- id
- title
- date
- time
- description
- organizerId
- participants (array of userId, name, email)

## Project Setup

1. Install dependencies:
   
```bash
npm install
```

2. Configure environment variables:

- JWT_SECRET (required outside test execution)
- SMTP_HOST
- SMTP_PORT
- SMTP_USER
- SMTP_PASS
- SMTP_FROM

3. Start the server:

```bash
npm start
```

Server default URL: http://localhost:3000

Health endpoint: GET /health

## Authentication and Authorization

- Registration and login endpoints issue/verify JWT tokens.
- Protected endpoints require an Authorization header:

```text
Authorization: Bearer <token>
```

- Organizer-only endpoints are restricted by role checks.

## REST API Endpoints

### Auth

- POST /register

Register user.

Request body: name, email, password, optional role.

On success: returns created user info and sends confirmation email.

- POST /login

Login with email and password.

On success: returns JWT token and user info.

### Events

- GET /events

Auth required.

Returns all events.

- POST /events

Auth required (organizer).

Creates event.

Request body: title, date, time, description.

- PUT /events/:id

Auth required (organizer and event owner).

Updates one or more fields: title, date, time, description.

- DELETE /events/:id

Auth required (organizer and event owner).

Deletes event.

### Participant Management

- POST /events/:id/register

Auth required.

Registers authenticated user for event.

Sends event registration email.

- GET /events/registrations/me

Auth required.

Returns events the authenticated user has registered for.

- DELETE /events/:id/register

Auth required.

Cancels authenticated user's registration for event.

## Asynchronous Operations

Email notifications are handled asynchronously with async/await and Promises in [src/services/emailService.js](src/services/emailService.js).

## Running Tests

Run all tests:

npm run test

Current coverage includes:
- Authentication flows
- Event CRUD authorization and validation
- Participant registration and cancellation flows
- Registration listing for authenticated users

## Notes

- This project uses in-memory arrays for data storage by design.
- Restarting the process resets all users, events, and registrations.
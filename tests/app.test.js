const request = require('supertest');

// Mock nodemailer to prevent actual email sending during tests
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
  })),
}));

// We need to reset the in-memory store between tests by requiring a fresh app
// Use jest module isolation
let app;

beforeEach(() => {
  jest.resetModules();
  // Re-mock nodemailer after reset
  jest.mock('nodemailer', () => ({
    createTransport: jest.fn(() => ({
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
    })),
  }));
  app = require('../src/app');
});

describe('User Authentication', () => {
  test('POST /register - registers a new user successfully', async () => {
    const res = await request(app).post('/register').send({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'password123',
      role: 'organizer',
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      name: 'Alice',
      email: 'alice@example.com',
      role: 'organizer',
    });
    expect(res.body.user.id).toBeDefined();
  });

  test('POST /register - defaults role to attendee if role not specified', async () => {
    const res = await request(app).post('/register').send({
      name: 'Bob',
      email: 'bob@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('attendee');
  });

  test('POST /register - returns 400 if required fields are missing', async () => {
    const res = await request(app).post('/register').send({ email: 'test@example.com' });
    expect(res.status).toBe(400);
  });

  test('POST /register - returns 409 if email already registered', async () => {
    await request(app).post('/register').send({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'password123',
    });
    const res = await request(app).post('/register').send({
      name: 'Alice2',
      email: 'alice@example.com',
      password: 'pass456',
    });
    expect(res.status).toBe(409);
  });

  test('POST /login - returns JWT token on valid credentials', async () => {
    await request(app).post('/register').send({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'password123',
      role: 'organizer',
    });
    const res = await request(app)
      .post('/login')
      .send({ email: 'alice@example.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('alice@example.com');
  });

  test('POST /login - returns 401 on wrong password', async () => {
    await request(app).post('/register').send({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'password123',
    });
    const res = await request(app)
      .post('/login')
      .send({ email: 'alice@example.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  test('POST /login - returns 401 for unknown email', async () => {
    const res = await request(app)
      .post('/login')
      .send({ email: 'unknown@example.com', password: 'password123' });
    expect(res.status).toBe(401);
  });

  test('POST /login - returns 400 if fields are missing', async () => {
    const res = await request(app).post('/login').send({ email: 'alice@example.com' });
    expect(res.status).toBe(400);
  });
});

describe('Event Management', () => {
  let organizerToken;
  let attendeeToken;

  beforeEach(async () => {
    // Register organizer
    await request(app).post('/register').send({
      name: 'Organizer',
      email: 'organizer@example.com',
      password: 'password123',
      role: 'organizer',
    });
    const orgLogin = await request(app)
      .post('/login')
      .send({ email: 'organizer@example.com', password: 'password123' });
    organizerToken = orgLogin.body.token;

    // Register attendee
    await request(app).post('/register').send({
      name: 'Attendee',
      email: 'attendee@example.com',
      password: 'password123',
      role: 'attendee',
    });
    const attLogin = await request(app)
      .post('/login')
      .send({ email: 'attendee@example.com', password: 'password123' });
    attendeeToken = attLogin.body.token;
  });

  test('POST /events - organizer can create an event', async () => {
    const res = await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Tech Conference',
        date: '2026-06-15',
        time: '09:00',
        description: 'Annual tech conference',
      });
    expect(res.status).toBe(201);
    expect(res.body.event).toMatchObject({
      title: 'Tech Conference',
      date: '2026-06-15',
      time: '09:00',
      description: 'Annual tech conference',
      participants: [],
    });
    expect(res.body.event.id).toBeDefined();
  });

  test('POST /events - attendee cannot create an event', async () => {
    const res = await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({
        title: 'Unauthorized Event',
        date: '2026-06-15',
        time: '09:00',
        description: 'Should fail',
      });
    expect(res.status).toBe(403);
  });

  test('POST /events - returns 401 without token', async () => {
    const res = await request(app).post('/events').send({
      title: 'No Auth Event',
      date: '2026-06-15',
      time: '09:00',
      description: 'Should fail',
    });
    expect(res.status).toBe(401);
  });

  test('POST /events - returns 400 if required fields missing', async () => {
    const res = await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ title: 'Incomplete Event' });
    expect(res.status).toBe(400);
  });

  test('GET /events - authenticated user can list events', async () => {
    await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Tech Conference',
        date: '2026-06-15',
        time: '09:00',
        description: 'Annual tech conference',
      });
    const res = await request(app)
      .get('/events')
      .set('Authorization', `Bearer ${attendeeToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events.length).toBeGreaterThan(0);
  });

  test('GET /events - returns 401 without token', async () => {
    const res = await request(app).get('/events');
    expect(res.status).toBe(401);
  });

  test('PUT /events/:id - organizer can update own event', async () => {
    const createRes = await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Tech Conference',
        date: '2026-06-15',
        time: '09:00',
        description: 'Annual tech conference',
      });
    const eventId = createRes.body.event.id;

    const res = await request(app)
      .put(`/events/${eventId}`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ title: 'Updated Conference' });
    expect(res.status).toBe(200);
    expect(res.body.event.title).toBe('Updated Conference');
  });

  test('PUT /events/:id - returns 404 for non-existent event', async () => {
    const res = await request(app)
      .put('/events/non-existent-id')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ title: 'Updated' });
    expect(res.status).toBe(404);
  });

  test('DELETE /events/:id - organizer can delete own event', async () => {
    const createRes = await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Tech Conference',
        date: '2026-06-15',
        time: '09:00',
        description: 'Annual tech conference',
      });
    const eventId = createRes.body.event.id;

    const res = await request(app)
      .delete(`/events/${eventId}`)
      .set('Authorization', `Bearer ${organizerToken}`);
    expect(res.status).toBe(200);

    const getRes = await request(app)
      .get('/events')
      .set('Authorization', `Bearer ${organizerToken}`);
    expect(getRes.body.events.find((e) => e.id === eventId)).toBeUndefined();
  });

  test('DELETE /events/:id - returns 404 for non-existent event', async () => {
    const res = await request(app)
      .delete('/events/non-existent-id')
      .set('Authorization', `Bearer ${organizerToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Participant Management', () => {
  let organizerToken;
  let attendeeToken;
  let eventId;

  beforeEach(async () => {
    // Register organizer and attendee, create an event
    await request(app).post('/register').send({
      name: 'Organizer',
      email: 'organizer@example.com',
      password: 'password123',
      role: 'organizer',
    });
    const orgLogin = await request(app)
      .post('/login')
      .send({ email: 'organizer@example.com', password: 'password123' });
    organizerToken = orgLogin.body.token;

    await request(app).post('/register').send({
      name: 'Attendee',
      email: 'attendee@example.com',
      password: 'password123',
      role: 'attendee',
    });
    const attLogin = await request(app)
      .post('/login')
      .send({ email: 'attendee@example.com', password: 'password123' });
    attendeeToken = attLogin.body.token;

    const eventRes = await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Tech Conference',
        date: '2026-06-15',
        time: '09:00',
        description: 'Annual tech conference',
      });
    eventId = eventRes.body.event.id;
  });

  test('POST /events/:id/register - attendee can register for an event', async () => {
    const res = await request(app)
      .post(`/events/${eventId}/register`)
      .set('Authorization', `Bearer ${attendeeToken}`);
    expect(res.status).toBe(200);
    expect(res.body.event.participants.length).toBe(1);
    expect(res.body.event.participants[0].email).toBe('attendee@example.com');
  });

  test('POST /events/:id/register - returns 409 if already registered', async () => {
    await request(app)
      .post(`/events/${eventId}/register`)
      .set('Authorization', `Bearer ${attendeeToken}`);
    const res = await request(app)
      .post(`/events/${eventId}/register`)
      .set('Authorization', `Bearer ${attendeeToken}`);
    expect(res.status).toBe(409);
  });

  test('POST /events/:id/register - returns 404 for non-existent event', async () => {
    const res = await request(app)
      .post('/events/non-existent-id/register')
      .set('Authorization', `Bearer ${attendeeToken}`);
    expect(res.status).toBe(404);
  });

  test('POST /events/:id/register - returns 401 without token', async () => {
    const res = await request(app).post(`/events/${eventId}/register`);
    expect(res.status).toBe(401);
  });
});

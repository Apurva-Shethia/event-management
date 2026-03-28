const express = require('express');
const rateLimit = require('express-rate-limit');
const { randomUUID } = require('crypto');
const { events, users } = require('../store');
const { authenticate, requireOrganizer } = require('../middleware/auth');
const { sendEventRegistrationEmail } = require('../services/emailService');

const router = express.Router();

const eventsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later' },
});

router.use(eventsRateLimiter);

/**
 * GET /events
 * Retrieve all events. Requires authentication.
 */
router.get('/', authenticate, (req, res) => {
  return res.status(200).json({ events });
});

/**
 * POST /events
 * Create a new event. Requires organizer role.
 */
router.post('/', authenticate, requireOrganizer, (req, res) => {
  const { title, date, time, description } = req.body;

  if (!title || !date || !time || !description) {
    return res.status(400).json({ message: 'title, date, time, and description are required' });
  }

  const event = {
    id: randomUUID(),
    title,
    date,
    time,
    description,
    organizerId: req.user.id,
    participants: [],
  };
  events.push(event);

  return res.status(201).json({ message: 'Event created successfully', event });
});

/**
 * PUT /events/:id
 * Update an existing event. Requires organizer role and ownership.
 */
router.put('/:id', authenticate, requireOrganizer, (req, res) => {
  const event = events.find((e) => e.id === req.params.id);
  if (!event) {
    return res.status(404).json({ message: 'Event not found' });
  }

  if (event.organizerId !== req.user.id) {
    return res.status(403).json({ message: 'Not authorized to update this event' });
  }

  const { title, date, time, description } = req.body;
  if (title !== undefined) event.title = title;
  if (date !== undefined) event.date = date;
  if (time !== undefined) event.time = time;
  if (description !== undefined) event.description = description;

  return res.status(200).json({ message: 'Event updated successfully', event });
});

/**
 * DELETE /events/:id
 * Delete an event. Requires organizer role and ownership.
 */
router.delete('/:id', authenticate, requireOrganizer, (req, res) => {
  const index = events.findIndex((e) => e.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ message: 'Event not found' });
  }

  if (events[index].organizerId !== req.user.id) {
    return res.status(403).json({ message: 'Not authorized to delete this event' });
  }

  events.splice(index, 1);
  return res.status(200).json({ message: 'Event deleted successfully' });
});

/**
 * POST /events/:id/register
 * Register the authenticated user for an event.
 */
router.post('/:id/register', authenticate, (req, res) => {
  const event = events.find((e) => e.id === req.params.id);
  if (!event) {
    return res.status(404).json({ message: 'Event not found' });
  }

  const alreadyRegistered = event.participants.some((p) => p.userId === req.user.id);
  if (alreadyRegistered) {
    return res.status(409).json({ message: 'Already registered for this event' });
  }

  event.participants.push({ userId: req.user.id, name: req.user.name, email: req.user.email });

  // Send event registration confirmation email asynchronously
  sendEventRegistrationEmail(req.user.email, req.user.name, event).catch((err) => {
    console.error('Failed to send event registration email:', err.message);
  });

  return res.status(200).json({
    message: 'Successfully registered for the event',
    event: {
      id: event.id,
      title: event.title,
      date: event.date,
      time: event.time,
      description: event.description,
      participants: event.participants,
    },
  });
});

module.exports = router;

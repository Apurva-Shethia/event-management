const express = require('express');
const rateLimit = require('express-rate-limit');
const { randomUUID } = require('crypto');
const { events } = require('../store');
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

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function toPublicEvent(event) {
  return {
    id: event.id,
    title: event.title,
    date: event.date,
    time: event.time,
    description: event.description,
    organizerId: event.organizerId,
    participants: event.participants.map((participant) => ({
      userId: participant.userId,
      name: participant.name,
      email: participant.email,
    })),
  };
}

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

  if (!isNonEmptyString(title) || !isNonEmptyString(date) || !isNonEmptyString(time) || !isNonEmptyString(description)) {
    return res.status(400).json({ message: 'title, date, time, and description are required' });
  }

  const normalizedDate = date.trim();
  const normalizedTime = time.trim();

  if (!isValidDate(normalizedDate)) {
    return res.status(400).json({ message: 'date must use YYYY-MM-DD format' });
  }

  if (!isValidTime(normalizedTime)) {
    return res.status(400).json({ message: 'time must use HH:mm 24-hour format' });
  }

  const event = {
    id: randomUUID(),
    title: title.trim(),
    date: normalizedDate,
    time: normalizedTime,
    description: description.trim(),
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
  const updates = { title, date, time, description };

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      continue;
    }

    if (!isNonEmptyString(value)) {
      return res.status(400).json({ message: `${key} must be a non-empty string` });
    }

    const normalizedValue = value.trim();

    if (key === 'date' && !isValidDate(normalizedValue)) {
      return res.status(400).json({ message: 'date must use YYYY-MM-DD format' });
    }

    if (key === 'time' && !isValidTime(normalizedValue)) {
      return res.status(400).json({ message: 'time must use HH:mm 24-hour format' });
    }

    event[key] = normalizedValue;
  }

  return res.status(200).json({ message: 'Event updated successfully', event });
});

/**
 * GET /events/registrations/me
 * View events that the authenticated user is registered for.
 */
router.get('/registrations/me', authenticate, (req, res) => {
  const registrations = events
    .filter((event) => event.participants.some((participant) => participant.userId === req.user.id))
    .map(toPublicEvent);

  return res.status(200).json({ registrations });
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
    event: toPublicEvent(event),
  });
});

/**
 * DELETE /events/:id/register
 * Cancel the authenticated user's registration for an event.
 */
router.delete('/:id/register', authenticate, (req, res) => {
  const event = events.find((e) => e.id === req.params.id);
  if (!event) {
    return res.status(404).json({ message: 'Event not found' });
  }

  const participantIndex = event.participants.findIndex((participant) => participant.userId === req.user.id);
  if (participantIndex === -1) {
    return res.status(409).json({ message: 'You are not registered for this event' });
  }

  event.participants.splice(participantIndex, 1);

  return res.status(200).json({
    message: 'Registration cancelled successfully',
    event: toPublicEvent(event),
  });
});

module.exports = router;

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { randomUUID } = require('crypto');
const { users } = require('../store');
const { JWT_SECRET } = require('../middleware/auth');
const { sendRegistrationEmail } = require('../services/emailService');

const router = express.Router();

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later' },
});

/**
 * POST /register
 * Register a new user (role: 'organizer' or 'attendee').
 */
router.post('/register', authRateLimiter, async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
  }

  const validRoles = ['organizer', 'attendee'];
  const userRole = validRoles.includes(role) ? role : 'attendee';

  const existing = users.find((u) => u.email === email);
  if (existing) {
    return res.status(409).json({ message: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: randomUUID(),
    name,
    email,
    passwordHash,
    role: userRole,
  };
  users.push(user);

  // Send confirmation email asynchronously (non-blocking)
  sendRegistrationEmail(email, name).catch((err) => {
    console.error('Failed to send registration email:', err.message);
  });

  return res.status(201).json({
    message: 'User registered successfully',
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

/**
 * POST /login
 * Authenticate a user and return a JWT token.
 */
router.post('/login', authRateLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = users.find((u) => u.email === email);
  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  return res.status(200).json({
    message: 'Login successful',
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

module.exports = router;

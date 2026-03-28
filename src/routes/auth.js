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

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function normalizeName(name) {
  return typeof name === 'string' ? name.trim() : '';
}

function normalizeRole(role) {
  if (typeof role !== 'string') {
    return 'attendee';
  }

  const normalized = role.trim().toLowerCase();
  return ['organizer', 'attendee'].includes(normalized) ? normalized : 'attendee';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * POST /register
 * Register a new user (role: 'organizer' or 'attendee').
 */
router.post('/register', authRateLimiter, async (req, res) => {
  const { name, email, password, role } = req.body;
  const normalizedName = normalizeName(name);
  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = normalizeRole(role);
  const normalizedPassword = typeof password === 'string' ? password : '';

  if (!normalizedName || !normalizedEmail || !normalizedPassword) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
  }

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ message: 'A valid email address is required' });
  }

  if (normalizedPassword.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long' });
  }

  const existing = users.find((u) => u.email === normalizedEmail);
  if (existing) {
    return res.status(409).json({ message: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(normalizedPassword, 10);
  const user = {
    id: randomUUID(),
    name: normalizedName,
    email: normalizedEmail,
    passwordHash,
    role: normalizedRole,
  };
  users.push(user);

  // Send confirmation email asynchronously (non-blocking)
  sendRegistrationEmail(normalizedEmail, normalizedName).catch((err) => {
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
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = typeof password === 'string' ? password : '';

  if (!normalizedEmail || !normalizedPassword) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = users.find((u) => u.email === normalizedEmail);
  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const passwordMatch = await bcrypt.compare(normalizedPassword, user.passwordHash);
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

const jwt = require('jsonwebtoken');

const isTestEnv = process.env.NODE_ENV === 'test';
const JWT_SECRET = process.env.JWT_SECRET || (isTestEnv ? 'test_jwt_secret' : null);

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable must be set');
}

/**
 * Middleware to authenticate requests using JWT Bearer tokens.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization token required' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/**
 * Middleware to restrict access to organizer-role users only.
 */
function requireOrganizer(req, res, next) {
  if (req.user && req.user.role === 'organizer') {
    return next();
  }
  return res.status(403).json({ message: 'Access restricted to organizers only' });
}

module.exports = { authenticate, requireOrganizer, JWT_SECRET };

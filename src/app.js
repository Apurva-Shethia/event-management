const express = require('express');
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');

const app = express();

app.use(express.json());

app.use(authRoutes);
app.use('/events', eventRoutes);

// Health check
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

module.exports = app;

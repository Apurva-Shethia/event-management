const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

/**
 * Send a registration confirmation email to the user.
 * @param {string} to - Recipient email address
 * @param {string} name - Recipient name
 * @returns {Promise<void>}
 */
async function sendRegistrationEmail(to, name) {
  const mailOptions = {
    from: process.env.SMTP_FROM || 'no-reply@event-management.local',
    to,
    subject: 'Welcome to Event Management Platform',
    text: `Hello ${name},\n\nYour registration was successful. Welcome to the Event Management Platform!\n\nBest regards,\nEvent Management Team`,
    html: `<p>Hello <strong>${name}</strong>,</p><p>Your registration was successful. Welcome to the Event Management Platform!</p><p>Best regards,<br>Event Management Team</p>`,
  };

  await transporter.sendMail(mailOptions);
}

/**
 * Send an event registration confirmation email.
 * @param {string} to - Recipient email address
 * @param {string} name - Recipient name
 * @param {object} event - Event object
 * @returns {Promise<void>}
 */
async function sendEventRegistrationEmail(to, name, event) {
  const mailOptions = {
    from: process.env.SMTP_FROM || 'no-reply@event-management.local',
    to,
    subject: `Event Registration Confirmed: ${event.title}`,
    text: `Hello ${name},\n\nYou have successfully registered for the event "${event.title}" on ${event.date} at ${event.time}.\n\nDescription: ${event.description}\n\nBest regards,\nEvent Management Team`,
    html: `<p>Hello <strong>${name}</strong>,</p><p>You have successfully registered for the event <strong>${event.title}</strong> on ${event.date} at ${event.time}.</p><p>${event.description}</p><p>Best regards,<br>Event Management Team</p>`,
  };

  await transporter.sendMail(mailOptions);
}

module.exports = { sendRegistrationEmail, sendEventRegistrationEmail };

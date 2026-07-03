import express from 'express';
import crypto from 'crypto';
import User from '../models/User.js';
import { signToken } from '../utils/jwt.js';
import { protect } from '../middleware/auth.js';
import { sendMail, isSmtpConfigured } from '../utils/mailer.js';

const router = express.Router();

function publicUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    branch: user.branch,
    phone: user.phone,
    whatsapp: user.whatsapp,
    employeeId: user.employeeId,
    designation: user.designation,
    workStatus: user.workStatus,
    status: user.status,
    avatar: user.avatar || '',
    reportingManager: user.reportingManager
  };
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email || '').toLowerCase() }).select('+password');
  if (!user || !(await user.matchPassword(password))) return res.status(401).json({ message: 'Invalid email or password' });
  if (user.status !== 'active') return res.status(403).json({ message: 'Your account is inactive. Contact admin.' });
  user.lastLoginAt = new Date();
  await user.save();
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', protect, async (req, res) => {
  const user = await User.findById(req.user._id).populate('reportingManager', 'name email role department');
  res.json({ user: publicUser(user) });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: String(email || '').toLowerCase() }).select('+passwordResetToken +passwordResetExpires');
  if (!user) return res.json({ message: 'If the email exists, a password reset link has been sent.' });

  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashed = crypto.createHash('sha256').update(rawToken).digest('hex');
  user.passwordResetToken = hashed;
  user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
  await user.save();

  const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${rawToken}`;
  const result = await sendMail({
    to: user.email,
    subject: 'Takora Mart Task System - Reset Password',
    text: `Reset your Takora Mart Task System password using this link: ${resetLink}`,
    html: `<h2>Takora Mart Task System</h2><p>Click below to reset your password. This link expires in 30 minutes.</p><p><a href="${resetLink}">Reset Password</a></p><p>${resetLink}</p>`
  });

  res.json({
    message: isSmtpConfigured() ? 'Password reset link sent to email.' : 'SMTP not configured. Reset link printed in backend terminal and returned for development.',
    devResetLink: isSmtpConfigured() ? undefined : resetLink,
    mail: result
  });
});

router.post('/reset-password/:token', async (req, res) => {
  const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const user = await User.findOne({ passwordResetToken: hashed, passwordResetExpires: { $gt: new Date() } }).select('+passwordResetToken +passwordResetExpires +password');
  if (!user) return res.status(400).json({ message: 'Reset link is invalid or expired' });
  if (!req.body.password || req.body.password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
  user.password = req.body.password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  res.json({ message: 'Password reset successful. Please login.' });
});

export default router;

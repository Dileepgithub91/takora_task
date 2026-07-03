import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { sendMail } from './mailer.js';

export async function notifyUser({ userId, title, message, type = 'system', refType = '', refId = null, channels = ['dashboard'] }) {
  const user = await User.findById(userId);
  if (!user) return null;
  const notification = await Notification.create({ user: user._id, title, message, type, refType, refId, channels });

  const deliveryLog = [];
  if (channels.includes('email') && process.env.ENABLE_EMAIL !== 'false' && user.email) {
    try {
      const result = await sendMail({ to: user.email, subject: title, text: message, html: `<p>${message}</p>` });
      deliveryLog.push({ channel: 'email', status: result.sent ? 'sent' : 'dev-mode', detail: result.message || 'Email processed' });
    } catch (err) {
      deliveryLog.push({ channel: 'email', status: 'failed', detail: err.message });
    }
  }
  if (channels.includes('whatsapp') && process.env.ENABLE_WHATSAPP_MOCK !== 'false') {
    deliveryLog.push({ channel: 'whatsapp', status: 'mock', detail: `Mock WhatsApp to ${user.whatsapp || user.phone || user.email}` });
  }
  if (channels.includes('sms') && process.env.ENABLE_SMS_MOCK !== 'false') {
    deliveryLog.push({ channel: 'sms', status: 'mock', detail: `Mock SMS to ${user.phone || user.email}` });
  }
  notification.deliveryLog = deliveryLog;
  notification.delivered = deliveryLog.some(l => ['sent', 'mock', 'dev-mode'].includes(l.status));
  await notification.save();
  return notification;
}

export async function notifyMany(userIds, payload) {
  return Promise.all([...new Set(userIds.map(String))].map(id => notifyUser({ userId: id, ...payload })));
}

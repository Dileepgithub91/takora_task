import express from 'express';
import Ticket from '../models/Ticket.js';
import { protect, readOnlyBlock } from '../middleware/auth.js';
import { accessibleUserIds } from '../utils/accessControl.js';
import { notifyMany, notifyUser } from '../utils/notifications.js';

const router = express.Router();
router.use(protect);

function canView(reqUser, ticket, ids) {
  if (['admin', 'auditor'].includes(reqUser.role)) return true;
  if (String(ticket.createdBy?._id || ticket.createdBy) === String(reqUser._id)) return true;
  if (String(ticket.assignedTo?._id || ticket.assignedTo) === String(reqUser._id)) return true;
  return ids.includes(String(ticket.assignedTo?._id || ticket.assignedTo));
}

function canDelete(reqUser, ticket) {
  if (reqUser.role === 'admin') return true;
  return String(ticket.createdBy?._id || ticket.createdBy) === String(reqUser._id);
}

router.get('/', async (req, res) => {
  const ids = await accessibleUserIds(req.user);
  const q = ['admin', 'auditor'].includes(req.user.role) ? {} : { $or: [{ assignedTo: { $in: ids } }, { createdBy: req.user._id }] };
  ['status', 'priority', 'source', 'category', 'department'].forEach(k => { if (req.query[k]) q[k] = req.query[k]; });
  const tickets = await Ticket.find(q).populate('assignedTo createdBy comments.user activityLog.actor', 'name email role department').sort({ createdAt: -1 });
  res.json({ tickets });
});

router.post('/', readOnlyBlock, async (req, res) => {
  const count = await Ticket.countDocuments();
  const ticket = await Ticket.create({
    ticketNo: `TKR-${String(count + 1).padStart(5, '0')}`,
    source: req.body.source || 'internal',
    requesterName: req.body.requesterName || '',
    requesterEmail: req.body.requesterEmail || '',
    requesterPhone: req.body.requesterPhone || '',
    title: req.body.title,
    description: req.body.description || '',
    category: req.body.category || 'other',
    priority: req.body.priority || 'medium',
    status: req.body.status || 'open',
    department: req.body.department || req.user.department || 'Customer Support',
    assignedTo: req.body.assignedTo || req.user._id,
    createdBy: req.user._id,
    slaDueDate: req.body.slaDueDate || new Date(Date.now() + 24 * 60 * 60 * 1000),
    activityLog: [{ actor: req.user._id, action: 'Ticket Created', detail: 'Ticket raised' }]
  });
  if (ticket.assignedTo) await notifyUser({ userId: ticket.assignedTo, title: 'New Ticket Assigned', message: `${ticket.ticketNo}: ${ticket.title}`, type: 'ticket', refType: 'Ticket', refId: ticket._id, channels: ['dashboard', 'email'] });
  res.status(201).json({ ticket: await Ticket.findById(ticket._id).populate('assignedTo createdBy', 'name email role department') });
});

router.get('/:id', async (req, res) => {
  const ticket = await Ticket.findById(req.params.id).populate('assignedTo createdBy comments.user activityLog.actor', 'name email role department');
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  const ids = await accessibleUserIds(req.user);
  if (!canView(req.user, ticket, ids)) return res.status(403).json({ message: 'Permission denied' });
  res.json({ ticket });
});

router.put('/:id', readOnlyBlock, async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  const ids = await accessibleUserIds(req.user);
  if (!canView(req.user, ticket, ids)) return res.status(403).json({ message: 'Permission denied' });
  ['source','requesterName','requesterEmail','requesterPhone','title','description','category','priority','status','department','assignedTo','slaDueDate'].forEach(k => {
    if (req.body[k] !== undefined) ticket[k] = req.body[k];
  });
  ticket.activityLog.push({ actor: req.user._id, action: 'Ticket Updated', detail: 'Ticket updated' });
  await ticket.save();
  const recipients = [ticket.assignedTo, ticket.createdBy].filter(Boolean).map(String).filter(id => id !== String(req.user._id));
  await notifyMany(recipients, { title: 'Ticket Updated', message: `${ticket.ticketNo}: ${ticket.title}`, type: 'ticket', refType: 'Ticket', refId: ticket._id, channels: ['dashboard'] });
  res.json({ ticket: await Ticket.findById(ticket._id).populate('assignedTo createdBy comments.user activityLog.actor', 'name email role department') });
});

router.post('/:id/comments', readOnlyBlock, async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  const ids = await accessibleUserIds(req.user);
  if (!canView(req.user, ticket, ids)) return res.status(403).json({ message: 'Permission denied' });
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ message: 'Comment message required' });
  ticket.comments.push({ user: req.user._id, message });
  ticket.activityLog.push({ actor: req.user._id, action: 'Ticket Comment', detail: message });
  await ticket.save();
  const recipients = [ticket.assignedTo, ticket.createdBy].filter(Boolean).map(String).filter(id => id !== String(req.user._id));
  await notifyMany(recipients, { title: 'New Ticket Comment', message, type: 'comment', refType: 'Ticket', refId: ticket._id, channels: ['dashboard'] });
  res.status(201).json({ ticket: await Ticket.findById(ticket._id).populate('assignedTo createdBy comments.user activityLog.actor', 'name email role department') });
});

router.delete('/:id', readOnlyBlock, async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  if (!canDelete(req.user, ticket)) return res.status(403).json({ message: 'Only admin or ticket creator can delete. Ticket receiver cannot delete.' });
  await ticket.deleteOne();
  res.json({ message: 'Ticket deleted' });
});

export default router;

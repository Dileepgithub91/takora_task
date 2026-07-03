import express from 'express';
import User from '../models/User.js';
import Task from '../models/Task.js';
import { protect, readOnlyBlock } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { accessibleUserIds, canManageUser, canViewUser } from '../utils/accessControl.js';
import { notifyUser } from '../utils/notifications.js';

const router = express.Router();
router.use(protect);

function safeUser(u) {
  const obj = u.toObject ? u.toObject() : u;
  delete obj.password;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  return obj;
}

function publicAssignableUser(u) {
  return {
    _id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    department: u.department,
    branch: u.branch,
    designation: u.designation,
    employeeId: u.employeeId,
    phone: u.phone,
    whatsapp: u.whatsapp,
    avatar: u.avatar,
    workStatus: u.workStatus,
    status: u.status
  };
}

router.get('/assignable', async (req, res) => {
  const users = await User.find({ status: 'active' })
    .select('_id name email role department branch designation employeeId phone whatsapp avatar workStatus status')
    .sort({ role: 1, department: 1, name: 1 });
  res.json({ users: users.map(publicAssignableUser) });
});

router.get('/', async (req, res) => {
  const ids = await accessibleUserIds(req.user);
  const query = req.user.role === 'admin' || req.user.role === 'auditor' ? {} : { _id: { $in: ids } };
  if (req.query.role) query.role = req.query.role;
  if (req.query.department) query.department = req.query.department;
  if (req.query.status) query.status = req.query.status;
  const users = await User.find(query).populate('reportingManager', 'name email role').sort({ role: 1, name: 1 });
  res.json({ users: users.map(safeUser) });
});

router.get('/summary', async (req, res) => {
  const ids = await accessibleUserIds(req.user);
  const query = req.user.role === 'admin' || req.user.role === 'auditor' ? {} : { _id: { $in: ids } };
  const users = await User.find(query).select('_id name email role department status workStatus designation phone whatsapp reportingManager branch employeeId avatar');
  const taskAgg = await Task.aggregate([
    { $match: { assignedTo: { $in: users.map(u => u._id) } } },
    { $group: { _id: '$assignedTo', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, overdue: { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] } } } }
  ]);
  const map = new Map(taskAgg.map(a => [String(a._id), a]));
  res.json({ users: users.map(u => ({ ...safeUser(u), taskSummary: map.get(String(u._id)) || { total: 0, completed: 0, overdue: 0 } })) });
});

router.put('/me', readOnlyBlock, upload.single('avatar'), async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  ['name', 'phone', 'whatsapp', 'designation', 'workStatus'].forEach(f => {
    if (req.body[f] !== undefined) user[f] = req.body[f];
  });
  if (req.file) user.avatar = `/uploads/${req.file.filename}`;
  await user.save();
  res.json({ user: safeUser(user) });
});

router.get('/:id', async (req, res) => {
  const user = await User.findById(req.params.id).populate('reportingManager', 'name email role');
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (!(await canViewUser(req.user, user))) return res.status(403).json({ message: 'Permission denied' });
  const taskSummary = await Task.aggregate([
    { $match: { assignedTo: user._id } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  res.json({ user: safeUser(user), taskSummary });
});

router.post('/', readOnlyBlock, async (req, res) => {
  if (!(await canManageUser(req.user))) return res.status(403).json({ message: 'Only admin/manager/team lead can add team members' });
  const allowedRolesByCreator = {
    admin: ['admin', 'manager', 'teamLead', 'employee', 'support', 'auditor'],
    manager: ['teamLead', 'employee', 'support'],
    teamLead: ['employee', 'support']
  };
  const role = req.body.role || 'employee';
  if (!allowedRolesByCreator[req.user.role]?.includes(role)) return res.status(403).json({ message: 'You cannot create this role' });
  const user = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password || 'Admin@123',
    phone: req.body.phone || '',
    whatsapp: req.body.whatsapp || '',
    employeeId: req.body.employeeId || '',
    role,
    department: req.body.department || req.user.department || 'General',
    branch: req.body.branch || req.user.branch || 'Thrissur',
    designation: req.body.designation || '',
    reportingManager: req.body.reportingManager || (req.user.role !== 'admin' ? req.user._id : null),
    status: req.body.status || 'active',
    workStatus: req.body.workStatus || 'available'
  });
  await notifyUser({ userId: user._id, title: 'Welcome to Takora Mart Task System', message: `Your account has been created. Email: ${user.email}`, type: 'system', channels: ['dashboard', 'email'] });
  res.status(201).json({ user: safeUser(user) });
});

router.put('/:id', readOnlyBlock, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (!(await canManageUser(req.user, user))) return res.status(403).json({ message: 'Permission denied' });
  const fields = ['name', 'phone', 'whatsapp', 'employeeId', 'role', 'department', 'branch', 'designation', 'reportingManager', 'status', 'workStatus', 'avatar'];
  fields.forEach(f => {
    if (req.body[f] !== undefined) user[f] = req.body[f] || (f === 'reportingManager' ? null : req.body[f]);
  });
  if (req.body.password) user.password = req.body.password;
  await user.save();
  res.json({ user: safeUser(user) });
});

router.delete('/:id', readOnlyBlock, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (!(await canManageUser(req.user, user))) return res.status(403).json({ message: 'Permission denied' });
  user.status = 'inactive';
  await user.save();
  res.json({ message: 'User deactivated', user: safeUser(user) });
});

export default router;

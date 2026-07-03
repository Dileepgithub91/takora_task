import express from 'express';
import Document from '../models/Document.js';
import { protect, readOnlyBlock } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();
router.use(protect);

router.get('/', async (req, res) => {
  const q = {};
  if (req.query.category) q.category = req.query.category;
  if (req.user.role === 'employee') q.$or = [{ department: 'All' }, { department: req.user.department }];
  const documents = await Document.find(q).populate('uploadedBy', 'name email role').sort({ createdAt: -1 });
  res.json({ documents });
});

router.post('/', readOnlyBlock, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'File is required' });
  const document = await Document.create({
    title: req.body.title || req.file.originalname,
    category: req.body.category || 'Other',
    description: req.body.description || '',
    filename: req.file.filename,
    originalName: req.file.originalname,
    path: `/uploads/${req.file.filename}`,
    mimetype: req.file.mimetype,
    size: req.file.size,
    department: req.body.department || 'All',
    uploadedBy: req.user._id
  });
  res.status(201).json({ document });
});

router.delete('/:id', readOnlyBlock, async (req, res) => {
  if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ message: 'Permission denied' });
  await Document.findByIdAndDelete(req.params.id);
  res.json({ message: 'Document deleted' });
});

export default router;

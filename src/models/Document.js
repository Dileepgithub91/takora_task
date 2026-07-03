import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, enum: ['SOP', 'Product Rules', 'Vendor Agreement', 'Invoice', 'Screenshot', 'Company Document', 'Other'], default: 'Other' },
  description: { type: String, default: '' },
  filename: String,
  originalName: String,
  path: String,
  mimetype: String,
  size: Number,
  department: { type: String, default: 'All' },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export default mongoose.model('Document', documentSchema);

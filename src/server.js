import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

import { connectDB } from './config/db.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import taskRoutes from './routes/task.routes.js';
import ticketRoutes from './routes/ticket.routes.js';
import reportRoutes from './routes/report.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import departmentRoutes from './routes/department.routes.js';
import documentRoutes from './routes/document.routes.js';
import templateRoutes from './routes/template.routes.js';
import automationRoutes from './routes/automation.routes.js';

import { runAutomation } from './utils/automation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await connectDB();

const app = express();

console.log('Latest server.js loaded with root health route');

const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true
  })
);

app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

/* Render Root / Health Routes */
app.all(['/', '/api', '/health', '/api/health'], (req, res) => {
  res.status(200).json({
    message: 'Takora Mart API Is Running',
    status: 'success',
    service: 'Takora Mart Task Management API'
  });
});

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

/* Static Uploads */
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* API Routes */
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/automation', automationRoutes);

/* Error Handlers - Always Keep Last */
app.use(notFound);
app.use(errorHandler);

const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`Takora Mart API server running on port ${port}`);
});

/* Runs official SLA checks automatically. Use ENABLE_AUTOMATION=false to disable. */
if (process.env.ENABLE_AUTOMATION !== 'false') {
  setInterval(() => {
    runAutomation().catch(err => {
      console.error('Automation error:', err.message);
    });
  }, 5 * 60 * 1000);
}
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import conversationRoutes from './routes/conversationRoutes';
import messageRoutes from './routes/messageRoutes';

import fs from 'fs';

const app = express();

// Security and middleware
app.use(
  helmet({
    crossOriginResourcePolicy: false, // Allow APK binary downloads across origins
  })
);
app.use(
  cors({
    origin: '*', // Allows Capacitor and web clients
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Explicit Update Manifest Endpoint (Disable aggressive CDN caching)
app.get('/update/latest.json', (req: Request, res: Response, next: NextFunction) => {
  const possiblePaths = [
    path.resolve(__dirname, '../public/update/latest.json'),
    path.resolve(__dirname, '../../update/latest.json'),
  ];

  for (const manifestPath of possiblePaths) {
    if (fs.existsSync(manifestPath)) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.sendFile(manifestPath);
    }
  }
  next();
});

// Explicit APK Releases Endpoint (MIME type for Android package installer)
app.get('/releases/:filename', (req: Request, res: Response, next: NextFunction) => {
  const filename = typeof req.params.filename === 'string' ? req.params.filename : 'app-debug.apk';
  const possiblePaths = [
    path.resolve(__dirname, '../public/releases', filename),
    path.resolve(__dirname, '../../frontend/android/app/build/outputs/apk/debug', filename),
    path.resolve(__dirname, '../public/releases/app-debug.apk'),
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Accept-Ranges', 'bytes');
      return res.sendFile(filePath);
    }
  }
  next();
});

// Static fallbacks
app.use('/update', express.static(path.resolve(__dirname, '../public/update')));
app.use('/releases', express.static(path.resolve(__dirname, '../public/releases')));
app.use('/update', express.static(path.resolve(__dirname, '../../update')));
app.use('/releases', express.static(path.resolve(__dirname, '../../frontend/android/app/build/outputs/apk/debug')));

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'online',
    app: 'Kotha Hobe API',
    timestamp: new Date().toISOString(),
  });
});

import devRoutes from './routes/devRoutes';

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/dev', devRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[Unhandled Error]:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

export default app;

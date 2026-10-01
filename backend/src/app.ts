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

// Universal Web & Deep Link Landing Page for Group Invites
app.get('/join/:inviteCode', async (req: Request, res: Response) => {
  const inviteCode = typeof req.params.inviteCode === 'string' ? req.params.inviteCode : '';
  
  let groupName = 'Kotha Hobe Group';
  let description = "You've been invited to join a group chat on Kotha Hobe!";
  let avatarUrl = '';
  let memberCount = 0;

  try {
    const { Conversation } = await import('./models/Conversation');
    const group = await Conversation.findOne({ 'groupMeta.inviteCode': inviteCode, isGroup: true }).select('groupMeta participants');
    if (group && group.groupMeta) {
      groupName = group.groupMeta.name || 'Kotha Hobe Group';
      description = group.groupMeta.description?.text || `Join "${groupName}" with ${group.participants?.length || 0} other members on Kotha Hobe.`;
      avatarUrl = group.groupMeta.avatarUrl || '';
      memberCount = group.participants?.length || 0;
    }
  } catch (err) {
    console.warn('[JoinLanding] Error resolving group:', err);
  }

  const appSchemeUrl = `kothahobe://join/${inviteCode}`;
  const playStoreOrApkUrl = 'https://kotha-hobe-api.onrender.com/releases/app-debug.apk';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Join ${encodeURIComponent(groupName)} - Kotha Hobe</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="Join ${encodeURI(groupName)} on Kotha Hobe">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://kotha-hobe-api.onrender.com/join/${inviteCode}">
  ${avatarUrl ? `<meta property="og:image" content="${avatarUrl}">` : ''}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: #0b1120; color: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 24px; max-width: 420px; width: 100%; padding: 32px 24px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
    .avatar-wrapper { width: 96px; height: 96px; margin: 0 auto 20px; border-radius: 24px; background: #0f172a; border: 3px solid #0284c7; overflow: hidden; display: flex; align-items: center; justify-content: center; }
    .avatar-img { width: 100%; height: 100%; object-fit: cover; }
    .avatar-placeholder { font-size: 36px; font-weight: 700; color: #38bdf8; }
    h1 { font-size: 22px; font-weight: 800; color: #ffffff; margin-bottom: 8px; }
    .meta { font-size: 13px; color: #94a3b8; margin-bottom: 16px; font-weight: 500; }
    .desc { font-size: 14px; color: #cbd5e1; line-height: 1.5; margin-bottom: 28px; word-break: break-word; }
    .btn-primary { display: block; width: 100%; padding: 14px 20px; background: #0284c7; color: white; text-decoration: none; border-radius: 16px; font-size: 16px; font-weight: 700; margin-bottom: 12px; transition: all 0.2s; box-shadow: 0 4px 14px 0 rgba(2, 132, 199, 0.39); }
    .btn-primary:active { transform: scale(0.98); background: #0369a1; }
    .btn-secondary { display: block; width: 100%; padding: 12px 20px; background: transparent; color: #38bdf8; text-decoration: none; border: 1px solid #0284c7; border-radius: 16px; font-size: 14px; font-weight: 600; transition: all 0.2s; }
    .footer { margin-top: 24px; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="avatar-wrapper">
      ${avatarUrl ? `<img src="${avatarUrl}" alt="${groupName}" class="avatar-img">` : `<div class="avatar-placeholder">👥</div>`}
    </div>
    <h1>${groupName}</h1>
    <div class="meta">${memberCount > 0 ? `${memberCount} active members` : 'Group Invitation'}</div>
    <div class="desc">${description}</div>
    
    <a href="${appSchemeUrl}" class="btn-primary" id="open-app-btn">Open in Kotha Hobe</a>
    <a href="${playStoreOrApkUrl}" class="btn-secondary">Download Kotha Hobe APK</a>
    
    <div class="footer">Kotha Hobe • Instant, Secure & Modern Communication</div>
  </div>

  <script>
    // Automatically attempt to launch native Android app via custom scheme
    window.onload = function() {
      var schemeUrl = "${appSchemeUrl}";
      window.location.href = schemeUrl;
    };
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

import devRoutes from './routes/devRoutes';
import callRoutes from './routes/callRoutes';
import groupRoutes from './routes/groupRoutes';
import storyRoutes from './routes/storyRoutes';
import searchRoutes from './routes/searchRoutes';
import mediaRoutes from './routes/mediaRoutes';
import { OrphanCleanupService } from './services/storage/orphanCleanupService';

// Initialize background orphan cleanup worker
OrphanCleanupService.startWorker();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/search', searchRoutes);
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

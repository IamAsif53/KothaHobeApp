import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateToken } from '../middleware/authMiddleware';
import { isFirebaseReady } from '../config/firebaseAdmin';
import { sendPushNotification } from '../services/notificationService';
import { User } from '../models/User';
import { ENV } from '../config/env';

const router = Router();

router.use(authenticateToken);

// GET /api/dev/push-status - Check FCM setup and user's registered tokens
router.get('/push-status', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const user = await User.findById(req.user._id).select('fcmTokens displayName username');
    const tokenCount = user?.fcmTokens?.length || 0;
    const firebaseReady = isFirebaseReady();

    res.status(200).json({
      success: true,
      firebaseReady,
      projectId: ENV.FIREBASE_PROJECT_ID,
      userTokenCount: tokenCount,
      tokensMasked: user?.fcmTokens?.map((t) => `${t.slice(0, 8)}...${t.slice(-6)}`) || [],
      instructions: !firebaseReady
        ? 'To enable FCM Push Notifications on backend, add FIREBASE_SERVICE_ACCOUNT in your environment or render dashboard.'
        : 'Firebase Admin is fully authenticated and ready for FCM Push dispatch.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to get push status' });
  }
});

// POST /api/dev/call-push-test - Send direct high-priority incoming call push to current user
router.post('/call-push-test', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const user = await User.findById(req.user._id).select('fcmTokens displayName');
    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
      res.status(400).json({
        success: false,
        message: 'No FCM push token registered for your account in MongoDB. Open the app on your physical phone to sync token.',
      });
      return;
    }

    const { sendCallPushNotification } = await import('../services/notificationService');
    const testCallId = `test_diag_call_${Date.now()}`;
    console.log(`[PushTest] Sending incoming call test notification to user ${req.user._id} (callId=${testCallId})...`);

    const result = await sendCallPushNotification({
      recipientId: req.user._id.toString(),
      callerId: req.user._id.toString(),
      callerName: 'Diagnostic Test Caller',
      callId: testCallId,
      conversationId: 'test_diag_conversation',
      callType: 'voice',
    });

    res.status(200).json({
      success: result.success,
      callId: testCallId,
      result,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to send test call push' });
  }
});

export default router;

import { UploadSession } from '../../models/UploadSession';
import { MediaMetadata } from '../../models/MediaMetadata';
import { MediaStorageService } from './MediaStorageService';

export class OrphanCleanupService {
  private static intervalId: NodeJS.Timeout | null = null;

  /**
   * Starts periodic cleanup worker
   */
  public static startWorker(intervalMs = 3600000): void {
    if (this.intervalId) return;
    console.log('[OrphanCleanupService] Background cleanup worker initialized (interval: 1 hour)');
    this.intervalId = setInterval(() => {
      this.runCleanup().catch((err) => {
        console.error('[OrphanCleanupService] Error during automated cleanup:', err);
      });
    }, intervalMs);
  }

  /**
   * Stops periodic cleanup worker
   */
  public static stopWorker(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[OrphanCleanupService] Background cleanup worker stopped');
    }
  }

  /**
   * Executes single cleanup cycle
   */
  public static async runCleanup(): Promise<{
    expiredSessionsCleaned: number;
    deletedRecordsCleaned: number;
  }> {
    const now = new Date();

    // 1. Purge expired pending upload sessions
    const expiredSessions = await UploadSession.deleteMany({
      status: 'pending',
      expiresAt: { $lt: now },
    });

    // 2. Query soft-deleted media records older than 30 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const softDeleted = await MediaMetadata.find({
      status: 'deleted',
      updatedAt: { $lt: thirtyDaysAgo },
    });

    const storageService = MediaStorageService.getInstance();
    let deletedCount = 0;

    for (const item of softDeleted) {
      try {
        await storageService.delete(item.mediaKey);
        await MediaMetadata.findByIdAndDelete(item._id);
        deletedCount++;
      } catch (err) {
        console.warn(`[OrphanCleanupService] Failed to purge deleted media ${item.mediaKey}:`, err);
      }
    }

    if (expiredSessions.deletedCount > 0 || deletedCount > 0) {
      console.log(
        `[OrphanCleanupService] Cleanup completed: ${expiredSessions.deletedCount} expired sessions, ${deletedCount} soft-deleted records purged.`
      );
    }

    return {
      expiredSessionsCleaned: expiredSessions.deletedCount || 0,
      deletedRecordsCleaned: deletedCount,
    };
  }
}

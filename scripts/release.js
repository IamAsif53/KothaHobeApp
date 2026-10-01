const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

function runCommand(cmd, cwd) {
  console.log(`\n▶ Running: ${cmd}`);
  execSync(cmd, { cwd: cwd || process.cwd(), stdio: 'inherit' });
}

function computeSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const versionPath = path.join(rootDir, 'version.json');
  const manifestPath = path.join(rootDir, 'update', 'latest.json');

  console.log('==================================================');
  console.log('🚀 Kotha Hobe Automated Release Builder');
  console.log('==================================================');

  const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
  const newVersionName = versionData.versionName || '1.1.65';
  const newVersionCode = versionData.versionCode || 110;

  console.log(`Building release: v${newVersionName} (Code ${newVersionCode})`);

  // Ensure version.json is properly formatted
  fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2) + '\n');

  // 1. Build frontend
  runCommand('npm run build', path.join(rootDir, 'frontend'));

  // 2. Sync Capacitor
  runCommand('npx cap sync android', path.join(rootDir, 'frontend'));

  // 3. Build Android APKs via Gradle (Debug for OTA updates + Release)
  const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  runCommand(`${gradlewCmd} assembleDebug assembleRelease`, path.join(rootDir, 'frontend', 'android'));

  // 4. Calculate SHA-256 hash of generated debug APK (used for OTA downloads)
  const apkDebugPath = path.join(
    rootDir,
    'frontend',
    'android',
    'app',
    'build',
    'outputs',
    'apk',
    'debug',
    'app-debug.apk'
  );

  const apkReleasePath = path.join(
    rootDir,
    'frontend',
    'android',
    'app',
    'build',
    'outputs',
    'apk',
    'release',
    'app-release.apk'
  );

  if (!fs.existsSync(apkDebugPath)) {
    throw new Error(`Debug APK file not found at: ${apkDebugPath}`);
  }

  const sha256 = computeSha256(apkDebugPath);
  console.log(`\n✅ Generated APK SHA-256 Checksum (Debug):\n${sha256}`);

  if (fs.existsSync(apkReleasePath)) {
    const sha256Release = computeSha256(apkReleasePath);
    console.log(`✅ Generated APK SHA-256 Checksum (Release):\n${sha256Release}`);
  }

  // 5. Update update/latest.json and backend/public
  const manifestData = {
    versionCode: newVersionCode,
    versionName: newVersionName,
    downloadUrl: `https://kotha-hobe-api.onrender.com/releases/app-debug.apk`,
    sha256: sha256,
    releaseNotes: [
      `Release v${newVersionName} (Build ${newVersionCode})`,
      "⚡ Realtime Sync & 0ms Instant Message Delivery: Resolved Socket.IO event parsing so incoming messages and media updates appear instantly in the chat list without polling or page reloads",
      "📄 Rebuilt File Download UX: Live SVG circular progress indicator showing real byte-level progress directly on document cards with one-tap opening and cancellation",
      "💾 Persistent Local File Cache: Verified local file persistence across app restarts with direct native OS default application opening (PDF, Office, etc.) without repeated downloads or intrusive toasts",
      "🏷️ Canonical Message Previews: Fixed 'Started conversation' placeholder regression for pure media/document/voice messages",
      "👁️ 0ms Read / Seen Latency: Realtime instant read receipts with monotonic status protection preventing status regression"
    ],
    mandatory: false
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2) + '\n');
  console.log(`\n✅ Updated release manifest at: ${manifestPath}`);

  // Copy to backend/public/releases and backend/public/update for cloud hosting
  const backendPublicReleases = path.join(rootDir, 'backend', 'public', 'releases');
  const backendPublicUpdate = path.join(rootDir, 'backend', 'public', 'update');
  fs.mkdirSync(backendPublicReleases, { recursive: true });
  fs.mkdirSync(backendPublicUpdate, { recursive: true });
  fs.copyFileSync(apkDebugPath, path.join(backendPublicReleases, 'app-debug.apk'));
  if (fs.existsSync(apkReleasePath)) {
    fs.copyFileSync(apkReleasePath, path.join(backendPublicReleases, 'app-release.apk'));
  }
  fs.writeFileSync(path.join(backendPublicUpdate, 'latest.json'), JSON.stringify(manifestData, null, 2) + '\n');
  console.log(`✅ Copied APKs & manifest to backend/public for Render static hosting.`);

  // Build backend to ensure dist is up to date
  runCommand('npm run build', path.join(rootDir, 'backend'));

  console.log('\n==================================================');
  console.log('🎉 Release Build Complete!');
  console.log('==================================================');
}

main();

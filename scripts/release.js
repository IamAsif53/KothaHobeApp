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
  const oldVersionName = versionData.versionName;
  const oldVersionCode = versionData.versionCode;

  // Bump version code & name
  const newVersionCode = oldVersionCode + 1;
  const versionParts = oldVersionName.split('.').map(Number);
  versionParts[2] = (versionParts[2] || 0) + 1;
  const newVersionName = versionParts.join('.');

  console.log(`Bumping version: ${oldVersionName} (Code ${oldVersionCode}) → ${newVersionName} (Code ${newVersionCode})`);

  // Update version.json
  versionData.versionName = newVersionName;
  versionData.versionCode = newVersionCode;
  fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2) + '\n');

  // 1. Build frontend
  runCommand('npm run build', path.join(rootDir, 'frontend'));

  // 2. Sync Capacitor
  runCommand('npx cap sync android', path.join(rootDir, 'frontend'));

  // 3. Build Android APK via Gradle
  const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  runCommand(`${gradlewCmd} assembleDebug`, path.join(rootDir, 'frontend', 'android'));

  // 4. Calculate SHA-256 hash of generated APK
  const apkPath = path.join(
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

  if (!fs.existsSync(apkPath)) {
    throw new Error(`APK file not found at: ${apkPath}`);
  }

  const sha256 = computeSha256(apkPath);
  console.log(`\n✅ Generated APK SHA-256 Checksum:\n${sha256}`);

  // 5. Update update/latest.json and backend/public
  const manifestData = {
    versionCode: newVersionCode,
    versionName: newVersionName,
    downloadUrl: `https://kotha-hobe-api.onrender.com/releases/app-debug.apk`,
    sha256: sha256,
    releaseNotes: [
      `Release v${newVersionName} (Build ${newVersionCode})`,
      "📹 Added 1-to-1 WebRTC Video Calling with front/rear camera flip & PiP preview",
      "✨ Dedicated video call interface with camera toggle, mute & speaker controls",
      "📞 Full preservation and stability for high-quality Voice Calling",
      "🔔 Android full-screen heads-up notifications with Accept / Decline for video calls",
      "🔒 Secure WebRTC Unified Plan signaling with STUN/TURN fallback"
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
  fs.copyFileSync(apkPath, path.join(backendPublicReleases, 'app-debug.apk'));
  fs.writeFileSync(path.join(backendPublicUpdate, 'latest.json'), JSON.stringify(manifestData, null, 2) + '\n');
  console.log(`✅ Copied APK & manifest to backend/public for Render static hosting.`);

  console.log('\n==================================================');
  console.log('🎉 Release Build Complete!');
  console.log('==================================================');
  console.log('Next steps to publish to GitHub:');
  console.log(`1. git add .`);
  console.log(`2. git commit -m "Release v${newVersionName}"`);
  console.log(`3. git tag v${newVersionName}`);
  console.log(`4. git push origin main --tags`);
  console.log(`5. Create GitHub Release "v${newVersionName}" and attach file:\n   ${apkPath}`);
}

main();

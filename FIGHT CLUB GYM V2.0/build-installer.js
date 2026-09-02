const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('====================================================');
console.log('   FIGHT CLUB GYM - INSTALLABLE EXE BUILD PIPELINE  ');
console.log('====================================================\n');

const projectRoot = __dirname;
const distDir = path.join(projectRoot, 'dist');
const stagingDir = path.join(distDir, 'staging');
const payloadZip = path.join(distDir, 'payload.zip');
const outputInstaller = path.join(distDir, 'Fight_Club_Gym_Setup.exe');
const rootInstaller = path.join(projectRoot, 'Fight_Club_Gym_Setup.exe');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 1. Generate or verify app.ico
console.log('[1/7] Checking application icon...');
const logoPath = path.join(projectRoot, 'uploads/logo/logo.png');
const icoPath = path.join(projectRoot, 'app.ico');

if (fs.existsSync(logoPath) && !fs.existsSync(icoPath)) {
  try {
    const pngBuffer = fs.readFileSync(logoPath);
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(1, 4);
    const entry = Buffer.alloc(16);
    entry.writeUInt8(0, 0);
    entry.writeUInt8(0, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(pngBuffer.length, 8);
    entry.writeUInt32LE(22, 12);
    const icoBuffer = Buffer.concat([header, entry, pngBuffer]);
    fs.writeFileSync(icoPath, icoBuffer);
    console.log('  ✓ Generated app.ico from logo');
  } catch (e) {
    console.warn('  ! Could not generate icon from logo:', e.message);
  }
} else if (fs.existsSync(icoPath)) {
  console.log('  ✓ app.ico exists');
}

// 2. Locate C# Compiler (csc.exe)
console.log('\n[2/7] Locating C# Compiler (csc.exe)...');
const possibleCscPaths = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
];

let cscPath = possibleCscPaths.find(p => fs.existsSync(p));
if (!cscPath) {
  console.error('  ✗ Error: csc.exe compiler not found in .NET Framework directories.');
  process.exit(1);
}
console.log('  ✓ Found compiler at: ' + cscPath);

// 3. Compile Launcher (Start_Gym.cs -> Fight_Club_Gym.exe)
console.log('\n[3/7] Compiling Application Launcher (Fight_Club_Gym.exe)...');
const launcherCmd = `"${cscPath}" /target:winexe /win32icon:app.ico /out:Fight_Club_Gym.exe Start_Gym.cs`;
try {
  execSync(launcherCmd, { cwd: projectRoot, stdio: 'pipe' });
  console.log('  ✓ Successfully compiled Fight_Club_Gym.exe');
} catch (err) {
  console.error('  ✗ Failed to compile Start_Gym.cs:\n', err.stdout ? err.stdout.toString() : err.message);
  process.exit(1);
}

// 4. Compile Uninstaller (Uninstaller.cs -> Uninstall.exe)
console.log('\n[4/7] Compiling Uninstaller (Uninstall.exe)...');
const uninstallerCmd = `"${cscPath}" /target:winexe /win32icon:app.ico /out:Uninstall.exe Uninstaller.cs`;
try {
  execSync(uninstallerCmd, { cwd: projectRoot, stdio: 'pipe' });
  console.log('  ✓ Successfully compiled Uninstall.exe');
} catch (err) {
  console.error('  ✗ Failed to compile Uninstaller.cs:\n', err.stdout ? err.stdout.toString() : err.message);
  process.exit(1);
}

// 5. Locate node.exe to bundle
console.log('\n[5/7] Preparing application bundle & runtime...');
let systemNodePath = process.execPath;
console.log('  ✓ Using Node.js runtime: ' + systemNodePath);

// Clean up previous staging directory
if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('  -> Copying application launcher and uninstaller...');
fs.copyFileSync(path.join(projectRoot, 'Fight_Club_Gym.exe'), path.join(stagingDir, 'Fight_Club_Gym.exe'));
fs.copyFileSync(path.join(projectRoot, 'Uninstall.exe'), path.join(stagingDir, 'Uninstall.exe'));
fs.copyFileSync(path.join(projectRoot, 'app.ico'), path.join(stagingDir, 'app.ico'));
fs.copyFileSync(path.join(projectRoot, 'package.json'), path.join(stagingDir, 'package.json'));
if (fs.existsSync(path.join(projectRoot, 'Start_Gym.bat'))) {
  fs.copyFileSync(path.join(projectRoot, 'Start_Gym.bat'), path.join(stagingDir, 'Start_Gym.bat'));
}

console.log('  -> Bundling standalone node.exe runtime...');
fs.copyFileSync(systemNodePath, path.join(stagingDir, 'node.exe'));

console.log('  -> Copying server backend files...');
copyRecursive(path.join(projectRoot, 'server'), path.join(stagingDir, 'server'));

console.log('  -> Copying public frontend assets...');
copyRecursive(path.join(projectRoot, 'public'), path.join(stagingDir, 'public'));

console.log('  -> Copying database and schema...');
copyRecursive(path.join(projectRoot, 'db'), path.join(stagingDir, 'db'));

console.log('  -> Copying uploads folder...');
copyRecursive(path.join(projectRoot, 'uploads'), path.join(stagingDir, 'uploads'));

console.log('  -> Copying node_modules dependencies...');
copyRecursive(path.join(projectRoot, 'node_modules'), path.join(stagingDir, 'node_modules'));

// Create empty backups dir in staging
fs.mkdirSync(path.join(stagingDir, 'backups'), { recursive: true });

// 6. Compress staging files into payload.zip
console.log('\n[6/7] Compressing application payload into payload.zip...');
if (fs.existsSync(payloadZip)) {
  fs.unlinkSync(payloadZip);
}

// Compress using PowerShell Compress-Archive or .NET ZipFile
const zipPsCmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem'); [System.IO.Compression.ZipFile]::CreateFromDirectory('${stagingDir.replace(/\\/g, '\\\\')}', '${payloadZip.replace(/\\/g, '\\\\')}', [System.IO.Compression.CompressionLevel]::Optimal, $false);"`;

try {
  execSync(zipPsCmd, { stdio: 'inherit' });
  const zipStats = fs.statSync(payloadZip);
  console.log(`  ✓ Compressed payload created: ${(zipStats.size / (1024 * 1024)).toFixed(2)} MB`);
} catch (err) {
  console.error('  ✗ Failed to compress payload:', err);
  process.exit(1);
}

// 7. Compile Installer.cs into Fight_Club_Gym_Setup.exe with embedded payload
console.log('\n[7/7] Compiling Setup Wizard Installer (Fight_Club_Gym_Setup.exe)...');
const installerCmd = `"${cscPath}" /target:winexe /win32icon:app.ico /reference:System.IO.Compression.FileSystem.dll,System.IO.Compression.dll /resource:"${payloadZip}",FightClubGym.payload.zip /out:"${outputInstaller}" Installer.cs`;

try {
  execSync(installerCmd, { cwd: projectRoot, stdio: 'pipe' });
  console.log('  ✓ Compiled dist/Fight_Club_Gym_Setup.exe successfully!');
  
  // Copy to root directory for easy access
  fs.copyFileSync(outputInstaller, rootInstaller);
  console.log('  ✓ Copied Fight_Club_Gym_Setup.exe to project root.');

  // Clean up temporary files
  console.log('\n[Cleanup] Removing temporary build artifacts...');
  try {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.unlinkSync(payloadZip);
    console.log('  ✓ Cleaned up staging directory and payload.zip');
  } catch (e) {
    console.warn('  ! Cleanup note:', e.message);
  }

  const finalStats = fs.statSync(rootInstaller);
  console.log('\n====================================================');
  console.log('            BUILD COMPLETED SUCCESSFULLY!           ');
  console.log('====================================================');
  console.log(` Installer File: Fight_Club_Gym_Setup.exe`);
  console.log(` Full Location : ${rootInstaller}`);
  console.log(` File Size     : ${(finalStats.size / (1024 * 1024)).toFixed(2)} MB`);
  console.log(` Launcher File : ${path.join(projectRoot, 'Fight_Club_Gym.exe')}`);
  console.log('====================================================\n');
} catch (err) {
  console.error('  ✗ Failed to compile Installer.cs:\n', err.stdout ? err.stdout.toString() : err.message);
  process.exit(1);
}

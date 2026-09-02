const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('--- Building Fight Club Gym Executable ---');

// 1. Generate app.ico from uploads/logo/logo.png
const logoPath = path.join(__dirname, 'uploads/logo/logo.png');
const icoPath = path.join(__dirname, 'app.ico');

if (fs.existsSync(logoPath)) {
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
  console.log('✓ Icon generated: app.ico');
}

// 2. Locate C# compiler csc.exe
const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';

if (!fs.existsSync(cscPath)) {
  console.error('Error: csc.exe compiler not found at ' + cscPath);
  process.exit(1);
}

// 3. Compile Start_Gym.cs into Fight_Club_Gym.exe
const cmd = `"${cscPath}" /target:winexe /win32icon:app.ico /out:Fight_Club_Gym.exe Start_Gym.cs`;
try {
  console.log('Compiling Start_Gym.cs -> Fight_Club_Gym.exe ...');
  execSync(cmd, { cwd: __dirname, stdio: 'inherit' });
  console.log('✓ Build successful! Generated Fight_Club_Gym.exe');
} catch (err) {
  console.error('Compilation failed:', err);
  process.exit(1);
}

import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';

function javaMajor(javaExecutable, environment) {
  const result = spawnSync(javaExecutable, ['-version'], {
    encoding: 'utf8',
    env: environment,
  });
  const versionOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const match = versionOutput.match(/version\s+"(?:1\.)?(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : 0;
}

let environment = { ...process.env };
let javaExecutable = 'java';

if (javaMajor(javaExecutable, environment) < 21 && process.platform === 'darwin') {
  const javaHomeResult = spawnSync('/usr/libexec/java_home', [], { encoding: 'utf8' });
  const javaHome = javaHomeResult.status === 0 ? javaHomeResult.stdout.trim() : '';
  const candidate = javaHome ? join(javaHome, 'bin', 'java') : '';
  if (candidate && javaMajor(candidate, environment) >= 21) {
    environment = {
      ...environment,
      JAVA_HOME: javaHome,
      PATH: `${join(javaHome, 'bin')}${delimiter}${environment.PATH ?? ''}`,
    };
    javaExecutable = candidate;
  }
}

if (javaMajor(javaExecutable, environment) < 21) {
  console.error('Storage rule tests require Java 21 or newer.');
  process.exit(1);
}

const result = spawnSync(
  'firebase',
  [
    'emulators:exec',
    '--project',
    'demo-living-wiki',
    '--only',
    'firestore,storage',
    'node --test tests/storage/avatar-upload.rules.test.mjs',
  ],
  {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);

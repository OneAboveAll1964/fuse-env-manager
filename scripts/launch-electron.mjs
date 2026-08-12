import { spawn } from 'node:child_process';
import waitOn from 'wait-on';
import electronPath from 'electron';

const url = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5178';

await waitOn({ resources: [url], timeout: 60_000 });

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: url,
  },
});

child.on('exit', (code) => process.exit(code ?? 0));

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');

const htmlPath = process.argv[2];
const outPath = process.argv[3];
const SIZE = 1024;

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    useContentSize: true,
    webPreferences: { sandbox: true, contextIsolation: true },
  });

  await win.loadFile(htmlPath);
  await new Promise((r) => setTimeout(r, 500));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  fs.writeFileSync(outPath, image.toPNG());
  win.destroy();
  app.quit();
});

app.on('window-all-closed', () => app.quit());

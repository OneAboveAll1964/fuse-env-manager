import { app, BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from 'electron';

const GITHUB_USER = 'https://github.com/OneAboveAll1964';
const APP_REPO = `${GITHUB_USER}/fuse-env-manager`;
const CLI_REPO = `${GITHUB_USER}/fuse-env-manager-cli`;

export function configureAboutPanel(): void {
  app.setAboutPanelOptions({
    applicationName: 'Fuse',
    applicationVersion: app.getVersion(),
    version: '',
    copyright: '© 2026 OneAboveAll1964 — MIT with attribution',
    credits: 'Encrypted environment variables, everywhere you work.\ngithub.com/OneAboveAll1964',
  });
}

export function buildMenu(options: {
  getWindow: () => BrowserWindow | null;
  onLock: () => void;
  isDev: boolean;
}): void {
  const send = (route: string): void => {
    options.getWindow()?.webContents.send('navigate', route);
  };

  const isMac = process.platform === 'darwin';

  const appMenu: MenuItemConstructorOptions[] = isMac
    ? [
        {
          label: 'Fuse',
          submenu: [
            { label: 'About Fuse', click: () => send('/about') },
            { type: 'separator' },
            {
              label: 'Settings…',
              accelerator: 'CmdOrCtrl+,',
              click: () => send('/settings'),
            },
            {
              label: 'Lock Fuse',
              accelerator: 'CmdOrCtrl+Shift+L',
              click: options.onLock,
            },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
      ]
    : [];

  const template: MenuItemConstructorOptions[] = [
    ...appMenu,
    {
      label: 'File',
      submenu: [
        { label: 'Vault', accelerator: 'CmdOrCtrl+1', click: () => send('/vault') },
        { label: 'Projects', accelerator: 'CmdOrCtrl+2', click: () => send('/projects') },
        { label: 'Search', accelerator: 'CmdOrCtrl+3', click: () => send('/search') },
        { label: 'History', accelerator: 'CmdOrCtrl+4', click: () => send('/history') },
        { type: 'separator' },
        { label: 'Import and export', click: () => send('/transfer') },
        { label: 'Command line', click: () => send('/cli') },
        { type: 'separator' },
        ...(isMac
          ? [{ role: 'close' } as MenuItemConstructorOptions]
          : [
              {
                label: 'Settings',
                accelerator: 'CmdOrCtrl+,',
                click: () => send('/settings'),
              } as MenuItemConstructorOptions,
              {
                label: 'Lock Fuse',
                accelerator: 'CmdOrCtrl+Shift+L',
                click: options.onLock,
              } as MenuItemConstructorOptions,
              { type: 'separator' } as MenuItemConstructorOptions,
              { role: 'quit' } as MenuItemConstructorOptions,
            ]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(options.isDev
          ? ([
              { type: 'separator' },
              { role: 'reload' },
              { role: 'toggleDevTools' },
            ] as MenuItemConstructorOptions[])
          : []),
      ],
    },
    {
      label: 'Window',
      submenu: isMac
        ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
        : [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
    {
      role: 'help',
      submenu: [
        { label: 'About Fuse', click: () => send('/about') },
        { type: 'separator' },
        { label: 'Fuse on GitHub', click: () => void shell.openExternal(APP_REPO) },
        { label: 'The fuse command on GitHub', click: () => void shell.openExternal(CLI_REPO) },
        { label: 'Report a problem', click: () => void shell.openExternal(`${APP_REPO}/issues`) },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

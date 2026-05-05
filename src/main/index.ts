import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { join, extname } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

type SaveDataUrlPayload = {
  dataUrl: string;
  defaultName: string;
  kind: 'jpg' | 'pdf';
};

const imageMimeByExtension: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp'
};

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f6f3eb',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function parseDataUrl(dataUrl: string): Buffer {
  const [, base64] = dataUrl.split(',');
  if (!base64) {
    throw new Error('Invalid data URL.');
  }
  return Buffer.from(base64, 'base64');
}

ipcMain.handle('image:open', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose an image',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const data = await readFile(filePath);
  const extension = extname(filePath).toLowerCase();
  const mime = imageMimeByExtension[extension] ?? 'application/octet-stream';

  return {
    name: filePath.split(/[\\/]/).pop() ?? 'image',
    dataUrl: `data:${mime};base64,${data.toString('base64')}`
  };
});

ipcMain.handle('document:save', async (_event, payload: unknown) => {
  const result = await dialog.showSaveDialog({
    title: 'Save note document',
    defaultPath: 'easy-note-document.json',
    filters: [{ name: 'Easy Note JSON', extensions: ['json'] }]
  });

  if (result.canceled || !result.filePath) {
    return false;
  }

  await writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf-8');
  return true;
});

ipcMain.handle('document:open', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open note document',
    properties: ['openFile'],
    filters: [{ name: 'Easy Note JSON', extensions: ['json'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const content = await readFile(result.filePaths[0], 'utf-8');
  return JSON.parse(content);
});

ipcMain.handle('export:save-data-url', async (_event, payload: SaveDataUrlPayload) => {
  const extension = payload.kind === 'pdf' ? 'pdf' : 'jpg';
  const result = await dialog.showSaveDialog({
    title: payload.kind === 'pdf' ? 'Export PDF' : 'Export JPG',
    defaultPath: payload.defaultName,
    filters: [
      payload.kind === 'pdf'
        ? { name: 'PDF document', extensions: ['pdf'] }
        : { name: 'JPEG image', extensions: ['jpg', 'jpeg'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return false;
  }

  const filePath = result.filePath.endsWith(`.${extension}`)
    ? result.filePath
    : `${result.filePath}.${extension}`;

  await writeFile(filePath, parseDataUrl(payload.dataUrl));
  return true;
});

app.whenReady().then(() => {
  app.setAppUserModelId('com.xfdg.easynote');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

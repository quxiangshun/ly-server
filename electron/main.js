const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow = null;
let caddyProcess = null;

// caddy 目录：开发时相对项目根，打包后相对 exe 所在目录
function getCaddyDir() {
  if (app.isPackaged) {
    return path.join(path.dirname(app.getPath('exe')), 'caddy');
  }
  return path.join(app.getAppPath(), 'caddy');
}

function getCaddyfilePath() {
  return path.join(getCaddyDir(), 'Caddyfile');
}

function getCaddyExePath() {
  return path.join(getCaddyDir(), 'ly-caddy.exe');
}

function getIconPath() {
  const dir = app.isPackaged ? path.join(__dirname, '../dist') : path.join(app.getAppPath(), 'public');
  const candidates = ['favicon.ico', 'icon-512.png', 'icon-192.png'];
  for (const name of candidates) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function createWindow() {
  const iconPath = getIconPath();
  const winOptions = {
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
  if (iconPath) {
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      winOptions.icon = icon;
    } else {
      winOptions.icon = iconPath;
    }
  }
  mainWindow = new BrowserWindow(winOptions);

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const DEFAULT_PORT = 80;

// 从 Caddyfile 内容中解析监听端口（如 :80 { 或 :8080 {）
function parsePort(content) {
  const m = content.match(/:(\d+)\s*\{/);
  return m ? parseInt(m[1], 10) : DEFAULT_PORT;
}

// 从 Caddyfile 内容中解析 root * <path>
function parseRootPath(content) {
  const m = content.match(/root\s+\*\s+(.+)$/m);
  return m ? m[1].trim().replace(/#.*$/, '').trim() : '';
}

// 读取 Caddyfile，返回 root 路径和端口
ipcMain.handle('caddy:readConfig', async () => {
  const filePath = getCaddyfilePath();
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const rootPath = parseRootPath(content);
    const port = parsePort(content);
    return { ok: true, rootPath, port };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 写入 Caddyfile：更新 root 路径和端口
ipcMain.handle('caddy:writeConfig', async (_, rootPath, port) => {
  const filePath = getCaddyfilePath();
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const normalized = (rootPath || './').replace(/\\/g, '/').trim();
    const portNum = parseInt(port, 10) || DEFAULT_PORT;
    content = content.replace(/(root\s+\*)\s+.+$/m, `$1 ${normalized}`);
    content = content.replace(/:(\d+)\s*\{/, `:${portNum} {`);
    fs.writeFileSync(filePath, content, 'utf-8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 选择本地目录（用 getFocusedWindow 确保对话框在正确窗口前显示）
ipcMain.handle('caddy:selectDirectory', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (win && !win.isDestroyed()) win.focus();
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: '选择静态文件根目录',
  });
  if (result.canceled || !result.filePaths.length) {
    return { ok: false, path: null };
  }
  return { ok: true, path: result.filePaths[0] };
});

// 获取 Caddy 运行状态
function getCaddyStatus() {
  return caddyProcess !== null && !caddyProcess.killed;
}

// 启动 Caddy
ipcMain.handle('caddy:start', async () => {
  if (getCaddyStatus()) {
    return { ok: false, error: 'Caddy 已在运行中' };
  }
  const caddyDir = getCaddyDir();
  const exePath = getCaddyExePath();
  if (!fs.existsSync(exePath)) {
    return { ok: false, error: `未找到 ly-caddy.exe: ${exePath}` };
  }
  try {
    caddyProcess = spawn(exePath, ['run', '--config', 'Caddyfile'], {
      cwd: caddyDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    caddyProcess.stdout?.on('data', (data) => {
      mainWindow?.webContents.send('caddy:stdout', data.toString());
    });
    caddyProcess.stderr?.on('data', (data) => {
      mainWindow?.webContents.send('caddy:stderr', data.toString());
    });
    caddyProcess.on('error', (err) => {
      mainWindow?.webContents.send('caddy:error', err.message);
    });
    caddyProcess.on('exit', (code, signal) => {
      caddyProcess = null;
      mainWindow?.webContents.send('caddy:exit', { code, signal });
    });
    return { ok: true, running: true };
  } catch (err) {
    caddyProcess = null;
    return { ok: false, error: err.message };
  }
});

// 停止 Caddy
ipcMain.handle('caddy:stop', async () => {
  if (!getCaddyStatus()) {
    return { ok: false, error: 'Caddy 未在运行' };
  }
  try {
    caddyProcess.kill('SIGTERM');
    caddyProcess = null;
    return { ok: true, running: false };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 重启 Caddy：先停再启（直接复用 start 逻辑）
ipcMain.handle('caddy:restart', async () => {
  if (getCaddyStatus()) {
    caddyProcess.kill('SIGTERM');
    caddyProcess = null;
    await new Promise((r) => setTimeout(r, 800));
  }
  const caddyDir = getCaddyDir();
  const exePath = getCaddyExePath();
  if (!fs.existsSync(exePath)) {
    return { ok: false, error: `未找到 ly-caddy.exe: ${exePath}` };
  }
  try {
    caddyProcess = spawn(exePath, ['run', '--config', 'Caddyfile'], {
      cwd: caddyDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    caddyProcess.stdout?.on('data', (data) => {
      mainWindow?.webContents.send('caddy:stdout', data.toString());
    });
    caddyProcess.stderr?.on('data', (data) => {
      mainWindow?.webContents.send('caddy:stderr', data.toString());
    });
    caddyProcess.on('exit', (code, signal) => {
      caddyProcess = null;
      mainWindow?.webContents.send('caddy:exit', { code, signal });
    });
    return { ok: true, running: true };
  } catch (err) {
    caddyProcess = null;
    return { ok: false, error: err.message };
  }
});

// 获取状态
ipcMain.handle('caddy:status', async () => {
  return { running: getCaddyStatus() };
});

// 选择文件夹
ipcMain.handle('upload:selectFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择要上传到的文件夹',
  });
  if (canceled || !filePaths || filePaths.length === 0) {
    return { ok: false, path: null };
  }
  return { ok: true, path: filePaths[0] };
});

// 列出文件夹中的文件
ipcMain.handle('upload:listFiles', async (_, dirPath) => {
  if (!dirPath || typeof dirPath !== 'string') {
    return { ok: false, error: '请先选择资源路径', files: [] };
  }
  try {
    if (!fs.existsSync(dirPath)) {
      return { ok: false, error: '文件夹不存在', files: [] };
    }
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return { ok: false, error: '路径不是文件夹', files: [] };
    }
    const names = fs.readdirSync(dirPath);
    const files = names.map((name) => {
      const fullPath = path.join(dirPath, name);
      let size = 0;
      let isDir = false;
      try {
        const s = fs.statSync(fullPath);
        isDir = s.isDirectory();
        size = s.size ?? 0;
      } catch (_) {}
      return { name, size, isDir };
    });
    files.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    return { ok: true, files };
  } catch (err) {
    return { ok: false, error: err.message, files: [] };
  }
});

// 将文件写入指定文件夹（files: [{ name, data: ArrayBuffer }]）
ipcMain.handle('upload:writeFiles', async (_, dirPath, files) => {
  if (!dirPath || !files || !Array.isArray(files) || files.length === 0) {
    return { ok: false, error: '请先选择文件夹并选择要上传的文件' };
  }
  try {
    if (!fs.existsSync(dirPath)) {
      return { ok: false, error: '目标文件夹不存在' };
    }
    const written = [];
    for (const f of files) {
      if (!f.name || f.data == null) continue;
      const safeName = path.basename(f.name).replace(/\.\./g, '');
      const targetPath = path.join(dirPath, safeName);
      const buf = Buffer.from(f.data);
      fs.writeFileSync(targetPath, buf);
      written.push(safeName);
    }
    return { ok: true, written, count: written.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (caddyProcess) {
    caddyProcess.kill('SIGTERM');
    caddyProcess = null;
  }
  app.quit();
});

app.on('before-quit', () => {
  if (caddyProcess) {
    caddyProcess.kill('SIGTERM');
  }
});

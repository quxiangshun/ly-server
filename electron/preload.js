const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('caddyAPI', {
  readConfig: () => ipcRenderer.invoke('caddy:readConfig'),
  writeConfig: (rootPath, port) => ipcRenderer.invoke('caddy:writeConfig', rootPath, port),
  selectDirectory: () => ipcRenderer.invoke('caddy:selectDirectory'),
  start: () => ipcRenderer.invoke('caddy:start'),
  stop: () => ipcRenderer.invoke('caddy:stop'),
  restart: () => ipcRenderer.invoke('caddy:restart'),
  status: () => ipcRenderer.invoke('caddy:status'),
  onStdout: (cb) => {
    ipcRenderer.on('caddy:stdout', (_, data) => cb(data));
  },
  onStderr: (cb) => {
    ipcRenderer.on('caddy:stderr', (_, data) => cb(data));
  },
  onExit: (cb) => {
    ipcRenderer.on('caddy:exit', (_, data) => cb(data));
  },
  onError: (cb) => {
    ipcRenderer.on('caddy:error', (_, msg) => cb(msg));
  },
  // 选择文件夹
  selectFolder: () => ipcRenderer.invoke('upload:selectFolder'),
  // 列出文件夹中的文件
  listFiles: (dirPath) => ipcRenderer.invoke('upload:listFiles', dirPath),
  // 上传文件到文件夹 dirPath，files 为 [{ name, data: ArrayBuffer }]
  writeFiles: (dirPath, files) => ipcRenderer.invoke('upload:writeFiles', dirPath, files),
});

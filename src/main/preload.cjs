// Bridge between the sandboxed renderer and the main process.
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const listener = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('api', {
  load: (name) => ipcRenderer.invoke('store:load', name),
  save: (name, data) => ipcRenderer.invoke('store:save', name, data),
  importFile: () => ipcRenderer.invoke('file:import'),
  exportFile: (opts) => ipcRenderer.invoke('file:export', opts),
  notify: (opts) => ipcRenderer.send('notify', opts),
  publishState: (state) => ipcRenderer.send('state', state),
  setMini: (on) => ipcRenderer.send('mini:set', on),
  showMain: () => ipcRenderer.send('window:show'),
  miniAction: (action) => ipcRenderer.send('mini:action', action),
  setOpenAtLogin: (on) => ipcRenderer.invoke('app:login-item', on),
  info: () => ipcRenderer.invoke('app:info'),
  openDataFolder: () => ipcRenderer.send('app:open-data'),
  onAction: on('action'),
  onMiniState: on('mini:state'),
  onResume: on('power:resume'),
});

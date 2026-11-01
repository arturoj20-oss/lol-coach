// Puente seguro entre la interfaz y el proceso principal (contrato en docs/ui-contract.md)
const { contextBridge, ipcRenderer } = require('electron');

// 'tab': true/false mientras se mantiene Tab en el juego (solo lo usa el overlay)
const CHANNELS = ['config', 'state', 'champions', 'recs', 'draft', 'scouting', 'live', 'profile', 'postgame', 'tab', 'otp'];

contextBridge.exposeInMainWorld('api', {
  init: () => ipcRenderer.invoke('init'),
  on: (channel, fn) => {
    if (CHANNELS.includes(channel)) ipcRenderer.on(channel, (_e, data) => fn(data));
  },
  setConfig: patch => ipcRenderer.send('set-config', patch),
  setSecret: (name, value) => ipcRenderer.invoke('set-secret', name, value),
  // Las acciones fallidas se lanzan como Error con el mensaje en espanol
  action: async (name, args) => {
    const res = await ipcRenderer.invoke('action', name, args);
    if (!res.ok) throw new Error(res.error);
    return res.result;
  },
  window: cmd => ipcRenderer.send('window', cmd),
});

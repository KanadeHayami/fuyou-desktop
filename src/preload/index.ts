import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('api', {
  liveState: () => ipcRenderer.invoke('live:state'),
  startLive: (options: unknown) => ipcRenderer.invoke('live:start', options),
  stopLive: () => ipcRenderer.invoke('live:stop'),
  clearLive: () => ipcRenderer.invoke('live:clear'),
  editLive: (value: unknown) => ipcRenderer.invoke('live:edit', value),
  onLive: (callback: (state: unknown) => void) => {
    const listener = (_event: unknown, state: unknown) => callback(state);
    ipcRenderer.on('live:state', listener);
    return () => ipcRenderer.removeListener('live:state', listener);
  },
  overlayState: () => ipcRenderer.invoke('overlay:state'),
  showOverlay: () => ipcRenderer.invoke('overlay:show'),
  hideOverlay: () => ipcRenderer.invoke('overlay:hide'),
  toggleOverlay: () => ipcRenderer.send('overlay:toggle'),
  moveOverlay: (dx: number, dy: number) => ipcRenderer.send('overlay:move', dx, dy),
  onOverlay: (callback: (state: unknown) => void) => {
    const listener = (_event: unknown, state: unknown) => callback(state);
    ipcRenderer.on('overlay:state', listener);
    return () => ipcRenderer.removeListener('overlay:state', listener);
  },
  rosterList: () => ipcRenderer.invoke('roster:list'),
  rosterImport: () => ipcRenderer.invoke('roster:import'),
  rosterSave: (row: unknown) => ipcRenderer.invoke('roster:save', row),
  rosterRemove: (id: string) => ipcRenderer.invoke('roster:remove', id),
  action: (action: string) => { if (['minimize', 'maximize', 'pin', 'close', 'companion', 'layout'].includes(action)) ipcRenderer.send('window:action', action); },
  state: () => ipcRenderer.invoke('window:state'),
  onState: (callback: (state: { pinned: boolean; maximized: boolean }) => void) => {
    const listener = (_event: unknown, state: { pinned: boolean; maximized: boolean }) => callback(state);
    ipcRenderer.on('window:state', listener);
    return () => ipcRenderer.removeListener('window:state', listener);
  },
  copy: (text: string) => ipcRenderer.invoke('clipboard:write', text)
});

import { contextBridge, ipcRenderer } from 'electron';

const api = {
  openImage: () => ipcRenderer.invoke('image:open'),
  saveDocument: (documentData: unknown) => ipcRenderer.invoke('document:save', documentData),
  openDocument: () => ipcRenderer.invoke('document:open'),
  saveDataUrl: (payload: { dataUrl: string; defaultName: string; kind: 'jpg' | 'pdf' }) =>
    ipcRenderer.invoke('export:save-data-url', payload)
};

contextBridge.exposeInMainWorld('easyNote', api);

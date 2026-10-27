'use strict';
const { ipcRenderer } = require('electron');
window.offworkOverlay = {
  close: group => utools.sendToParent('offwork-close', group),
  snooze: group => utools.sendToParent('offwork-snooze', group),
  onClose: callback => ipcRenderer.on('offwork-dismiss', callback)
};

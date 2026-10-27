'use strict';
const core = require('./core.js');
const KEY = 'offwork-settings-v1';
const PREFIX = 'offwork-alarm-';
const SNOOZE = 'offwork-snooze-';
let overlays = [];
let closeTimer = null;
let animationGroup = 0;
let dismissing = false;

function read() {
  return core.normalize(utools.dbStorage.getItem(KEY));
}

function list() {
  return utools.getSchedules().filter(item => item.code.startsWith(PREFIX) || item.code.startsWith(SNOOZE));
}

// 统一释放本次提醒的全部屏幕窗口。
function closeOverlays() {
  clearTimeout(closeTimer);
  overlays.forEach(win => { if (!win.isDestroyed()) win.close(); });
  overlays = [];
}

// 任意屏幕关闭后，通知所有屏幕停止声音、退出动画并统一释放窗口。
function dismissOverlays(group) {
  if (group !== animationGroup || dismissing) return false;
  dismissing = true;
  overlays.forEach(win => { if (!win.isDestroyed()) win.webContents.send('offwork-dismiss'); });
  clearTimeout(closeTimer);
  closeTimer = setTimeout(closeOverlays, 450);
  return true;
}

// 为全部显示器分别创建透明窗口，按各自 DIP 边界覆盖，音频只在鼠标屏播放。
function showAnimation(input, preview) {
  const settings = core.normalize(input || read());
  settings.message = core.message(settings);
  settings.preview = !!preview;
  closeOverlays();
  const group = ++animationGroup;
  dismissing = false;
  const displays = utools.getAllDisplays();
  const current = utools.getDisplayNearestPoint(utools.getCursorScreenPoint());
  const audioIndex = Math.max(0, displays.findIndex(display => display.id === current.id));
  let loaded = 0;
  try {
    displays.forEach((display, index) => {
      const bounds = display.bounds;
      const payload = { ...settings, group, sound: settings.sound && index === audioIndex, voice: settings.voice && index === audioIndex };
      const win = utools.createBrowserWindow(`overlay.html?data=${encodeURIComponent(JSON.stringify(payload))}`, {
        ...bounds, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
        alwaysOnTop: true, skipTaskbar: true, resizable: false, movable: false,
        minimizable: false, maximizable: false, fullscreenable: false, hasShadow: false,
        roundedCorners: false, enableLargerThanScreen: true,
        webPreferences: { preload: 'overlay-preload.js', backgroundThrottling: false }
      }, () => {
        if (group !== animationGroup || dismissing || win.isDestroyed()) return;
        win.setBounds(bounds);
        win.setAlwaysOnTop(true, 'screen-saver');
        loaded++;
        if (loaded === displays.length) {
          overlays.forEach(window => { if (!window.isDestroyed()) window.show(); });
          if (!overlays[audioIndex].isDestroyed()) overlays[audioIndex].focus();
        }
      });
      overlays.push(win);
    });
  } catch (error) {
    closeOverlays();
    throw error;
  }
  // 即使渲染页异常，也确保全屏窗口自动释放。
  closeTimer = setTimeout(closeOverlays, settings.duration * 1000 + 3000);
}

// 请求新任务并核实用户授权后，再替换旧任务，取消时保留原提醒。
async function activate(input) {
  if (typeof utools.requestSchedule !== 'function') throw new Error('定时提醒需要 uTools 8.0 或更新版本');
  const settings = core.normalize(input);
  const code = PREFIX + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  await utools.requestSchedule(core.schedule(settings, code));
  if (!list().some(item => item.code === code)) return { accepted: false };
  utools.dbStorage.setItem(KEY, settings);
  const failed = [];
  list().filter(item => item.code !== code).forEach(item => {
    try { utools.removeSchedule(item.code); } catch (error) { failed.push(item.code); }
  });
  return { accepted: true, warning: failed.length ? '新提醒已启用，但旧任务未完全移除，请在 uTools 定时任务中检查。' : '' };
}

window.offworkNative = {
  read,
  save: input => { const settings = core.normalize(input); utools.dbStorage.setItem(KEY, settings); return settings; },
  list: () => typeof utools.getSchedules === 'function' ? list() : [],
  activate,
  pause: () => { list().forEach(item => utools.removeSchedule(item.code)); },
  preview: input => showAnimation(input, true)
};

utools.onPluginEnter(({ code }) => {
  if (code === 'offwork-preview') {
    utools.hideMainWindow();
    showAnimation(read(), true);
  }
  window.dispatchEvent(new Event('offwork-enter'));
});

if (typeof utools.onScheduleTrigger === 'function') {
  utools.onScheduleTrigger(({ code }) => {
    if (code.startsWith(PREFIX) || code.startsWith(SNOOZE)) showAnimation(read(), false);
  });
}

// 稍后提醒仍由 uTools 托管，关闭主面板后也可以唤起。
const { ipcRenderer } = require('electron');
ipcRenderer.on('offwork-close', (event, group) => dismissOverlays(group));
ipcRenderer.on('offwork-snooze', async (event, group) => {
  if (!dismissOverlays(group)) return;
  try {
    const code = SNOOZE + Date.now();
    await utools.requestSchedule({ code, label: '下班万岁 · 十分钟后提醒', trigger: Date.now() + 10 * 60000 });
    utools.showNotification(list().some(item => item.code === code) ? '好，十分钟后再接你下班。' : '未创建稍后提醒。');
  } catch (error) {
    utools.showNotification('稍后提醒创建失败：' + error.message);
  }
});

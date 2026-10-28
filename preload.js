'use strict';
const core = require('./core.js');
const alarmStore = require('./alarms.js').create(utools.dbStorage, utools);
let activeReminder;
const pendingReminders = [];
const PREFIX = 'offwork-alarm-';
const SNOOZE = 'offwork-snooze-';
let overlays = [];
let closeTimer = null;
let animationGroup = 0;
let dismissing = false;

function read() {
  return alarmStore.read();
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

// 同时到点的提醒按顺序播放，避免后一条覆盖前一条。
function finishAnimation() {
  closeOverlays();
  if (pendingReminders.length) showAnimation(pendingReminders.shift(), false);
}

// 任意屏幕关闭后，通知所有屏幕停止声音、退出动画并统一释放窗口。
function dismissOverlays(group) {
  if (group !== animationGroup || dismissing) return false;
  dismissing = true;
  overlays.forEach(win => { if (!win.isDestroyed()) win.webContents.send('offwork-dismiss'); });
  clearTimeout(closeTimer);
  closeTimer = setTimeout(finishAnimation, 450);
  return true;
}

// 为全部显示器分别创建透明窗口，按各自 DIP 边界覆盖，音频只在鼠标屏播放。
function showAnimation(input, preview) {
  const settings = core.normalize(input || read());
  settings.message = core.message(settings, undefined, alarmStore.categories());
  settings.categoryName = (alarmStore.categories()[settings.category] || {}).name;
  settings.preview = !!preview; activeReminder = settings;
  closeOverlays();
  const group = ++animationGroup;
  dismissing = false;
  const displays = utools.getAllDisplays();
  const current = utools.getDisplayNearestPoint(utools.getCursorScreenPoint());
  const audioIndex = Math.max(0, displays.findIndex(display => display.id === current.id));
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
      });
      overlays.push(win);
      // 透明窗口直接显示，不依赖加载回调，避免页面有声音但窗口一直隐藏。
      win.setBounds(bounds);
      win.setAlwaysOnTop(true, 'screen-saver');
      win.show();
      if (index === audioIndex) win.focus();
    });
  } catch (error) {
    closeOverlays();
    throw error;
  }
  // 即使渲染页异常，也确保全屏窗口自动释放。
  closeTimer = setTimeout(finishAnimation, settings.duration * 1000 + 3000);
}

window.offworkNative = {
  ...alarmStore,
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
    const reminder = alarmStore.resolve(code);
    if (!reminder || !reminder.settings) return;
    if (reminder.settings.mode === 'interval' && !code.startsWith(SNOOZE) && !core.intervalDue(reminder.settings, new Date())) return;
    const settings = { ...reminder.settings, alarmId: reminder.id };
    if (overlays.length) pendingReminders.push(settings);
    else showAnimation(settings, false);
  });
}

// 稍后提醒仍由 uTools 托管，关闭主面板后也可以唤起。
const { ipcRenderer } = require('electron');
ipcRenderer.on('offwork-close', (event, group) => dismissOverlays(group));
ipcRenderer.on('offwork-snooze', async (event, group) => {
  if (!dismissOverlays(group)) return;
  try {
    const code = SNOOZE + Date.now();
    const reminder = { id: activeReminder.alarmId || alarmStore.selected(), settings: activeReminder };
    await utools.requestSchedule({ code, label: '趣味闹钟 · 十分钟后提醒', trigger: Date.now() + 10 * 60000 });
    if (list().some(item => item.code === code)) alarmStore.rememberSnooze(code, reminder);
    utools.showNotification(list().some(item => item.code === code) ? '好，十分钟后再提醒你。' : '未创建稍后提醒。');
  } catch (error) {
    utools.showNotification('稍后提醒创建失败：' + error.message);
  }
});

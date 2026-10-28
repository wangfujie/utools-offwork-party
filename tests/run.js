'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const core = require('../core');
let count = 0;
const tests = [];
function test(name, callback) { tests.push({ name, callback }); }

test('周五下班后应排到下周一', () => {
  const next = core.nextTime(core.defaults, new Date(2026, 9, 23, 18, 1));
  assert.strictEqual(next.getDay(), 1);
  assert.strictEqual(next.getDate(), 26);
  assert.strictEqual(next.getHours(), 18);
});
test('一次性提醒在时间已过时排到明天', () => {
  const next = core.nextTime({ time: '18:00', repeat: 'once' }, new Date(2026, 9, 27, 19));
  assert.strictEqual(next.getDate(), 28);
  assert.strictEqual(next.getHours(), 18);
});
test('自定义星期支持周日且拒绝空集合', () => {
  assert.strictEqual(core.schedule({ time: '09:05', repeat: 'custom', days: [0, 6] }, 'test').trigger.cron, '5 9 * * 0,6');
  assert.throws(() => core.schedule({ repeat: 'custom', days: [] }, 'test'), /至少/);
});
test('每天及工作日的 Cron 与分钟顺序正确', () => {
  assert.strictEqual(core.schedule({ time: '18:30', repeat: 'daily' }, 'test').trigger.cron, '30 18 * * 0,1,2,3,4,5,6');
  assert.strictEqual(core.schedule(core.defaults, 'test').trigger.cron, '0 18 * * 1,2,3,4,5');
});
test('非法配置归一化且自定义文案优先', () => {
  const data = core.normalize({ time: '25:99', duration: -5, dim: 100, accent: 'red', theme: 'missing' });
  assert.strictEqual(data.time, '18:00'); assert.strictEqual(data.duration, 5); assert.strictEqual(data.dim, 90);
  assert.strictEqual(data.accent, core.defaults.accent); assert.strictEqual(data.theme, 'confetti');
  assert.strictEqual(core.message(core.normalize({ quote: '回家吃饭', randomQuote: true })), '回家吃饭');
});
test('随机文案按提醒分类选择，自定义文案仍优先', () => {
  assert.strictEqual(core.message(core.normalize({ category: 'water', randomQuote: true }), 0), core.quoteCategories.water.quotes[0]);
  assert.strictEqual(core.message(core.normalize({ category: 'movement', randomQuote: true }), 0), core.quoteCategories.movement.quotes[0]);
  assert.strictEqual(core.message(core.normalize({ category: 'water', quote: '喝水啦' }), 0), '喝水啦');
});
test('首次使用默认勾选随机文案、提示音和语音，遮罩为70%', () => {
  const settings = core.normalize();
  assert.strictEqual(settings.randomQuote, true);
  assert.strictEqual(settings.sound, true);
  assert.strictEqual(settings.voice, true);
  assert.strictEqual(settings.dim, 70);
  assert.strictEqual(core.normalize({ sound: false, voice: false, randomQuote: false, dim: 40 }).dim, 40);
  assert.strictEqual(core.normalize({ sound: false }).sound, false);
});

// 用官方 API 形状模拟宿主，验证授权和窗口链路，不声称等同真机运行。
function host(accept, displays = [{ id: 2, bounds: { x: -1920, y: 0, width: 1920, height: 1080 } }], loadCallbacks = true) {
  let entries = [{ code: 'offwork-alarm-old', trigger: { cron: '0 18 * * 1,2,3,4,5' } }];
  const storage = new Map();
  const events = {};
  const windows = [];
  const timers = [];
  const api = {
    dbStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    getSchedules: () => entries.slice(),
    requestSchedule: async task => { if (accept) entries.push(task); },
    removeSchedule: code => { entries = entries.filter(item => item.code !== code); },
    onPluginEnter: callback => { events.enter = callback; },
    onScheduleTrigger: callback => { events.trigger = callback; },
    getCursorScreenPoint: () => ({ x: -100, y: 100 }),
    getAllDisplays: () => displays,
    getDisplayNearestPoint: () => displays[0],
    createBrowserWindow: (url, options, callback) => {
      const win = { url, options, destroyed: false, messages: [], isDestroyed() { return this.destroyed; }, close() { this.destroyed = true; }, setBounds(bounds) { this.bounds = bounds; }, setAlwaysOnTop() {}, show() { this.visible = true; }, focus() {}, webContents: { send: channel => win.messages.push(channel) } };
      windows.push(win);
      if (loadCallbacks) Promise.resolve().then(callback);
      return win;
    },
    hideMainWindow() {}, showNotification() {}
  };
  const context = { require: id => id === './core.js' ? core : id === './alarms.js' ? require('../alarms.js') : { ipcRenderer: { on: (name, callback) => { events[name] = callback; } } }, utools: api,
    window: { dispatchEvent() {} }, Event: function () {}, setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../preload.js'), 'utf8'), context);
  return { services: context.window.offworkNative, api, events, windows, timers };
}
test('取消授权保留原任务', async () => {
  const mock = host(false);
  assert.strictEqual((await mock.services.activate(core.defaults)).accepted, false);
  assert.strictEqual(mock.services.list()[0].code, 'offwork-alarm-old');
});
test('授权成功只保留新任务，暂停清空任务', async () => {
  const mock = host(true);
  assert.strictEqual((await mock.services.activate(core.defaults)).accepted, true);
  assert.strictEqual(mock.services.list().length, 1);
  assert.notStrictEqual(mock.services.list()[0].code, 'offwork-alarm-old');
  mock.services.pause(); assert.strictEqual(mock.services.list().length, 0);
});
test('后台定时触发在负坐标副屏创建透明覆盖窗口', async () => {
  const mock = host(true);
  mock.events.trigger({ code: 'offwork-alarm-old' });
  await Promise.resolve();
  assert.strictEqual(mock.windows.length, 1);
  assert.strictEqual(mock.windows[0].options.x, -1920);
  assert.strictEqual(mock.windows[0].options.transparent, true);
  assert.strictEqual(mock.windows[0].options.frame, false);
  const payload = JSON.parse(decodeURIComponent(mock.windows[0].url.split('data=')[1]));
  assert.strictEqual(payload.preview, false); assert.strictEqual(payload.title, '下班');
});
test('忽略其他任务且预演不创建定时任务', () => {
  const mock = host(true);
  mock.events.trigger({ code: 'other-plugin-task' }); assert.strictEqual(mock.windows.length, 0);
  mock.services.preview({ theme: 'dragon' });
  assert.strictEqual(mock.windows.length, 1); assert.strictEqual(mock.services.list().length, 1);
});
test('稍后提醒使用十分钟后的一次性任务', async () => {
  const mock = host(true);
  mock.services.preview(core.defaults);
  const group = JSON.parse(decodeURIComponent(mock.windows[0].url.split('data=')[1])).group;
  const before = Date.now(); await mock.events['offwork-snooze']({}, group);
  const entry = mock.services.list().find(item => item.code.startsWith('offwork-snooze-'));
  assert.ok(entry.trigger >= before + 600000 && entry.trigger <= Date.now() + 600000);
});
test('双屏各自覆盖完整边界，随机文案相同且仅一个窗口发声', async () => {
  const mock = host(true, [
    { id: 2, bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
    { id: 1, bounds: { x: 0, y: -200, width: 2560, height: 1440 }, scaleFactor: 1.5 }
  ]);
  mock.services.preview(core.defaults);
  await Promise.resolve();
  assert.strictEqual(mock.windows.length, 2);
  assert.strictEqual(mock.windows[0].options.x, -1920);
  assert.strictEqual(mock.windows[1].options.y, -200);
  assert.strictEqual(mock.windows[1].options.width, 2560);
  assert.ok(mock.windows.every(win => win.visible));
  const payloads = mock.windows.map(win => JSON.parse(decodeURIComponent(win.url.split('data=')[1])));
  assert.strictEqual(payloads[0].message, payloads[1].message);
  assert.strictEqual(payloads.filter(data => data.sound).length, 1);
  assert.strictEqual(payloads.filter(data => data.voice).length, 1);
  mock.events['offwork-close']({}, payloads[1].group);
  assert.ok(mock.windows.every(win => win.messages.includes('offwork-dismiss')));
});
test('新提醒替换全部旧屏幕窗口，旧窗口消息不影响新提醒', async () => {
  const mock = host(true);
  mock.services.preview(core.defaults);
  const old = mock.windows[0];
  const oldGroup = JSON.parse(decodeURIComponent(old.url.split('data=')[1])).group;
  mock.services.preview(core.defaults);
  assert.strictEqual(old.destroyed, true);
  mock.events['offwork-close']({}, oldGroup);
  assert.strictEqual(mock.windows[1].messages.length, 0);
});
test('宿主未触发窗口加载回调时，多屏预演仍显示遮罩窗口', () => {
  const mock = host(true, [
    { id: 2, bounds: { x: -1920, y: 0, width: 1920, height: 1080 } },
    { id: 1, bounds: { x: 0, y: 0, width: 2560, height: 1440 } }
  ], false);
  mock.services.preview(core.defaults);
  assert.strictEqual(mock.windows.length, 2);
  assert.ok(mock.windows.every(win => win.visible), '页面可以播放声音时，窗口也必须可见');
  assert.strictEqual(mock.windows[0].bounds.x, -1920);
  assert.strictEqual(mock.windows[1].bounds.width, 2560);
});
test('多个屏幕同时点击稍后提醒只创建一个任务', async () => {
  const mock = host(true);
  mock.services.preview(core.defaults);
  const group = JSON.parse(decodeURIComponent(mock.windows[0].url.split('data=')[1])).group;
  await Promise.all([mock.events['offwork-snooze']({}, group), mock.events['offwork-snooze']({}, group)]);
  assert.strictEqual(mock.services.list().filter(item => item.code.startsWith('offwork-snooze-')).length, 1);
});
test('manifest 的所有入口文件都存在', () => {
  const manifest = require('../plugin.json');
  [manifest.main, manifest.preload, manifest.logo, 'alarms.js', 'icons.js', 'ui.css', 'extra-scenes.js', 'extra-animations.css', 'overlay.html', 'overlay-preload.js'].forEach(file => assert.ok(fs.existsSync(require('path').join(__dirname, '..', file)), file));
});
test('多个闹钟独立启用、暂停和删除，触发使用各自已授权配置', async () => {
  const mock = host(true);
  await mock.services.activate(core.defaults);
  const first = mock.services.all()[0];
  const id = mock.services.add('喝水', { ...core.defaults, title: '喝水', category: 'water' });
  await mock.services.activate(mock.services.read());
  assert.strictEqual(mock.api.getSchedules().length, 2);
  const second = mock.services.all().find(a => a.id === id);
  assert.strictEqual(mock.services.resolve(first.codes[0]).settings.title, '下班');
  assert.strictEqual(mock.services.resolve(second.codes[0]).settings.title, '喝水');
  mock.services.save({ ...mock.services.read(), title: '未授权修改' });
  assert.strictEqual(mock.services.resolve(second.codes[0]).settings.title, '喝水');
  mock.services.pause(id);
  assert.strictEqual(mock.api.getSchedules().length, 1);
  assert.ok(mock.services.all()[0].enabled);
  mock.services.remove(id);
  assert.strictEqual(mock.services.all().length, 1);
});
test('间隔提醒按开始时间计算45分钟间隔，结束后与周末不触发', () => {
  const data = { ...core.defaults, mode: 'interval', interval: 45, start: '09:10', end: '18:00' };
  assert.ok(core.intervalDue(data, new Date(2026, 9, 28, 9, 55)));
  assert.ok(!core.intervalDue(data, new Date(2026, 9, 28, 10, 0)));
  assert.ok(!core.intervalDue(data, new Date(2026, 9, 28, 18, 10)));
  assert.ok(!core.intervalDue(data, new Date(2026, 9, 31, 9, 10)));
  assert.strictEqual(core.nextTime(data, new Date(2026, 9, 28, 9, 56)).getHours(), 10);
  assert.strictEqual(core.nextTime(data, new Date(2026, 9, 28, 9, 56)).getMinutes(), 40);
  assert.throws(() => core.schedule({ ...data, interval: 0 }, 'x'), /间隔/);
  assert.throws(() => core.schedule({ ...data, end: '08:00' }, 'x'), /时段/);
});
test('集合迁移只执行一次，重载后保留多个闹钟', () => {
  const values = new Map([['offwork-settings-v1', { ...core.defaults, title: '收工' }]]);
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, JSON.parse(JSON.stringify(value))) };
  const create = require('../alarms.js').create;
  const first = create(storage);
  assert.strictEqual(first.read().title, '收工');
  first.add('活动', { title: '活动' });
  const second = create(storage);
  assert.strictEqual(second.all().length, 2);
  assert.strictEqual(second.read().title, '活动');
});
test('新闹钟取消授权不影响已启用的旧闹钟', async () => {
  const mock = host(false);
  mock.services.add('喝水', { title: '喝水' });
  assert.strictEqual((await mock.services.activate(mock.services.read())).accepted, false);
  assert.strictEqual(mock.api.getSchedules()[0].code, 'offwork-alarm-old');
  assert.ok(mock.services.all()[0].enabled);
});
test('稍后提醒仍指向原闹钟，切换编辑项不会改变内容', async () => {
  const mock = host(true);
  mock.services.preview({ title: '喝水', category: 'water' });
  const group = JSON.parse(decodeURIComponent(mock.windows[0].url.split('data=')[1])).group;
  await mock.events['offwork-snooze']({}, group);
  const code = mock.api.getSchedules().find(t => t.code.startsWith('offwork-snooze-')).code;
  mock.services.add('活动', { title: '活动' });
  assert.strictEqual(mock.services.resolve(code).settings.title, '喝水');
});
test('多个闹钟同时触发时排队，第一条关闭后再播放第二条', async () => {
  const mock = host(true);
  await mock.services.activate(core.defaults);
  const first = mock.services.all()[0].codes[0];
  mock.services.add('活动', { ...core.defaults, title: '活动' });
  await mock.services.activate(mock.services.read());
  const second = mock.services.all()[1].codes[0];
  mock.events.trigger({ code: first });
  mock.events.trigger({ code: second });
  assert.strictEqual(mock.windows.length, 1);
  const group = JSON.parse(decodeURIComponent(mock.windows[0].url.split('data=')[1])).group;
  mock.events['offwork-close']({}, group);
  mock.timers[mock.timers.length - 1]();
  assert.strictEqual(mock.windows.length, 2);
  assert.strictEqual(mock.windows[0].destroyed, true);
  assert.strictEqual(JSON.parse(decodeURIComponent(mock.windows[1].url.split('data=')[1])).title, '活动');
});
test('文案库可新增和修改分类，随机文案实际使用自定义分类', () => {
  const mock = host(true);
  const id = mock.services.saveCategory(null, '项目回顾', '回顾', ['保存进展', '检查待办', '保存进展']);
  assert.strictEqual(mock.services.categories()[id].quotes.length, 2);
  mock.services.preview({ category: id, title: '回顾', randomQuote: true });
  const payload = JSON.parse(decodeURIComponent(mock.windows[0].url.split('data=')[1]));
  assert.ok(['保存进展', '检查待办'].includes(payload.message));
  assert.strictEqual(payload.categoryName, '项目回顾');
  mock.services.saveCategory(id, '每日回顾', '回顾', ['更新后的语句']);
  assert.strictEqual(core.message({ category: id, randomQuote: true }, 0, mock.services.categories()), '更新后的语句');
  assert.throws(() => mock.services.saveCategory(id, '无效分类', '提醒', []), /至少一句/);
  mock.services.removeCategory(id);
  assert.strictEqual(mock.services.categories()[id], undefined);
});
test('文案库引用保护和内置分类保护，编辑不污染内置默认值', async () => {
  const mock = host(true);
  const original = core.quoteCategories.water.quotes[0];
  mock.services.saveCategory('water', '喝水', '喝水', ['补充一点水']);
  assert.strictEqual(core.quoteCategories.water.quotes[0], original);
  assert.throws(() => mock.services.removeCategory('water'), /内置/);
  const id = mock.services.saveCategory(null, '自建分类', '提醒', ['你好']);
  mock.services.add('我的提醒', { category: id });
  assert.throws(() => mock.services.removeCategory(id), /使用/);
});

(async () => {
  for (const item of tests) {
    try { await item.callback(); count++; console.log('✓ ' + item.name); }
    catch (error) { console.error('✗ ' + item.name); throw error; }
  }
  console.log(`\n${count} 项测试通过`);
})().catch(error => { console.error(error); process.exitCode = 1; });

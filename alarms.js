(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core'));
  else root.AlarmStore = factory(root.Offwork);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core) {
  'use strict';
  // 文档保存草稿和已授权快照，编辑一个闹钟不会改动其他任务。
  function create(storage, host) {
    const key = 'fun-alarm-collection-v1';
    let doc = storage.getItem(key);
    if (!doc) {
      const old = core.normalize(storage.getItem('offwork-settings-v1'));
      const codes = host ? host.getSchedules().filter(t => t.code.startsWith('offwork-alarm-')).map(t => t.code) : [];
      doc = { selected: 'legacy', alarms: [{ id: 'legacy', name: '下班提醒', draft: old, active: old, codes }], snoozes: {} };
      if (host) host.getSchedules().filter(t => t.code.startsWith('offwork-snooze-')).forEach(t => { doc.snoozes[t.code] = { id: 'legacy', settings: old }; });
      storage.setItem(key, doc);
    }
    const persist = () => storage.setItem(key, doc);
    const find = id => { const alarm = doc.alarms.find(a => a.id === id); if (!alarm) throw new Error('闹钟不存在'); return alarm; };
    const tasks = () => host ? host.getSchedules() : [];
    // 分类文案独立保存；闹钟只引用分类，不改变文案库的浏览状态。
    function categories() { return JSON.parse(JSON.stringify(Object.assign({}, core.quoteCategories, doc.library || {}))); }
    function saveCategory(id, name, title, quotes) {
      name = String(name).trim().slice(0, 20); title = String(title).trim().slice(0, 6);
      const clean = [...new Set(quotes.map(q => String(q).trim().slice(0, 100)).filter(Boolean))].slice(0, 100);
      if (!name || !title || !clean.length) throw new Error('请填写分类名、登场文字及至少一句文案');
      if (!id) id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      if (!/^[a-z0-9-]+$/.test(id) || !Object.prototype.hasOwnProperty.call(categories(), id) && !id.startsWith('c')) throw new Error('分类标识无效');
      if (!doc.library) doc.library = {};
      doc.library[id] = { name, title, quotes: clean }; persist(); return id;
    }
    function save(input) { find(doc.selected).draft = core.normalize(input); persist(); }
    function pause(id) {
      const alarm = find(id);
      const codes = alarm.codes.concat(Object.keys(doc.snoozes).filter(code => doc.snoozes[code].id === id));
      codes.forEach(code => { if (tasks().some(t => t.code === code)) host.removeSchedule(code); delete doc.snoozes[code]; });
      alarm.codes = []; alarm.active = null; persist();
    }
    async function activate(input) {
      if (!host) throw new Error('请在 uTools 中开启定时提醒');
      const alarm = find(doc.selected);
      const data = core.normalize(input);
      const code = 'fun-alarm-' + alarm.id + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      const task = core.schedule(data, code); task.label = '趣味闹钟 · ' + alarm.name;
      await host.requestSchedule(task);
      if (!tasks().some(t => t.code === code)) return { accepted: false };
      const oldCodes = alarm.codes.slice();
      alarm.codes.push(code); alarm.draft = data; alarm.active = data; persist();
      let warning = '';
      oldCodes.forEach(old => { try { if (tasks().some(t => t.code === old)) host.removeSchedule(old); alarm.codes = alarm.codes.filter(c => c !== old); } catch (error) { warning = '旧任务移除失败，请在 uTools 定时任务中检查'; } });
      persist(); return { accepted: true, warning };
    }
    function resolve(code) {
      if (doc.snoozes[code]) return doc.snoozes[code];
      const alarm = doc.alarms.find(a => a.codes.includes(code));
      return alarm && { id: alarm.id, settings: alarm.active };
    }
    return {
      categories, saveCategory,
      removeCategory: id => {
        if (Object.prototype.hasOwnProperty.call(core.quoteCategories, id)) throw new Error('内置分类可以编辑，不能删除');
        if (doc.alarms.some(a => a.draft.category === id || a.active && a.active.category === id) || Object.values(doc.snoozes).some(s => s.settings.category === id)) throw new Error('分类正被闹钟使用，请先更换闹钟分类');
        if (doc.library) delete doc.library[id]; persist();
      },
      read: () => find(doc.selected).draft,
      save, activate,
      list: () => { const a = find(doc.selected); return tasks().filter(t => a.codes.includes(t.code) || (doc.snoozes[t.code] || {}).id === a.id); },
      all: () => doc.alarms.map(a => ({ ...a, enabled: a.codes.some(c => tasks().some(t => t.code === c)) })),
      selected: () => doc.selected,
      select: id => { find(id); doc.selected = id; persist(); },
      add: (name, settings) => { const id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); doc.alarms.push({ id, name: name.slice(0, 30), draft: core.normalize(settings), active: null, codes: [] }); doc.selected = id; persist(); return id; },
      rename: name => { find(doc.selected).name = name.trim().slice(0, 30) || '我的提醒'; persist(); },
      pause: id => pause(id || doc.selected),
      remove: id => { if (doc.alarms.length === 1) throw new Error('请至少保留一个闹钟'); pause(id); doc.alarms = doc.alarms.filter(a => a.id !== id); if (doc.selected === id) doc.selected = doc.alarms[0].id; persist(); },
      resolve,
      rememberSnooze: (code, item) => { doc.snoozes[code] = item; persist(); }
    };
  }
  return { create };
});

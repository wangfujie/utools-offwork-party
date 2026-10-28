'use strict';
const $ = id => document.getElementById(id);
const core = window.Offwork;
const native = window.offworkNative;
const manager = native || window.AlarmStore.create({ getItem: key => JSON.parse(localStorage.getItem(key) || (key === 'offwork-settings-v1' ? localStorage.getItem('offwork-settings') : null) || 'null'), setItem: (key, value) => localStorage.setItem(key, JSON.stringify(value)) });
let storedSettings;
try { storedSettings = manager.read(); }
catch (error) { console.warn('读取设置失败，使用默认配置', error); }
let settings = core.normalize(storedSettings);
let selectedDays = settings.days.slice();
let toastTimer;
let schedules = [];
let expandedAlarm = null;
let libraryCategory = 'offwork';
let toggleMotion = null;
let pendingToggle = null;
const icon = window.FunIcons;
const details = document.createElement('section');
details.id = 'alarm-details'; details.hidden = true;
const editor = document.querySelector('.alarm-editor');
const hero = document.querySelector('.hero-card');
const planHeading = hero.nextElementSibling;
const themeSection = $('theme-section');
const footer = document.querySelector('footer');
details.append(editor, hero, planHeading, document.querySelector('.plan-card'), themeSection, $('custom-section'), footer);
$('alarm-panel').append(details);
const backgrounds = { confetti: '#edf0df', hero: '#f6e5df', dragon: '#f5ecda', sword: '#e4edf1', cat: '#eee5f0', sunset: '#f4e7dc' };

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4200);
}

function collect() {
  return core.normalize({ ...settings, time: $('alarm-time').value, repeat: $('repeat').value, days: selectedDays,
    category: $('category').value, mode: $('mode').value, interval: Number($('interval').value), start: $('start').value, end: $('end').value,
    title: $('custom-title').value, quote: $('quote').value, accent: $('accent').value,
    duration: $('duration').value, dim: $('dim').value, randomQuote: $('random-quote').checked,
    sound: $('sound').checked, voice: $('voice').checked });
}

function save() {
  settings = collect();
  try {
    manager.save(settings);
    $('save-status').textContent = '✓ 草稿已保存 · 修改后需重新开启当前闹钟';
  } catch (error) { toast('保存失败：' + error.message); }
  $('dim-value').textContent = settings.dim + '%';
  $('quote').disabled = settings.randomQuote;
  // 自定义文案优先于随机文案，启用随机时明确清空输入框。
  $('days').hidden = settings.repeat !== 'custom';
  $('interval-fields').hidden = settings.mode !== 'interval';
  $('alarm-time').disabled = settings.mode === 'interval';
  document.querySelector('.time-field').hidden = settings.mode === 'interval';
  renderAlarms(); renderQuotes();
}

function renderThemes() {
  $('theme-grid').innerHTML = core.themes.map(theme => `<button class="theme-card ${settings.theme === theme.id ? 'selected' : ''}" data-theme="${theme.id}" aria-pressed="${settings.theme === theme.id}" style="--card-bg:${backgrounds[theme.id] || theme.color + "45"}"><div class="theme-art"><span class="theme-tag">${theme.tag}</span>${window.OffworkScenes.svg(theme.id)}<span class="selected-mark">✓</span></div><div class="theme-info"><strong>${theme.name}</strong><p>${theme.desc}</p></div></button>`).join('');
  $('quote').placeholder = (manager.categories()[settings.category] || manager.categories().offwork).quotes[0];
}

function renderDays() {
  $('days').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(day => `<button data-day="${day}" class="${selectedDays.includes(day) ? 'selected' : ''}" aria-pressed="${selectedDays.includes(day)}" aria-label="星期${'日一二三四五六'[day]}">${'日一二三四五六'[day]}</button>`).join('');
}

function load() {
  $('alarm-name').value = manager.all().find(a => a.id === manager.selected()).name;
  $('category').value = settings.category || 'offwork';
  $('mode').value = settings.mode || 'fixed';
  $('interval').value = settings.interval || 60;
  $('start').value = settings.start || '09:00'; $('end').value = settings.end || '18:00';
  $('interval-fields').hidden = settings.mode !== 'interval';
  $('alarm-time').disabled = settings.mode === 'interval';
  document.querySelector('.time-field').hidden = settings.mode === 'interval';
  $('alarm-time').value = settings.time;
  $('repeat').value = settings.repeat;
  $('custom-title').value = settings.title;
  $('quote').value = settings.quote;
  $('accent').value = settings.accent;
  $('duration').value = String(settings.duration);
  $('dim').value = settings.dim;
  $('dim-value').textContent = settings.dim + '%';
  $('random-quote').checked = settings.randomQuote;
  $('quote').disabled = settings.randomQuote;
  $('sound').checked = settings.sound;
  $('voice').checked = settings.voice;
  $('days').hidden = settings.repeat !== 'custom';
  renderThemes();
  renderDays();
  renderAlarms(); renderQuotes();
}

function refreshSchedules() {
  try { schedules = native ? native.list() : []; } catch (error) { toast('读取提醒失败：' + error.message); }
  tick();
  renderAlarms();
}

// 倒计时以已获授权的实际任务为准，修改草稿不会改变已生效时间。
function nextScheduled(item, now) {
  if (typeof item.trigger === 'number') return item.trigger > now ? new Date(item.trigger) : null;
  const alarm = manager.all().find(a => a.codes.includes(item.code));
  if (alarm && alarm.active && alarm.active.mode === 'interval') return core.nextTime(alarm.active, now);
  const parts = item.trigger.cron.split(' ');
  const days = parts[4] === '*' ? [0, 1, 2, 3, 4, 5, 6] : parts[4].split(',').map(Number);
  return core.nextTime({ time: `${String(parts[1]).padStart(2, '0')}:${String(parts[0]).padStart(2, '0')}`, repeat: 'custom', days }, now);
}

function tick() {
  const now = new Date();
  const next = schedules.map(item => nextScheduled(item, now)).filter(Boolean).sort((a, b) => a - b)[0];
  $('alarm-status').textContent = next ? '定时提醒已开启' : native ? '尚未开启提醒' : '浏览器体验模式';
  document.querySelector('.pill').classList.toggle('enabled', !!next);
  $('pause').disabled = !schedules.length;
  if (!next) {
    $('countdown').innerHTML = '--<span>时</span>--<span>分</span>--<span>秒</span>';
    $('next-label').textContent = '给下一件重要的小事定个时间';
    return;
  }
  const total = Math.max(0, Math.ceil((next - now) / 1000));
  const numbers = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60];
  $('countdown').innerHTML = numbers.map((value, i) => `${String(value).padStart(2, '0')}<span>${['时', '分', '秒'][i]}</span>`).join('');
  $('next-label').textContent = `下一次见面：${next.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })} ${next.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
}

function setTab(tab) {
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  $('alarm-panel').hidden = tab !== 'alarm';
  if (tab === 'themes') { $('words-panel').before(themeSection, footer); }
  else { details.append(themeSection, $('custom-section'), footer); }
  themeSection.hidden = false;
  footer.hidden = tab === 'words';
  $('words-panel').hidden = tab !== 'words';
  $('page-title').textContent = { alarm: '让每次提醒，都有点惊喜。', themes: '提醒，也要闪亮登场。', words: '别太累，你已经很棒了。' }[tab];
  $('page-description').textContent = { alarm: '所有闹钟一眼看清，点击卡片展开详情。', themes: '为当前编辑的闹钟选择动画：' + $('alarm-name').value, words: '浏览和编辑全部分类，不随闹钟切换。' }[tab];
}

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => setTab(button.dataset.tab)));
$('theme-grid').addEventListener('click', event => {
  const button = event.target.closest('[data-theme]');
  if (!button) return;
  const theme = core.themes.find(t => t.id === button.dataset.theme);
  settings.theme = theme.id;
  $('accent').value = theme.color;
  save(); renderThemes();
});
$('days').addEventListener('click', event => {
  const button = event.target.closest('[data-day]');
  if (!button) return;
  const day = Number(button.dataset.day);
  selectedDays = selectedDays.includes(day) ? selectedDays.filter(value => value !== day) : selectedDays.concat(day);
  save(); renderDays();
});
['alarm-time', 'repeat', 'custom-title', 'quote', 'accent', 'duration', 'dim', 'sound', 'voice', 'mode', 'interval', 'start', 'end'].forEach(id => $(id).addEventListener('input', save));
$('random-quote').addEventListener('change', () => { if ($('random-quote').checked) $('quote').value = ''; save(); });
$('activate').addEventListener('click', async () => {
  if (!$('alarm-time').value) return toast('请先设置有效的提醒时间');
  settings = collect();
  if (settings.repeat === 'custom' && !settings.days.length) return toast('请至少选择一个提醒日期');
  if (!native) return toast('请在 uTools 中导入插件后开启后台提醒；这里可以体验所有动画。');
  $('activate').disabled = true;
  try {
    const result = await native.activate(settings);
    toast(result.accepted ? result.warning || '提醒已开启，到点准时见！' : '未获授权，保留原来的提醒。');
    refreshSchedules();
  } catch (error) { toast('开启失败：' + error.message); }
  finally { $('activate').disabled = false; }
});
$('pause').addEventListener('click', () => {
  try { if (native) native.pause(); refreshSchedules(); toast('提醒已暂停，随时可以重新开启。'); }
  catch (error) { refreshSchedules(); toast('暂停失败：' + error.message); }
});
$('preview').addEventListener('click', () => {
  settings = collect();
  try {
    if (native) return native.preview(settings);
    const data = { ...settings, preview: true, categoryName: (manager.categories()[settings.category] || {}).name, message: core.message(settings, undefined, manager.categories()) };
    $('close-preview').hidden = false;
    $('preview-frame').src = 'overlay.html?data=' + encodeURIComponent(JSON.stringify(data));
    $('preview-dialog').showModal();
  } catch (error) { toast('预演失败：' + error.message); }
});
function closePreview() { $('preview-dialog').close(); $('preview-frame').src = 'about:blank'; }
$('close-preview').addEventListener('click', closePreview);
$('preview-dialog').addEventListener('cancel', () => { $('preview-frame').src = 'about:blank'; });
window.addEventListener('message', event => {
  if (event.source === $('preview-frame').contentWindow && event.data === 'offwork-close') closePreview();
  if (event.source === $('preview-frame').contentWindow && event.data === 'offwork-ready') $('close-preview').hidden = true;
});
function renderQuotes() {
  const category = manager.categories()[libraryCategory];
  const pool = category ? category.quotes : [];
  $('quote-list').innerHTML = pool.map((quote, index) => `<form class="quote-pick" data-index="${index}"><span class="quote-number">${String(index + 1).padStart(2, '0')}</span><input class="quote-text" value="${escapeText(quote)}" maxlength="100" aria-label="第${index + 1}句文案" readonly required><div class="quote-actions"><button type="button" data-quote-edit aria-label="编辑第${index + 1}句" title="编辑">${icon('edit')}</button><button type="submit" data-quote-save hidden aria-label="保存第${index + 1}句" title="保存">${icon('check')}</button><button type="button" data-quote-cancel hidden aria-label="取消编辑" title="取消">${icon('close')}</button><button type="button" data-quote-delete aria-label="删除第${index + 1}句" title="删除">${icon('trash')}</button></div></form>`).join('');
}
$('today').textContent = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
$('browser-note').hidden = !!native;
function refreshCategories() {
  const selected = $('category').value || settings.category || 'offwork';
  $('category').innerHTML = Object.entries(manager.categories()).map(([id, category]) => `<option value="${id}">${escapeText(category.name)}</option>`).join('');
  $('category').value = selected;
}
refreshCategories();
function escapeText(text) { const node = document.createElement('span'); node.textContent = text; return node.innerHTML.replace(/"/g, '&quot;'); }
function renderAlarms() {
  const focused = details.contains(document.activeElement) ? document.activeElement : null;
  details.remove();
  const alarms = manager.all();
  $('alarm-count').textContent = String(alarms.length).padStart(2, '0');
  $('alarm-stats').innerHTML = `<span>${icon('bell')}<b>${alarms.filter(a => a.enabled).length}</b> 正在守时</span><span>${icon('pause')}<b>${alarms.filter(a => !a.enabled).length}</b> 暂时休息</span>`;
  $('alarm-list').innerHTML = alarms.map(alarm => {
    const data = alarm.enabled ? alarm.active : alarm.draft;
    const category = manager.categories()[data.category || 'offwork'];
    const animated = toggleMotion && toggleMotion.id === alarm.id && Date.now() < toggleMotion.until;
    const dayLabel = { weekdays: '周一至周五', daily: '每天', once: '仅下一次', custom: '周' + (data.days || []).map(d => '日一二三四五六'[d]).join('、') }[data.repeat] || '每天';
    return `<article class="alarm-row ${alarm.id === expandedAlarm ? 'chosen' : ''} ${alarm.enabled ? 'is-enabled' : ''}" data-row="${alarm.id}" data-category="${data.category || 'custom'}"><button class="alarm-main" data-edit="${alarm.id}" aria-expanded="${alarm.id === expandedAlarm}" aria-controls="alarm-details"><span class="category-art">${icon(data.category || 'offwork')}</span><span class="alarm-info"><span class="alarm-name-line"><strong>${escapeText(alarm.name)}</strong><span class="alarm-category">${escapeText(category ? category.name : '提醒')}</span></span><span class="alarm-time-display">${data.mode === 'interval' ? `<b>${data.interval}</b><em>分钟 / 次</em>` : `<b>${data.time}</b>`}</span><small>${icon(data.mode === 'interval' ? 'repeat' : 'meeting')}${data.mode === 'interval' ? `${data.start}–${data.end} · ` : ''}${dayLabel}</small></span></button><div class="alarm-actions"><span class="state-label">${alarm.enabled ? '提醒中' : '已关闭'}</span><button class="alarm-switch ${alarm.enabled ? 'is-on' : ''} ${animated ? 'is-changing' : ''}" role="switch" aria-checked="${alarm.enabled}" aria-label="${alarm.enabled ? '关闭' : '开启'}${escapeText(alarm.name)}" data-toggle="${alarm.id}"><span class="switch-knob">${icon(alarm.enabled ? 'check' : 'pause')}</span><span class="switch-spinner"></span></button><button class="icon-button delete-alarm" aria-label="删除${escapeText(alarm.name)}" title="删除闹钟" data-remove="${alarm.id}">${icon('trash')}</button><button class="icon-button expand-alarm" aria-label="${alarm.id === expandedAlarm ? '收起' : '展开'}${escapeText(alarm.name)}详情" data-edit="${alarm.id}" aria-expanded="${alarm.id === expandedAlarm}" aria-controls="alarm-details">${icon('chevron')}</button></div></article>`;
  }).join('');
  $('alarm-list').querySelectorAll('[data-toggle]').forEach(button => {
    button.disabled = !!pendingToggle;
    if (pendingToggle === button.dataset.toggle) button.setAttribute('aria-busy', 'true');
  });
  const row = expandedAlarm && $('alarm-list').querySelector(`[data-row="${expandedAlarm}"]`);
  details.hidden = !row;
  if (row) row.after(details); else $('alarm-panel').append(details);
  if (focused) focused.focus({ preventScroll: true });
}
function selectAlarm(id) { manager.select(id); settings = core.normalize(manager.read()); selectedDays = settings.days.slice(); load(); refreshSchedules(); }
function expandAlarm(id) {
  expandedAlarm = expandedAlarm === id ? null : id;
  selectAlarm(id);
  if (expandedAlarm && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) details.animate([{ opacity: 0, transform: 'translateY(-14px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 260, easing: 'ease-out' });
}
$('new-alarm').addEventListener('click', () => {
  const id = manager.add('新的提醒', { ...core.defaults, category: 'custom', title: '提醒' }); expandedAlarm = id; selectAlarm(id);
  $('alarm-name').focus();
});
$('alarm-name').addEventListener('input', () => { manager.rename($('alarm-name').value); renderAlarms(); });
$('category').addEventListener('change', () => {
  const category = $('category').value;
  $('custom-title').value = manager.categories()[category].title;
  const suggested = { water: 'water', movement: 'stretch', eyes: 'forest', lunch: 'meal', nap: 'sunrise', meeting: 'rocket', offwork: 'confetti' }[category];
  if (suggested) { settings.theme = suggested; $('accent').value = core.themes.find(t => t.id === suggested).color; renderThemes(); }
  $('quote').value = ''; $('random-quote').checked = true;
  if (['water', 'movement', 'eyes'].includes(category)) { $('mode').value = 'interval'; $('interval').value = category === 'eyes' ? 20 : 60; }
  else $('mode').value = 'fixed';
  if (category === 'lunch') $('alarm-time').value = '12:00';
  if (category === 'offwork') $('alarm-time').value = '18:00';
  save();
});
$('alarm-list').addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  if (pendingToggle) return;
  if (button.dataset.edit) return expandAlarm(button.dataset.edit);
  button.disabled = true;
  if (button.dataset.toggle) pendingToggle = button.dataset.toggle;
  try {
    if (button.dataset.remove) { manager.remove(button.dataset.remove); if (expandedAlarm === button.dataset.remove) expandedAlarm = null; selectAlarm(manager.selected()); }
    if (button.dataset.toggle) {
      const id = button.dataset.toggle;
      const alarm = manager.all().find(a => a.id === id);
      button.setAttribute('aria-busy', 'true');
      if (alarm.enabled) { manager.pause(id); toggleMotion = { id, until: Date.now() + 400 }; }
      else { manager.select(id); const result = await manager.activate(alarm.draft); if (result.accepted) toggleMotion = { id, until: Date.now() + 400 }; toast(result.accepted ? result.warning || '提醒已开启' : '未获授权，原提醒保留'); }
      selectAlarm(manager.selected());
    }
  } catch (error) { toast(error.message); renderAlarms(); }
  finally { pendingToggle = null; button.disabled = false; button.removeAttribute('aria-busy'); renderAlarms(); }
});
// 文案库有独立的浏览分类和编辑表单，不写入当前闹钟草稿。
function loadLibrary(id) {
  libraryCategory = id;
  const categories = manager.categories();
  renderLibraryTabs();
  const category = categories[id];
  $('library-name').value = category ? category.name : '';
  $('library-title').value = category ? category.title : '提醒';
  $('first-quote-label').hidden = !!category;
  $('first-quote').required = !category; $('first-quote').value = '';
  $('quote-add-form').hidden = !category; $('new-quote').value = '';
  $('library-count').textContent = category ? `${category.quotes.length} 句 · 在下方列表逐句管理` : '填写分类信息与第一句提醒';
  $('delete-category').hidden = !id || Object.prototype.hasOwnProperty.call(core.quoteCategories, id);
  renderQuotes();
}
function renderLibraryTabs() {
  $('library-tabs').innerHTML = Object.entries(manager.categories()).map(([key, c]) => `<button data-library="${key}" aria-pressed="${key === libraryCategory}" class="${key === libraryCategory ? 'active' : ''}">${icon(key)}${escapeText(c.name)} <small>${c.quotes.length}</small></button>`).join('');
}
$('library-tabs').addEventListener('click', event => { const button = event.target.closest('[data-library]'); if (button) loadLibrary(button.dataset.library); });
$('new-category').addEventListener('click', () => loadLibrary(null));
$('library-form').addEventListener('submit', event => {
  event.preventDefault();
  try { const category = manager.categories()[libraryCategory]; const id = manager.saveCategory(libraryCategory, $('library-name').value, $('library-title').value, category ? category.quotes : [$('first-quote').value]); refreshCategories(); loadLibrary(id); toast('分类信息已保存'); }
  catch (error) { toast(error.message); }
});
$('delete-category').addEventListener('click', () => {
  try { manager.removeCategory(libraryCategory); refreshCategories(); loadLibrary('offwork'); toast('分类已删除'); }
  catch (error) { toast(error.message); }
});
// 逐句保存到文案库；分类信息和其他语句不随编辑动作改变。
function saveQuotes(quotes) {
  const category = manager.categories()[libraryCategory];
  if (!category) throw new Error('请先保存分类');
  manager.saveCategory(libraryCategory, category.name, category.title, quotes);
  $('library-count').textContent = `${manager.categories()[libraryCategory].quotes.length} 句 · 在下方列表逐句管理`;
  renderLibraryTabs();
  renderQuotes();
}
$('quote-add-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const quotes = manager.categories()[libraryCategory].quotes;
    const text = $('new-quote').value.trim();
    if (!text) throw new Error('请填写提醒语句');
    if (quotes.includes(text)) throw new Error('这句话已经在分类中');
    if (quotes.length >= 100) throw new Error('每个分类最多100句');
    saveQuotes(quotes.concat(text)); $('new-quote').value = ''; toast('新语句已添加');
  } catch (error) { toast(error.message); }
});
$('quote-list').addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  const row = button.closest('[data-index]'); const input = row.querySelector('input');
  if (button.hasAttribute('data-quote-edit')) {
    row.classList.add('editing'); input.readOnly = false;
    row.querySelector('[data-quote-edit]').hidden = true; row.querySelector('[data-quote-save]').hidden = false; row.querySelector('[data-quote-cancel]').hidden = false;
    input.focus();
  }
  if (button.hasAttribute('data-quote-cancel')) renderQuotes();
  if (button.hasAttribute('data-quote-delete')) {
    try { const quotes = manager.categories()[libraryCategory].quotes; if (quotes.length === 1) throw new Error('每个分类请至少保留一句文案'); saveQuotes(quotes.filter((q, i) => i !== Number(row.dataset.index))); toast('语句已删除'); } catch (error) { toast(error.message); }
  }
});
$('quote-list').addEventListener('submit', event => {
  event.preventDefault(); const row = event.target;
  try { const text = row.querySelector('input').value.trim(); if (!text) throw new Error('语句不能为空'); const quotes = manager.categories()[libraryCategory].quotes.slice(); const index = Number(row.dataset.index); if (quotes.some((q, i) => i !== index && q === text)) throw new Error('这句话已经在分类中'); quotes[index] = text; saveQuotes(quotes); toast('语句已保存'); } catch (error) { toast(error.message); }
});
loadLibrary(libraryCategory);
load(); refreshSchedules();
setInterval(tick, 1000);
window.addEventListener('offwork-enter', refreshSchedules);
window.addEventListener('focus', refreshSchedules);

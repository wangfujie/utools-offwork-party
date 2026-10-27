'use strict';
const $ = id => document.getElementById(id);
const core = window.Offwork;
const native = window.offworkNative;
let storedSettings;
try { storedSettings = native ? native.read() : JSON.parse(localStorage.getItem('offwork-settings') || 'null'); }
catch (error) { console.warn('读取设置失败，使用默认配置', error); }
let settings = core.normalize(storedSettings);
let selectedDays = settings.days.slice();
let toastTimer;
let schedules = [];
const backgrounds = { confetti: '#edf0df', hero: '#f6e5df', dragon: '#f5ecda', sword: '#e4edf1', cat: '#eee5f0', sunset: '#f4e7dc' };

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4200);
}

function collect() {
  return core.normalize({ ...settings, time: $('alarm-time').value, repeat: $('repeat').value, days: selectedDays,
    title: $('custom-title').value, quote: $('quote').value, accent: $('accent').value,
    duration: $('duration').value, dim: $('dim').value, randomQuote: $('random-quote').checked,
    sound: $('sound').checked, voice: $('voice').checked });
}

function save() {
  settings = collect();
  try {
    if (native) native.save(settings);
    else localStorage.setItem('offwork-settings', JSON.stringify(settings));
    $('save-status').textContent = '✓ 外观已保存 · 时间与日期修改后需重新开启提醒';
  } catch (error) { toast('保存失败：' + error.message); }
  $('dim-value').textContent = settings.dim + '%';
  $('quote').disabled = settings.randomQuote;
  // 自定义文案优先于随机文案，启用随机时明确清空输入框。
  $('days').hidden = settings.repeat !== 'custom';
}

function renderThemes() {
  $('theme-grid').innerHTML = core.themes.map(theme => `<button class="theme-card ${settings.theme === theme.id ? 'selected' : ''}" data-theme="${theme.id}" aria-pressed="${settings.theme === theme.id}" style="--card-bg:${backgrounds[theme.id]}"><div class="theme-art"><span class="theme-tag">${theme.tag}</span>${window.OffworkScenes.svg(theme.id)}<span class="selected-mark">✓</span></div><div class="theme-info"><strong>${theme.name}</strong><p>${theme.desc}</p></div></button>`).join('');
  $('quote').placeholder = core.themes.find(t => t.id === settings.theme).line;
}

function renderDays() {
  $('days').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(day => `<button data-day="${day}" class="${selectedDays.includes(day) ? 'selected' : ''}" aria-pressed="${selectedDays.includes(day)}" aria-label="星期${'日一二三四五六'[day]}">${'日一二三四五六'[day]}</button>`).join('');
}

function load() {
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
}

function refreshSchedules() {
  try { schedules = native ? native.list() : []; } catch (error) { toast('读取提醒失败：' + error.message); }
  tick();
}

// 倒计时以已获授权的实际任务为准，修改草稿不会改变已生效时间。
function nextScheduled(item, now) {
  if (typeof item.trigger === 'number') return item.trigger > now ? new Date(item.trigger) : null;
  const parts = item.trigger.cron.split(' ');
  const days = parts[4] === '*' ? [0, 1, 2, 3, 4, 5, 6] : parts[4].split(',').map(Number);
  return core.nextTime({ time: `${String(parts[1]).padStart(2, '0')}:${String(parts[0]).padStart(2, '0')}`, repeat: 'custom', days }, now);
}

function tick() {
  const now = new Date();
  const next = schedules.map(item => nextScheduled(item, now)).filter(Boolean).sort((a, b) => a - b)[0];
  $('alarm-status').textContent = next ? '下班提醒已开启' : native ? '尚未开启提醒' : '浏览器体验模式';
  document.querySelector('.pill').classList.toggle('enabled', !!next);
  $('pause').disabled = !schedules.length;
  if (!next) {
    $('countdown').innerHTML = '--<span>时</span>--<span>分</span>--<span>秒</span>';
    $('next-label').textContent = '先给自己定一个下班时间吧';
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
  $('theme-section').hidden = tab === 'words';
  $('custom-section').hidden = tab === 'words';
  $('words-panel').hidden = tab !== 'words';
  $('page-title').textContent = { alarm: '今天，也要准点快乐。', themes: '下班，也要闪亮登场。', words: '别太累，你已经很棒了。' }[tab];
  $('page-description').textContent = { alarm: '给忙碌的一天，安排一个漂亮的句号。', themes: '选一位下班搭子，接你回到生活里。', words: '一些温柔的话，送给努力生活的你。' }[tab];
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
['alarm-time', 'repeat', 'custom-title', 'quote', 'accent', 'duration', 'dim', 'sound', 'voice'].forEach(id => $(id).addEventListener('input', save));
$('random-quote').addEventListener('change', () => { if ($('random-quote').checked) $('quote').value = ''; save(); });
$('activate').addEventListener('click', async () => {
  if (!$('alarm-time').value) return toast('请先设置有效的下班时间');
  settings = collect();
  if (settings.repeat === 'custom' && !settings.days.length) return toast('请至少选择一个提醒日期');
  if (!native) return toast('请在 uTools 中导入插件后开启后台提醒；这里可以体验所有动画。');
  $('activate').disabled = true;
  try {
    const result = await native.activate(settings);
    toast(result.accepted ? result.warning || '提醒已开启，到点接你下班！' : '未获授权，保留原来的提醒。');
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
    const data = { ...settings, preview: true, message: core.message(settings) };
    $('preview-frame').src = 'overlay.html?data=' + encodeURIComponent(JSON.stringify(data));
    $('preview-dialog').showModal();
  } catch (error) { toast('预演失败：' + error.message); }
});
function closePreview() { $('preview-dialog').close(); $('preview-frame').src = 'about:blank'; }
$('close-preview').addEventListener('click', closePreview);
$('preview-dialog').addEventListener('cancel', () => { $('preview-frame').src = 'about:blank'; });
window.addEventListener('message', event => {
  if (event.source === $('preview-frame').contentWindow && event.data === 'offwork-close') closePreview();
});
$('quote-list').innerHTML = core.quotes.map((quote, index) => `<button class="quote-pick" data-quote="${index}"><span>${String(index + 1).padStart(2, '0')}</span>${quote}</button>`).join('');
$('quote-list').addEventListener('click', event => {
  const button = event.target.closest('[data-quote]');
  if (!button) return;
  $('quote').value = core.quotes[Number(button.dataset.quote)];
  $('random-quote').checked = false;
  save(); toast('这句话已经加入你的下班提醒。');
});
$('today').textContent = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
$('browser-note').hidden = !!native;
load(); refreshSchedules();
setInterval(tick, 1000);
window.addEventListener('offwork-enter', refreshSchedules);
window.addEventListener('focus', refreshSchedules);

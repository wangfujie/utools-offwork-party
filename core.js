(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Offwork = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const themes = [
    { id: 'confetti', name: '收工礼炮', tag: '经典仪式感', color: '#deedb0', line: '今天的努力已存档，剩下的时间属于你。', desc: '大字登场 · 漫天彩纸', icon: '✦' },
    { id: 'hero', name: '蛛丝英雄', tag: '英雄也下班', color: '#ffb6a8', line: '拯救世界明天再说，今晚先拯救你的快乐。', desc: '蛛丝垂降 · 英雄接你回家', icon: '⌁' },
    { id: 'dragon', name: '金龙赐闲', tag: '奉旨躺平', color: '#f4d48c', line: '本龙掐指一算：今日宜下班，忌内耗。', desc: '金龙腾云 · 奉旨准点收工', icon: '龍' },
    { id: 'sword', name: '御剑下班', tag: '修仙不修班', color: '#b5d8f6', line: '道友，今日功德已满，随我御剑归家。', desc: '仙人御剑 · 把烦恼留在云后', icon: '⚔' },
    { id: 'cat', name: '猫猫躺平', tag: '摸鱼有理', color: '#e3c5ed', line: '猫都睡了，你还卷什么？快回家给自己充电。', desc: '猫猫打盹 · 温柔劝你休息', icon: 'ฅ' },
    { id: 'sunset', name: '落日归途', tag: '温柔治愈', color: '#ffc39f', line: '工作有尽头，生活有盼头。去赶一场晚霞吧。', desc: '落日缓降 · 把时间还给生活', icon: '◒' }
  ];
  const quotes = [
    '今天的努力已存档，剩下的时间属于你。', '工资买的是你的时间，不是你的整个人生。',
    '别把自己活成待办清单，今晚去做喜欢的事。', '你已经做得很好了，休息不需要理由。',
    '人生不是只有进度条，还有晚风和热腾腾的饭。', '今天就到这里，明天的你会有新的电量。',
    '世界不会因为你准点下班就停止转动。', '合上电脑，打开生活。',
    '允许自己慢一点，花也不是一天开的。', '下班不是逃跑，是奔向自己的生活。'
  ];
  const defaults = { time: '18:00', repeat: 'weekdays', days: [1, 2, 3, 4, 5], theme: 'confetti', title: '下班', quote: '', randomQuote: true, accent: '#deedb0', duration: 15, dim: 70, sound: true, voice: true };

  // 规范化持久化数据，避免无效设置影响定时和动画。
  function normalize(input) {
    const data = Object.assign({}, defaults, input || {});
    data.time = /^([01]\d|2[0-3]):[0-5]\d$/.test(data.time) ? data.time : defaults.time;
    data.repeat = ['weekdays', 'daily', 'custom', 'once'].includes(data.repeat) ? data.repeat : 'weekdays';
    data.days = Array.isArray(data.days) ? [...new Set(data.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : defaults.days.slice();
    data.theme = themes.some(t => t.id === data.theme) ? data.theme : defaults.theme;
    data.title = typeof data.title === 'string' ? data.title.trim().slice(0, 6) || '下班' : '下班';
    data.quote = typeof data.quote === 'string' ? data.quote.trim().slice(0, 100) : '';
    data.accent = /^#[0-9a-f]{6}$/i.test(data.accent) ? data.accent : defaults.accent;
    data.duration = Math.min(60, Math.max(5, Number(data.duration) || 15));
    data.dim = Math.min(90, Math.max(10, Number(data.dim) || defaults.dim));
    ['sound', 'voice', 'randomQuote'].forEach(k => { data[k] = data[k] === true; });
    return data;
  }

  function getDays(settings) {
    return settings.repeat === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : settings.repeat === 'weekdays' ? [1, 2, 3, 4, 5] : settings.days;
  }

  // 按本机时区计算下一次提醒，工作日指周一至周五，不推算调休。
  function nextTime(input, now) {
    const settings = normalize(input);
    const start = now ? new Date(now) : new Date();
    const parts = settings.time.split(':').map(Number);
    for (let offset = 0; offset <= 7; offset++) {
      const date = new Date(start);
      date.setDate(date.getDate() + offset);
      date.setHours(parts[0], parts[1], 0, 0);
      if (date > start && (settings.repeat === 'once' || getDays(settings).includes(date.getDay()))) return date;
    }
    return null;
  }

  function schedule(input, code, now) {
    const settings = normalize(input);
    if (settings.repeat === 'custom' && !settings.days.length) throw new Error('请至少选择一个提醒日期');
    const [hour, minute] = settings.time.split(':').map(Number);
    const trigger = settings.repeat === 'once' ? nextTime(settings, now).getTime() : { cron: `${minute} ${hour} * * ${getDays(settings).join(',')}` };
    return { code, label: `趣味闹钟 · ${settings.time}`, trigger };
  }

  function message(settings, random) {
    if (settings.quote) return settings.quote;
    if (settings.randomQuote) return quotes[Math.floor((random === undefined ? Math.random() : random) * quotes.length) % quotes.length];
    return themes.find(t => t.id === settings.theme).line;
  }

  return { themes, quotes, defaults, normalize, getDays, nextTime, schedule, message };
});

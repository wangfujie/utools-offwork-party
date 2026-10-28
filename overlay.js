'use strict';
const core = window.Offwork;
let raw;
try { raw = JSON.parse(new URLSearchParams(location.search).get('data') || '{}'); } catch (error) { raw = {}; }
const settings = core.normalize(raw);
const theme = core.themes.find(item => item.id === settings.theme);
document.body.className = 'theme-' + settings.theme;
document.documentElement.style.setProperty('--accent', settings.accent);
document.documentElement.style.setProperty('--dim', settings.dim / 100);
document.documentElement.style.setProperty('--duration', settings.duration + 's');
document.getElementById('scene').innerHTML = window.OffworkScenes.svg(settings.theme);
document.getElementById('caption').textContent = ((core.quoteCategories[settings.category] || {}).name || theme.tag) + ' / FUN ALARM';
document.getElementById('message').textContent = typeof raw.message === 'string' ? raw.message.slice(0, 100) : core.message(settings);
Array.from(settings.title).forEach((character, index) => {
  const span = document.createElement('span');
  span.textContent = character;
  span.style.setProperty('--i', index);
  document.getElementById('big-title').appendChild(span);
});
if (raw.preview) document.getElementById('mode').textContent = '快乐预演 · ' + theme.name;
document.getElementById('snooze').hidden = !!raw.preview || !window.offworkOverlay;
const deadline = Date.now() + settings.duration * 1000;
let closing = false;
let audioContext;
let speechTimer;
let frame;

function closeOverlay(notify = true) {
  if (closing) return;
  closing = true;
  if (notify !== false && window.offworkOverlay) window.offworkOverlay.close(raw.group);
  clearInterval(clock);
  clearTimeout(speechTimer);
  cancelAnimationFrame(frame);
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (audioContext) audioContext.close();
  document.body.classList.add('leaving');
  setTimeout(() => {
    if (window.parent !== window) window.parent.postMessage('offwork-close', '*');
    else window.close();
  }, 350);
}
document.getElementById('close').addEventListener('click', closeOverlay);
document.getElementById('leave').addEventListener('click', closeOverlay);
if (window.offworkOverlay) window.offworkOverlay.onClose(() => closeOverlay(false));
document.getElementById('snooze').addEventListener('click', () => {
  if (window.offworkOverlay) window.offworkOverlay.snooze(raw.group);
  closeOverlay(false);
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeOverlay(); } });
function tick() {
  const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  document.getElementById('remaining').textContent = `${remaining} 秒后自动收起`;
  if (!remaining) closeOverlay();
}
const clock = setInterval(tick, 250);
tick();

// 无外部音频文件；多屏时仅一个窗口启用声音，语音由本机引擎提供。
if (settings.sound) {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    audioContext = new Audio();
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const start = audioContext.currentTime + .2 + index * .16;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(.08, start + .03);
      gain.gain.exponentialRampToValueAtTime(.001, start + .65);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(start); oscillator.stop(start + .7);
    });
  } catch (error) { console.warn('提示音播放失败', error); }
}
if (settings.voice && 'speechSynthesis' in window) {
  speechTimer = setTimeout(() => {
    const speech = new SpeechSynthesisUtterance(`${settings.title}了。${document.getElementById('message').textContent}`);
    speech.lang = 'zh-CN'; speech.rate = .9;
    window.speechSynthesis.speak(speech);
  }, 1400);
}

// 按屏幕尺寸控制粒子数量，所有主题都有轻量的庆祝或氛围粒子。
const canvas = document.getElementById('confetti');
const context = canvas.getContext('2d');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let width, height;
function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth; height = window.innerHeight;
  canvas.width = width * ratio; canvas.height = height * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}
resize();
window.addEventListener('resize', resize);
const celebration = ['confetti', 'hero', 'dragon'].includes(settings.theme);
const colors = [settings.accent, '#f6dfb0', '#eab8c6', '#b4d8b4', '#c1b0e7', '#f6f3de'];
const particles = Array.from({ length: celebration ? 160 : 45 }, () => ({
  x: Math.random() * width, y: Math.random() * height - height,
  vx: (Math.random() - .5) * 65, vy: celebration ? 40 + Math.random() * 95 : 12 + Math.random() * 25,
  size: celebration ? 3 + Math.random() * 6 : 1 + Math.random() * 3,
  angle: Math.random() * Math.PI, spin: (Math.random() - .5) * 4,
  color: colors[Math.floor(Math.random() * colors.length)]
}));
let last = performance.now();
function draw(now) {
  const dt = Math.min((now - last) / 1000, .05); last = now;
  context.clearRect(0, 0, width, height);
  particles.forEach(p => {
    p.x += p.vx * dt; p.y += p.vy * dt; p.angle += p.spin * dt;
    if (p.y > height + 20) { p.y = -20; p.x = Math.random() * width; }
    if (p.x > width + 20) p.x = -20;
    if (p.x < -20) p.x = width + 20;
    context.save(); context.translate(p.x, p.y); context.rotate(p.angle);
    context.globalAlpha = celebration ? .85 : .4 + Math.sin(now / 1000 + p.angle) * .3;
    context.fillStyle = p.color;
    if (celebration) context.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * .5);
    else { context.beginPath(); context.arc(0, 0, p.size, 0, Math.PI * 2); context.fill(); }
    context.restore();
  });
  if (!closing) frame = requestAnimationFrame(draw);
}
if (!reducedMotion) frame = requestAnimationFrame(draw);

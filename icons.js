(function () {
  'use strict';
  const paths = {
    alarm: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M5 3 2 6m17-3 3 3M6 20l-1 2m13-2 1 2"/>',
    bell: '<path d="M5 17h14l-2-4V9a5 5 0 0 0-10 0v4Zm5 3h4M12 2v2"/>',
    sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4"/>',
    words: '<path d="M4 4h16v13H9l-5 4ZM8 8h8m-8 4h5"/>',
    water: '<path d="M12 2S5 10 5 14a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/><path d="M8 14a4 4 0 0 0 4 4"/>',
    movement: '<circle cx="13" cy="4" r="2"/><path d="m7 10 5-3 5 4 4-1M12 7l-2 8-5 6m5-6 6 1 1 5M3 6h4"/>',
    eyes: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    lunch: '<path d="M3 3v6q3 4 6 0V3M6 3v19M18 3q-5 6-2 10h4V3Zm2 10v9"/>',
    nap: '<path d="M19 15A9 9 0 0 1 9 3a9 9 0 1 0 10 12ZM16 3h5l-5 5h5"/>',
    meeting: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 11h18m-13 4h2m4 0h2"/>',
    offwork: '<path d="M14 3H5v18h9M10 12h12m-4-4 4 4-4 4M7 7h1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    chevron: '<path d="m8 10 4 4 4-4"/>',
    play: '<path d="m8 4 13 8-13 8Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    repeat: '<path d="m16 2 4 4-4 4M4 11V8a2 2 0 0 1 2-2h14M8 22l-4-4 4-4m12-1v3a2 2 0 0 1-2 2H4"/>',
    save: '<path d="M4 3h14l3 3v15H3V3Zm3 0v6h10V3M7 21v-8h10v8"/>',
    edit: '<path d="m15 4 5 5M4 16 16 4q2-2 4 0t0 4L8 20l-5 1Z"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    sliders: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>'
  };
  window.FunIcons = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.bell}</svg>`;
  document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = window.FunIcons(node.dataset.icon); });
  [['new-category', 'plus', '新建分类'], ['activate', 'bell', '应用并开启'], ['pause', 'pause', '暂停当前闹钟']].forEach(([id, name, label]) => {
    const button = document.getElementById(id);
    button.innerHTML = window.FunIcons(name) + ' ' + label;
  });
  const save = document.querySelector('#library-form button[type="submit"]');
  save.innerHTML = window.FunIcons('save') + ' 保存分类信息';
})();

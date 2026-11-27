'use strict';
const {spec} = JSON.parse(document.querySelector('#design').textContent);
const node = selector => document.querySelector(selector);
const layout = node('.layout');
const poster = node('.poster');
const title = node('h1');
const subtitle = node('.subtitle');
const timer = node('.timer');
document.body.dataset.type = spec.type;
document.body.dataset.style = spec.style;
document.body.dataset.emphasis = spec.emphasis;
document.body.dataset.side = spec.side;
title.textContent = spec.title;
subtitle.textContent = spec.subtitle;
subtitle.hidden = !spec.subtitle;
node('.eyebrow').textContent = spec.style === 'black-note' ? 'Black Note Club · En directo' : 'En directo';

function fit() {
  title.style.fontSize = '';
  subtitle.style.fontSize = '';
  const max = innerHeight * (spec.type === 'lower-third' ? .34 : .84);
  for (let i=0; i<16 && layout.offsetHeight > max; i++) {
    title.style.fontSize = Math.max(10,parseFloat(getComputedStyle(title).fontSize)*.86)+'px';
    subtitle.style.fontSize = Math.max(9,parseFloat(getComputedStyle(subtitle).fontSize)*.88)+'px';
  }
}
if (spec.poster && spec.type !== 'lower-third') {
  poster.onload = () => { poster.hidden = false; layout.classList.remove('no-poster'); fit(); };
  poster.src = spec.poster;
}
if (spec.type === 'countdown') {
  timer.hidden = false;
  const end = Date.now() + spec.seconds*1000;
  const tick = () => {
    const left = Math.max(0,Math.ceil((end-Date.now())/1000));
    timer.textContent = [Math.floor(left/60),left%60].map(part=>String(part).padStart(2,'0')).join(':');
    if (!left) clearInterval(interval);
  };
  const interval = setInterval(tick, 150);
  tick();
}
addEventListener('resize',fit);
requestAnimationFrame(fit);

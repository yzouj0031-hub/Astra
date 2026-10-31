/* 输入：键盘 + 鼠标拖动环顾 + 触屏（左半屏摇杆、右半屏拖动环顾、屏幕按钮）。
   对外只暴露一个状态对象，玩法代码不碰 DOM 事件。 */
export function createInput(canvas, ui) {
  const st = {
    move: { x: 0, y: 0 },      // -1..1，x 右 y 前
    look: { dx: 0, dy: 0 },    // 本帧环顾增量（像素）
    zoom: 0,
    sprint: false, jump: false, attack: false, dodge: false, interact: false, heavy: false,
    _once: new Set(), touch: false, locked: false,
  };
  const keys = new Set();
  const once = k => { st._once.add(k); };
  const KEYMAP = { Space: 'jump', KeyJ: 'attack', KeyK: 'heavy', KeyL: 'dodge', KeyE: 'interact', KeyM: 'map', KeyI: 'bag', KeyQ: 'quests', Escape: 'pause', KeyV: 'view', KeyT: 'time' };
  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (!keys.has(e.code) && KEYMAP[e.code]) once(KEYMAP[e.code]);
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  // 鼠标：按住右键/左键在画布上拖动 = 环顾；滚轮 = 缩放
  let dragging = false, lx = 0, ly = 0;
  canvas.addEventListener('mousedown', e => { dragging = true; lx = e.clientX; ly = e.clientY; });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', e => { if (!dragging) return; st.look.dx += e.clientX - lx; st.look.dy += e.clientY - ly; lx = e.clientX; ly = e.clientY; });
  canvas.addEventListener('wheel', e => { st.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // 触屏：左半屏任意位置落指 = 摇杆原点，右半屏拖动 = 环顾
  const touches = new Map();
  const stick = ui.stick, knob = ui.knob;
  const stickState = { id: null, ox: 0, oy: 0 };
  const lookState = { id: null, lx: 0, ly: 0 };
  function onStart(e) {
    st.touch = true; document.body.classList.add('touch');
    for (const t of e.changedTouches) {
      const half = window.innerWidth * 0.5;
      if (t.clientX < half && stickState.id === null) {
        stickState.id = t.identifier; stickState.ox = t.clientX; stickState.oy = t.clientY;
        stick.style.left = (t.clientX - 60) + 'px'; stick.style.top = (t.clientY - 60) + 'px'; stick.classList.add('on');
      } else if (lookState.id === null) { lookState.id = t.identifier; lookState.lx = t.clientX; lookState.ly = t.clientY; }
      touches.set(t.identifier, t);
    }
    e.preventDefault();
  }
  function onMove(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === stickState.id) {
        let dx = t.clientX - stickState.ox, dy = t.clientY - stickState.oy; const len = Math.hypot(dx, dy), max = 48;
        if (len > max) { dx *= max / len; dy *= max / len; }
        st.move.x = dx / max; st.move.y = -dy / max; knob.style.transform = `translate(${dx}px,${dy}px)`;
      } else if (t.identifier === lookState.id) { st.look.dx += t.clientX - lookState.lx; st.look.dy += t.clientY - lookState.ly; lookState.lx = t.clientX; lookState.ly = t.clientY; }
    }
    e.preventDefault();
  }
  function onEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === stickState.id) { stickState.id = null; st.move.x = 0; st.move.y = 0; knob.style.transform = ''; stick.classList.remove('on'); }
      if (t.identifier === lookState.id) lookState.id = null;
      touches.delete(t.identifier);
    }
  }
  const layer = ui.touchLayer;
  layer.addEventListener('touchstart', onStart, { passive: false }); layer.addEventListener('touchmove', onMove, { passive: false });
  layer.addEventListener('touchend', onEnd); layer.addEventListener('touchcancel', onEnd);

  // 屏幕按钮：按住 = 持续（疾跑），点一下 = 一次（跳、攻、互动）
  const hold = (el, key) => { if (!el) return; const on = e => { st[key] = true; e.preventDefault(); }, off = () => { st[key] = false; }; el.addEventListener('touchstart', on, { passive: false }); el.addEventListener('touchend', off); el.addEventListener('touchcancel', off); el.addEventListener('mousedown', on); el.addEventListener('mouseup', off); };
  const tap = (el, key) => { if (!el) return; el.addEventListener('touchstart', e => { once(key); e.preventDefault(); }, { passive: false }); el.addEventListener('click', () => once(key)); };
  hold(ui.btnSprint, 'sprintHeld'); tap(ui.btnJump, 'jump'); tap(ui.btnAttack, 'attack'); tap(ui.btnInteract, 'interact'); tap(ui.btnDodge, 'dodge');

  function poll() {
    // 键盘移动
    let x = 0, y = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (x || y) { const l = Math.hypot(x, y); st.move.x = x / l; st.move.y = y / l; }
    else if (stickState.id === null) { st.move.x = 0; st.move.y = 0; }
    st.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || !!st.sprintHeld;
    for (const k of ['jump', 'attack', 'heavy', 'dodge', 'interact', 'map', 'bag', 'quests', 'pause', 'view', 'time']) st[k] = st._once.has(k);
    st._once.clear();
  }
  function endFrame() { st.look.dx = 0; st.look.dy = 0; st.zoom = 0; }
  return { st, poll, endFrame, keys };
}

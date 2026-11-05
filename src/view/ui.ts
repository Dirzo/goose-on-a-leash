/** DOM layer: tuning bench and recipe book. Reads and writes the sim; never draws the game. */
import { DEFAULT_TUNING, TUNING_RANGES, type Tuning } from '../core/config';
import { BREADS, BUILDS, CATALYSTS, ITEMS, LEASHES, MATERIALS, breadById, type BuildId, type Cost, type ItemId } from '../data/recipes';
import type { GameScene } from '../scenes/GameScene';
import { applySave, clearStoredSave, decodeSave, encodeSave, snapshotSave } from '../core/save';
import { ROOMS } from '../data/rooms';
import { ROOM_ART } from './assets';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function mountUi(scene: GameScene): void {
  const sim = scene.sim;
  const keys = Object.keys(TUNING_RANGES) as (keyof Tuning)[];

  // ---- tuning bench
  const bench = $('sliders');
  bench.innerHTML = keys.map(k => {
    const r = TUNING_RANGES[k];
    return `<div class="slider"><label for="t-${k}">${r.label}</label><output id="o-${k}"></output>
      <input type="range" id="t-${k}" min="${r.min}" max="${r.max}" step="${r.step}" value="${sim.tuning[k]}"></div>`;
  }).join('');
  const fmt = (k: keyof Tuning, v: number) => {
    const u = TUNING_RANGES[k].unit;
    return u === '×' ? `×${v.toFixed(2)}` : u === 'Lv' ? `Lv ${v}` : `${v} ${u}`;
  };
  for (const k of keys) {
    const i = $<HTMLInputElement>(`t-${k}`), o = $(`o-${k}`);
    const up = () => { sim.tuning[k] = +i.value; o.textContent = fmt(k, +i.value); };
    i.addEventListener('input', up); up();
  }
  $('b-defaults').onclick = () => { for (const k of keys) { const i = $<HTMLInputElement>(`t-${k}`); i.value = String(DEFAULT_TUNING[k]); i.dispatchEvent(new Event('input')); } };
  $('b-reset').onclick = () => { scene.resetRoom(); scene.game.canvas.focus(); };
  $('b-stock').onclick = () => { sim.kit.stockAll(5); if (open) render(); };
  $('b-empty').onclick = () => { sim.kit.emptyAll(); if (open) render(); };
  $('b-book').onclick = () => openBook();

  // ---- room selection and reset
  const order = Object.values(ROOMS).sort((a, b) => rank(a.id) - rank(b.id));
  function rank(id: string): number { return id === 'willowmere' ? 0 : id.startsWith('reedmarsh-') ? +id.slice(10) : 99; }
  const pick = $<HTMLSelectElement>('room-pick');
  pick.innerHTML = order.map(r => {
    const tag = r.id === 'willowmere' ? 'Hub' : r.id.startsWith('reedmarsh-') ? `Reedmarsh ${r.id.slice(10)}` : 'Test';
    return `<option value="${r.id}">${tag} · ${esc(r.name)}${r.boss ? ' (boss)' : ''}${r.id === 'room-01' ? ' (gray-box prototype)' : ''}</option>`;
  }).join('');
  const syncPick = () => { pick.value = scene.sim.room.def.id; };
  syncPick();
  $('b-room-go').onclick = () => {
    const def = ROOMS[pick.value];
    if (!def) return;
    const artNow = !!ROOM_ART[scene.sim.room.def.id], artThere = !!ROOM_ART[def.id];
    if (artNow !== artThere) {            // switching between the painted world and the gray-box room needs a reload
      location.search = `?room=${def.id}`;
      return;
    }
    if (open) closeBook();
    scene.setPackOpen(false);
    if (rank(def.id) >= 6 && rank(def.id) < 99) scene.sim.kit.findLeash('braided');
    const entry = def.doors?.find(d => d.to !== 'END' && rank(d.to) < rank(def.id))?.id ?? null;
    scene.sim.enterRoom(def, entry, true);
    scene.saveNow();
    $('room-note').textContent = `Jumped to ${def.name}.`;
    scene.game.canvas.focus();
  };
  $('b-room-restart').onclick = () => { if (open) closeBook(); scene.setPackOpen(false); scene.resetRoom(); scene.game.canvas.focus(); };
  $('b-game-reset').onclick = () => { clearStoredSave(); if (location.search) location.search = ''; else location.reload(); };
  setInterval(() => { if (document.activeElement !== pick) syncPick(); }, 1000);

  // ---- saves
  const saveStatus = $('save-status'), codeIn = $<HTMLInputElement>('save-code');
  const say = (t: string) => { saveStatus.textContent = t; };
  if (scene.resumed) say(`Picked up where you left off: ${sim.room.def.name}. The game saves each time you enter a room.`);
  $('b-save-copy').onclick = async () => {
    const code = encodeSave(snapshotSave(sim));
    codeIn.value = code;
    try { await navigator.clipboard.writeText(code); say('Save code copied. Paste it here later (or on another device) and press Load code.'); }
    catch { codeIn.select(); say('Save code is in the box below: copy it from there.'); }
  };
  $('b-save-load').onclick = () => {
    const s = decodeSave(codeIn.value);
    if (!s) { say("That code didn't work. Check it was copied whole."); return; }
    applySave(sim, s); scene.saveNow();
    say(`Loaded: ${sim.room.def.name}.`); scene.game.canvas.focus();
  };
  let armed = false;
  $('b-save-new').onclick = () => {
    if (!armed) { armed = true; $('b-save-new').textContent = 'Press again to start over'; setTimeout(() => { armed = false; $('b-save-new').textContent = 'New game'; }, 3000); return; }
    clearStoredSave();
    if (location.search) location.search = ''; else location.reload();
  };

  // ---- recipe book
  let open = false, tab: 'leash' | 'bread' | 'satchel' = 'leash';
  const book = $('book'), body = $('book-body'), status = $('book-status');
  const chip = (b: BuildId) => `<span class="chip" style="--c:${BUILDS[b].color}">${BUILDS[b].name}</span>`;
  const ingList = (cost: Cost) => {
    const e = Object.entries(cost) as [ItemId, number][];
    if (!e.length) return '<ul class="ing"><li class="ok">Free starter</li></ul>';
    return '<ul class="ing">' + e.map(([k, v]) => `<li class="${sim.kit.mats[k] >= v ? 'ok' : 'short'}${k in CATALYSTS ? ' cat' : ''}">${esc(ITEMS[k].name)} ${Math.min(sim.kit.mats[k], v)}/${v}</li>`).join('') + '</ul>';
  };

  function render(): void {
    document.querySelectorAll<HTMLButtonElement>('.book-tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    const k = sim.kit;
    status.innerHTML = `<span>Equipped: <b>${esc(k.leashDef.name)}</b></span><span>Leash strength: <b>${sim.str()}</b> vs Goose power: <b>${sim.tuning.power}</b></span><span>Throwing: <b>${esc(breadById(k.active).name)}</b></span>`;
    if (tab === 'leash') {
      body.innerHTML = '<div class="recipes">' + LEASHES.map(r => {
        const own = k.owned.has(r.id), eq = k.leash === r.id;
        const act = eq ? '<button type="button" disabled>Equipped</button>'
          : own ? `<button type="button" class="primary" data-equip="${r.id}">Equip</button>`
          : r.found ? '<button type="button" disabled>Not found yet</button>'
          : `<button type="button" class="primary" data-craft-leash="${r.id}" ${k.canAfford(r.cost) ? '' : 'disabled'}>Craft</button>`;
        return `<article class="rc${eq ? ' equipped' : ''}"><div class="rc-top"><h3>${esc(r.name)}</h3>${chip(r.build)}</div><p class="rc-fx">${esc(r.effect)}</p><p class="rc-lore">${esc(r.lore)}</p>${own ? '<ul class="ing"><li class="ok">Owned</li></ul>' : r.found ? `<ul class="ing"><li class="short">Found: ${esc(r.found)}</li></ul>` : ingList(r.cost)}<div class="rc-act">${act}</div></article>`;
      }).join('') + '</div>';
    } else if (tab === 'bread') {
      body.innerHTML = '<div class="recipes">' + BREADS.map(r => {
        const n = k.bread[r.id], act = k.active === r.id;
        return `<article class="rc${act ? ' equipped' : ''}"><div class="rc-top"><h3>${esc(r.name)}</h3>${chip(r.build)}</div><p class="rc-fx">${esc(r.effect)}</p><p class="rc-lore">${esc(r.lore)}</p>${ingList(r.cost)}<div class="rc-act"><button type="button" class="primary" data-craft-bread="${r.id}" ${k.canAfford(r.cost) ? '' : 'disabled'}>Bake</button>${act ? '<button type="button" disabled>Ready to throw</button>' : `<button type="button" data-ready="${r.id}" ${n ? '' : 'disabled'}>Ready to throw</button>`}<span class="count">In satchel: ${n}</span></div></article>`;
      }).join('') + '</div>';
    } else {
      const tile = (id: ItemId, cat: boolean) => { const m = ITEMS[id]; return `<div class="mat${cat ? ' cat' : ''}" style="--c:${m.color}"><i></i><b>${esc(m.name)}</b><span>${k.mats[id]}</span><small>${esc(m.source)}</small></div>`; };
      body.innerHTML = '<h4>Materials</h4><div class="satchel">' + (Object.keys(MATERIALS) as ItemId[]).map(id => tile(id, false)).join('') +
        '</div><h4>Catalysts ✦</h4><div class="satchel">' + (Object.keys(CATALYSTS) as ItemId[]).map(id => tile(id, true)).join('') + '</div>';
    }
  }

  body.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.craftLeash) sim.craftLeash(d.craftLeash as never);
    if (d.equip) sim.equipLeash(d.equip as never);
    if (d.craftBread) sim.craftBread(d.craftBread as never);
    if (d.ready) sim.kit.active = d.ready as never;
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('.book-tabs [data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab as typeof tab; render(); }));

  function openBook(): void {
    open = true; scene.paused = true; book.hidden = false; render();
    $('book-close').focus(); $('b-book').classList.add('book-open');
  }
  function closeBook(): void {
    open = false; scene.paused = false; book.hidden = true;
    $('b-book').classList.remove('book-open'); scene.game.canvas.focus();
  }
  $('book-close').onclick = closeBook;
  book.addEventListener('click', e => { if (e.target === book) closeBook(); });

  scene.controls.onUi = a => {
    if (a === 'book') { if (open) closeBook(); else { scene.setPackOpen(false); openBook(); } }
    else if (a === 'pack') { if (open) closeBook(); scene.setPackOpen(!scene.packOpen); }
    else if (a === 'closeBook' || a === 'close') { if (open) closeBook(); scene.setPackOpen(false); }
    else if (a === 'patch') { if (scene.packOpen) scene.patchFromPack(); }
    else if (a === 'reset') { if (open) closeBook(); scene.setPackOpen(false); scene.resetRoom(); }
  };
}

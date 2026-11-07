/**
 * The backpack panel: Bag (how Bimbo is doing) plus three upgrade tabs, one per friend.
 *   Line (Rocco)     weave three strands into a new fishing line: click the glowing strand, over and under
 *   Bread (Biscuit)  bake a new bread: knead the dough, then pull it out of the oven when it's golden
 *   Patches (Bimbo)  sew a new patch onto the pack: click round the stitch holes in order
 * Each finished craft spends the supplies and raises that track one tier (three a track).
 */
import { C } from '../core/config';
import { BREADS, ITEMS, MATERIALS, type ItemId } from '../data/recipes';
import { INGREDIENTS } from '../data/elixir';
import { TRACKS, type Track } from '../data/upgrades';
import type { GameScene } from '../scenes/GameScene';
import { SPRITES, spriteUrl } from './assets';
import { sound } from './audio';

type Tab = 'bag' | Track;
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function setupPackUi(scene: GameScene): { refresh: () => void } {
  const panel = $('packui'), body = $('pack-body');
  const tabs = [...panel.querySelectorAll<HTMLButtonElement>('.pack-tabs button')];
  let tab: Tab = 'bag', anim = 0, frame = 0;

  // the tab pictures: little animated sprites of each friend
  const pics: [string, string][] = [['pic-pack', 'pack_ui'], ['pic-rocco', 'rocco_idle'], ['pic-biscuit', 'biscuit_walk'], ['pic-bimbo', 'bimbo']];
  function drawPics(): void {
    for (const [cls, name] of pics) {
      const el = panel.querySelector<HTMLElement>(`.${cls}`), sp = SPRITES[name], url = spriteUrl(name);
      if (!el || !sp || !url) continue;
      const k = 44 / Math.max(sp.w, sp.h), f = frame % sp.frames;
      el.style.backgroundImage = `url(${url})`;
      el.style.backgroundSize = `${sp.w * sp.frames * k}px ${sp.h * k}px`;
      el.style.backgroundPosition = `${-f * sp.w * k + (44 - sp.w * k) / 2}px ${(44 - sp.h * k) / 2}px`;
    }
  }

  function setTab(t: Tab): void {
    tab = t; craft = null;
    tabs.forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    render();
  }
  tabs.forEach(b => { b.onclick = () => setTab(b.dataset.tab as Tab); });

  scene.onPackToggle = on => {
    panel.hidden = !on;
    if (on) { setTab(tab); drawPics(); anim = window.setInterval(() => { frame++; drawPics(); }, 140); }
    else { window.clearInterval(anim); craft = null; }
  };

  // ---------------------------------------------------------------- the Bag tab
  function bag(): string {
    const sim = scene.sim, pk = sim.pack, k = sim.kit, lvl = Math.max(0, Math.min(1, pk.water));
    const mood = lvl > 0.6 ? 'Bimbo is happy. Splashy, even.' : lvl > 0.3 ? 'Bimbo is getting thirsty…' : 'Bimbo is GASPING. Water, now!';
    const sup = (Object.keys(MATERIALS) as ItemId[]).filter(id => id !== 'fluff' && k.mats[id]).map(id => `${ITEMS[id].name} ${k.mats[id]}`).join(' · ') || 'nothing much';
    const breads = BREADS.filter(b => k.bread[b.id] > 0).map(b => `${b.name} ×${k.bread[b.id]}`).join(' · ') || 'no bread';
    const have = INGREDIENTS.filter(i => k.ingredients.has(i.id));
    const canPatch = pk.holes > 0 && pk.needles > 0 && k.mats.fluff > 0;
    const row = (a: string, b: string, cls = '') => `<dt>${a}</dt><dd class="${cls}">${b}</dd>`;
    return `<h3>Backpack</h3><p class="sub">${mood}</p><dl class="pack-rows">`
      + row('Water', `${Math.ceil(lvl * 100)}%`, lvl < 0.3 ? 'bad' : '')
      + row('Leak', `−${(sim.leakRate() * 100).toFixed(1)}% a second`, pk.holes ? 'bad' : '')
      + row('Open tears', `${pk.holes}`, pk.holes ? 'bad' : 'good')
      + row('Patches sewn', `${pk.patches}`)
      + row('Needle uses', `${pk.needles} (a sewing kit gives ${C.kitNeedles})`, pk.needles ? '' : 'bad')
      + row('Twine', `${k.mats.fluff}`, k.mats.fluff ? '' : 'bad')
      + row('Supplies', esc(sup)) + row('Bread', esc(breads))
      + row('Leash', esc(`${k.leashDef.name}${k.reel ? ' · Spinning Reel' : ''}`))
      + row('Elixir', `${have.length} of ${INGREDIENTS.length}`)
      + row('Upgrades', `Line ${k.up.line}/3 · Bread ${k.up.bread}/3 · Patches ${k.up.patch}/3`)
      + `</dl><div class="craft"><button type="button" class="big" id="pk-patch" ${canPatch ? '' : 'disabled'}>${canPatch ? 'Patch a tear [P]' : pk.holes ? (pk.needles ? 'Need twine to patch' : 'Need a sewing kit to patch') : 'No tears to patch'}</button></div>`;
  }

  // ---------------------------------------------------------------- the upgrade tabs
  /** The hands-on part in progress: how far along, plus any timer state. */
  let craft: { step: number; total: number; phase?: 'knead' | 'oven'; t0?: number; raf?: number } | null = null;

  function upgradeTab(t: Track): string {
    const sim = scene.sim, k = sim.kit, tr = TRACKS[t], u = sim.nextUpgrade(t);
    const pips = tr.tiers.map((_, i) => `<i class="${i < k.up[t] ? 'got' : ''}"></i>`).join('');
    let html = `<h3>${tr.title} <small>· for ${tr.who}</small></h3><div class="pips" aria-label="${k.up[t]} of 3 made">${pips}</div>`;
    if (!u) return html + `<p class="maxed">All three made. ${tr.who === 'Bimbo' ? 'Bimbo has the best-sewn house in the valley.' : tr.who === 'Biscuit' ? 'Biscuit is as bready as a goose can be.' : "Rocco's line is the finest in the valley."}</p>`;
    const cost = Object.entries(u.cost).map(([id, n]) => {
      const have = k.mats[id as ItemId] ?? 0;
      return `<span class="${have < n! ? 'short' : ''}">${ITEMS[id as ItemId].name} ${have}/${n}</span>`;
    }).join('') + (u.needles ? `<span class="${sim.pack.needles < u.needles ? 'short' : ''}">Needle uses ${sim.pack.needles}/${u.needles}</span>` : '');
    html += `<div class="up-card"><b>${esc(u.name)}</b><div>${esc(u.does)}</div><div class="cost">${cost}</div></div>`;
    const ok = sim.canUpgrade(t);
    if (!craft) return html + `<div class="craft"><button type="button" class="big" id="pk-start" ${ok ? '' : 'disabled'}>${ok ? `${tr.verb} it` : 'Not enough supplies yet'}</button>`
      + `<div class="hint">${ok ? '' : t === 'patch' ? 'Sewing kits give needle uses; spools and frogs give twine.' : t === 'bread' ? 'Frogs drop old crust; muck splashes up when things fall in the water.' : 'The tackle box by the path restocks fishing line; spools give twine.'}</div></div>`;
    return html + `<div class="craft" id="pk-craft">${t === 'line' ? weaveSvg() : t === 'bread' ? bakeHtml() : sewSvg()}</div>`;
  }

  // weave: three strands; click the glowing one, over and under, nine times
  const WEAVE = 9, ORDER = [0, 2, 1, 0, 2, 1, 0, 2, 1];
  function weaveSvg(): string {
    const c = craft!, xs = [70, 130, 190], colours = ['#c9a46a', '#e9e4d6', '#8fb0c8'];
    let segs = '';
    for (let i = 0; i < c.step; i++) {
      const y = 30 + i * 16, a = ORDER[i]!, b = ORDER[i + 1] ?? 1;
      segs += `<path d="M${xs[a]} ${y} C ${xs[a]} ${y + 8}, ${xs[b]} ${y + 6}, ${xs[b]} ${y + 16}" stroke="${colours[a]}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
    }
    const next = ORDER[c.step] ?? -1, top = 30 + c.step * 16;
    // the loose ends hang below the weave; a wide invisible line makes each easy to click
    const strands = xs.map((x, i) => `<g class="strand${i === next ? ' next' : ''}" data-s="${i}"><line x1="${x}" y1="${top}" x2="${x + (i - 1) * 10 + 3}" y2="200" stroke="${colours[i]}" stroke-width="${i === next ? 9 : 6}" stroke-linecap="round" opacity="${i === next ? 1 : 0.55}"/><line x1="${x}" y1="${top}" x2="${x + (i - 1) * 10 + 3}" y2="200" stroke="transparent" stroke-width="30"/></g>`).join('');
    return `<svg viewBox="0 0 260 210" role="img" aria-label="Weaving the line">${segs}${strands}<rect x="40" y="10" width="180" height="14" rx="3" fill="#6e5232"/></svg>`
      + `<div class="hint">Click the glowing strand to cross it over (${c.step}/${WEAVE}). Space works too.</div>`;
  }

  // bake: knead the dough six times, then take it out of the oven when the marker is in the golden band
  const KNEAD = 6;
  function bakeHtml(): string {
    const c = craft!;
    if (c.phase !== 'oven') {
      const sq = 1 + c.step * 0.04;
      return `<svg viewBox="0 0 260 160" role="img" aria-label="Kneading dough"><ellipse cx="130" cy="140" rx="110" ry="12" fill="#b08a5a"/>`
        + `<ellipse class="dough" id="pk-dough" cx="130" cy="${110 - c.step * 2}" rx="${60 * sq}" ry="${36 / sq}" fill="#f0d8a0" stroke="#c8a060" stroke-width="3"/>`
        + `<text pointer-events="none" x="130" y="${112 - c.step * 2}" text-anchor="middle" font-size="14" fill="#8a6a44">${c.step ? '•  •' : ''}</text></svg>`
        + `<div class="hint">Knead the dough: click it (${c.step}/${KNEAD}).</div>`;
    }
    return `<svg viewBox="0 0 260 120" role="img" aria-label="The oven"><rect x="40" y="10" width="180" height="100" rx="10" fill="#5a4a3a"/><rect x="60" y="30" width="140" height="62" rx="6" fill="#ff9a40" opacity="0.85"/><ellipse cx="130" cy="68" rx="46" ry="18" fill="#e8b060"/></svg>`
      + `<div class="oven-bar"><i id="pk-marker"></i></div><button type="button" class="big" id="pk-take">Take it out!</button><div class="hint">Wait for the golden band…</div>`;
  }

  // sew: eight stitch holes round a patch; click them in order
  const HOLES: [number, number][] = [[80, 40], [130, 32], [180, 40], [192, 90], [180, 140], [130, 148], [80, 140], [68, 90]];
  function sewSvg(): string {
    const c = craft!;
    let stitches = '';
    for (let i = 1; i <= c.step && i < HOLES.length + 1; i++) {
      const a = HOLES[i - 1]!, b = HOLES[i % HOLES.length]!;
      if (i < c.step || c.step === HOLES.length) stitches += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#3a2a1a" stroke-width="3" stroke-dasharray="6 4"/>`;
    }
    const dots = HOLES.map(([x, y], i) => `<circle class="stitch-dot${i === c.step % HOLES.length && c.step < HOLES.length ? ' next' : ''}" data-h="${i}" cx="${x}" cy="${y}" r="${i === c.step ? 9 : 6}" fill="${i < c.step ? '#3a2a1a' : i === c.step ? '#f2c230' : '#fffaf0'}" stroke="#3a2a1a" stroke-width="2"/>`).join('');
    return `<svg viewBox="0 0 260 180" role="img" aria-label="Sewing a patch"><rect x="60" y="20" width="140" height="140" fill="#7a5a3a"/><rect x="78" y="40" width="104" height="100" rx="8" fill="${scene.sim.kit.up.patch >= 1 ? '#8a7a5a' : '#c8a070'}"/>${stitches}${dots}</svg>`
      + `<div class="hint">Stitch round the patch: click the glowing hole (${Math.min(c.step, HOLES.length)}/${HOLES.length}).</div>`;
  }

  function finish(t: Track, line?: string): void {
    if (craft?.raf) cancelAnimationFrame(craft.raf);
    craft = null;
    if (!scene.upgrade(t)) { render(); return; }
    sound.honk(3);
    render();
    // a little burst of confetti and the tier's name
    const tier = scene.sim.kit.up[t], name = TRACKS[t].tiers[tier - 1]!.name;
    const box = document.createElement('div'); box.className = 'celebrate';
    box.innerHTML = `<b>${esc(name)}!</b>` + Array.from({ length: 18 }, (_, i) => {
      const a = (i / 18) * Math.PI * 2, d = 90 + Math.random() * 60;
      return `<span class="bit" style="--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;background:${['#f2c230', '#e86a5a', '#8fe0d0', '#9ae0ff'][i % 4]}"></span>`;
    }).join('');
    body.appendChild(box);
    const done = document.createElement('p'); done.className = 'sub'; done.textContent = (line ? line + ' ' : '') + TRACKS[t].tiers[tier - 1]!.done;
    body.querySelector('.pips')?.after(done);
    window.setTimeout(() => box.remove(), 1400);
  }

  function step(t: Track, ok: boolean): void {
    if (!craft) return;
    if (!ok) { sound.play('mutter'); return; }
    craft.step++;
    sound.play(t === 'line' ? 'slide' : t === 'bread' ? 'gnaw' : 'eep');
    if (t === 'line' && craft.step >= WEAVE) return finish(t);
    if (t === 'patch' && craft.step >= HOLES.length) return finish(t);
    if (t === 'bread' && craft.phase !== 'oven' && craft.step >= KNEAD) { craft.phase = 'oven'; craft.t0 = performance.now(); render(); startOven(); return; }
    render();
  }

  function startOven(): void {
    const tick = () => {
      if (!craft || craft.phase !== 'oven') return;
      const m = document.getElementById('pk-marker');
      const p = ((performance.now() - craft.t0!) / 1600) % 2, x = p < 1 ? p : 2 - p;   // sweeps back and forth
      if (m) m.style.left = `calc(${x * 100}% - 2px)`;
      craft.step = x;
      craft.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function render(): void {
    body.innerHTML = tab === 'bag' ? bag() : upgradeTab(tab);
    const patch = document.getElementById('pk-patch');
    if (patch) patch.onclick = () => { scene.patchFromPack(); render(); };
    const start = document.getElementById('pk-start');
    if (start && tab !== 'bag') start.onclick = () => { craft = { step: 0, total: 0, phase: tab === 'bread' ? 'knead' : undefined }; render(); };
    if (!craft || tab === 'bag') return;
    const t = tab;
    body.querySelectorAll<SVGElement>('.strand').forEach(el => el.addEventListener('click', () => step(t, +(el.dataset.s ?? -1) === ORDER[craft!.step])));
    body.querySelectorAll<SVGElement>('.stitch-dot').forEach(el => el.addEventListener('click', () => step(t, +el.dataset.h! === craft!.step)));
    const dough = document.getElementById('pk-dough');
    if (dough) dough.addEventListener('click', () => { dough.classList.add('squish'); window.setTimeout(() => dough.classList.remove('squish'), 90); step(t, true); });
    const take = document.getElementById('pk-take');
    if (take) take.onclick = () => {
      const x = craft?.step ?? 0, golden = x >= 0.55 && x <= 0.75;
      finish('bread', golden ? 'Perfectly golden!' : x < 0.55 ? 'A bit doughy in the middle. Biscuit does not care.' : 'A little singed. Biscuit eats the burnt bits first.');
    };
  }

  // keyboard: Space does the obvious next thing in a craft; 1-4 switch tabs
  window.addEventListener('keydown', e => {
    if (panel.hidden) return;
    if (['1', '2', '3', '4'].includes(e.key)) { setTab((['bag', 'line', 'bread', 'patch'] as Tab[])[+e.key - 1]!); e.preventDefault(); e.stopPropagation(); return; }
    if (e.key !== ' ' || !craft || tab === 'bag') return;
    e.preventDefault(); e.stopPropagation();
    if (tab === 'line') step('line', true);
    else if (tab === 'patch') step('patch', true);
    else if (craft.phase === 'oven') document.getElementById('pk-take')?.click();
    else step('bread', true);
  }, true);
  return { refresh: () => { if (!panel.hidden) render(); } };
}

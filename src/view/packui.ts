/**
 * The backpack panel, with no words: a Bag tab (Bimbo's water, tears, supplies as icons) and three upgrade tabs,
 * one per friend. Each upgrade tab shows only the progress pips, what the next tier costs (icons + counts), and
 * a little hands-on puzzle that's playable whenever the supplies are there (locked and dimmed when they aren't).
 *   Line (Rocco)     weave: click the glowing strand, over and under, until the rope is plaited
 *   Bread (Biscuit)  bake: knead the dough, then pull it from the oven while the marker is in the gold
 *   Patches (Bimbo)  sew: click round the stitch holes in order
 * Finishing one spends the supplies and fills a pip (three a track).
 */
import { ITEMS, MATERIALS, type ItemId } from '../data/recipes';
import { TRACKS, type Track } from '../data/upgrades';
import type { GameScene } from '../scenes/GameScene';
import { SPRITES, spriteUrl } from './assets';
import { sound } from './audio';

type Tab = 'bag' | Track;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Tiny pixel-ish icons for supplies (titles give the name on hover and to screen readers; nothing is printed). */
function icon(id: string, size = 26): string {
  const c = (ITEMS as Record<string, { color: string; name: string }>)[id]?.color ?? '#c9bea3';
  const name = (ITEMS as Record<string, { name: string }>)[id]?.name ?? (id === 'needle' ? 'Needle uses' : id === 'water' ? 'Water' : id === 'tear' ? 'Tears' : id);
  const shapes: Record<string, string> = {
    mop: `<circle cx="12" cy="12" r="8" fill="none" stroke="${c}" stroke-width="3"/><circle cx="12" cy="12" r="4" fill="none" stroke="${c}" stroke-width="2"/>`,
    fluff: `<rect x="6" y="4" width="12" height="3" fill="#8a6a44"/><rect x="6" y="17" width="12" height="3" fill="#8a6a44"/><rect x="7" y="7" width="10" height="10" fill="${c}"/><path d="M7 9h10M7 12h10M7 15h10" stroke="#a88a50" stroke-width="1"/>`,
    crust: `<path d="M4 15c0-6 4-9 8-9s8 3 8 9v3H4z" fill="${c}"/><path d="M8 10l2 2M12 9l2 2M16 10l1 2" stroke="#8a5a20" stroke-width="1.5"/>`,
    goo: `<path d="M5 18c-2-5 2-11 7-11s9 6 7 11z" fill="${c}"/><circle cx="10" cy="12" r="1.6" fill="#e8ffe8"/>`,
    down: `<path d="M12 3c5 4 6 10 1 17-6-5-6-12-1-17z" fill="${c}" stroke="#c8c2b0" stroke-width="1"/><path d="M12 6v14" stroke="#c8c2b0"/>`,
    glass: `<path d="M12 3l7 7-7 11-7-11z" fill="${c}" stroke="#3a8a80" stroke-width="1.2"/>`,
    egg: `<ellipse cx="12" cy="13" rx="6.5" ry="8" fill="${c}" stroke="#b08a10" stroke-width="1.2"/>`,
    chain: `<path d="M4 14c2-7 14-7 16 0l-3 4H7z" fill="${c}"/><path d="M8 13h8M12 9v8" stroke="#4a5560" stroke-width="1.2"/>`,
    needle: `<path d="M5 19L18 6" stroke="#9aa3a6" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="18" cy="6" rx="2" ry="1.2" fill="none" stroke="#3a2a1a" transform="rotate(-45 18 6)"/>`,
    water: `<path d="M12 3c4 6 7 9 7 12a7 7 0 0 1-14 0c0-3 3-6 7-12z" fill="#2f7fb0"/>`,
    tear: `<path d="M5 5l14 14M19 5L5 19" stroke="#b0382a" stroke-width="3" stroke-linecap="round"/>`,
  };
  return `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" role="img" aria-label="${name}"><title>${name}</title>${shapes[id] ?? `<circle cx="12" cy="12" r="7" fill="${c}"/>`}</svg>`;
}

export function setupPackUi(scene: GameScene): { refresh: () => void } {
  const panel = $('packui'), body = $('pack-body');
  const tabs = [...panel.querySelectorAll<HTMLButtonElement>('.pack-tabs button')];
  let tab: Tab = 'bag', anim = 0, frame = 0;

  // the tab pictures: little animated sprites of each friend
  const pics: [string, string][] = [['pic-pack', 'pack_ui'], ['pic-rocco', 'rocco_idle'], ['pic-biscuit', 'biscuit_walk'], ['pic-bimbo', 'bimbo']];
  function drawPics(): void {
    for (const [cls, name] of pics) {
      for (const el of panel.querySelectorAll<HTMLElement>(`.${cls}`)) {
        const sp = SPRITES[name], url = spriteUrl(name);
        if (!sp || !url) continue;
        const box = el.clientWidth || 44, k = box / Math.max(sp.w, sp.h), f = frame % sp.frames;
        el.style.backgroundImage = `url(${url})`;
        el.style.backgroundSize = `${sp.w * sp.frames * k}px ${sp.h * k}px`;
        el.style.backgroundPosition = `${-f * sp.w * k + (box - sp.w * k) / 2}px ${(box - sp.h * k) / 2}px`;
      }
    }
  }

  function setTab(t: Tab): void {
    if (craft?.raf) cancelAnimationFrame(craft.raf);
    tab = t; craft = null;
    tabs.forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    render();
  }
  tabs.forEach(b => { b.onclick = () => setTab(b.dataset.tab as Tab); });

  scene.onPackToggle = on => {
    panel.hidden = !on;
    if (on) { setTab(tab); drawPics(); anim = window.setInterval(() => { frame++; drawPics(); }, 140); }
    else { window.clearInterval(anim); if (craft?.raf) cancelAnimationFrame(craft.raf); craft = null; }
  };

  const pipsOf = (n: number, label: string) => `<div class="pips" role="img" aria-label="${label} ${n} of 3">${[0, 1, 2].map(i => `<i class="${i < n ? 'got' : ''}"></i>`).join('')}</div>`;

  // ---------------------------------------------------------------- the Bag tab: all pictures
  function bag(): string {
    const sim = scene.sim, pk = sim.pack, k = sim.kit, lvl = Math.max(0, Math.min(1, pk.water));
    const canPatch = pk.holes > 0 && pk.needles > 0 && k.mats.fluff > 0;
    const mats = (Object.keys(MATERIALS) as ItemId[]).filter(id => k.mats[id]).map(id => `<span class="pk-chip">${icon(id)}<b>${k.mats[id]}</b></span>`).join('');
    return `<div class="bag-water" role="img" aria-label="Water ${Math.ceil(lvl * 100)}%">${icon('water', 30)}<div class="bar"><i style="width:${lvl * 100}%" class="${lvl < 0.3 ? 'low' : ''}"></i></div></div>`
      + `<div class="pk-chips"><span class="pk-chip">${icon('tear')}<b>${pk.holes}</b></span><span class="pk-chip">${icon('needle')}<b>${pk.needles}</b></span><span class="pk-chip">${icon('fluff')}<b>${k.mats.fluff}</b></span>`
      + `<button type="button" class="patch-btn" id="pk-patch" ${canPatch ? '' : 'disabled'} aria-label="Patch a tear">${icon('needle', 30)}${icon('fluff', 22)}</button></div>`
      + `<div class="pk-chips">${mats}</div>`
      + `<div class="ups">${(['line', 'bread', 'patch'] as Track[]).map(t => `<div class="up-row"><span class="tab-pic ${t === 'line' ? 'pic-rocco' : t === 'bread' ? 'pic-biscuit' : 'pic-bimbo'} small"></span>${pipsOf(k.up[t], TRACKS[t].title)}</div>`).join('')}</div>`;
  }

  // ---------------------------------------------------------------- the upgrade tabs: pips, cost, puzzle
  let craft: { step: number; phase?: 'knead' | 'oven'; t0?: number; raf?: number; x?: number } | null = null;

  function upgradeTab(t: Track): string {
    const sim = scene.sim, k = sim.kit, u = sim.nextUpgrade(t);
    const lvl = k.up[t], tr = TRACKS[t];
    const tip = tr.tiers.map((x, i) => `${i < lvl ? '★' : '☆'} ${x.name}: ${x.does}`).join('\n');
    let html = `<div class="pk-head" title="${tip.replace(/"/g, '&quot;')}" tabindex="0"><h3>${tr.title}</h3>${pipsOf(lvl, tr.title)}</div>`;
    if (!u) return html + `<div class="maxed"><span class="tab-pic big ${t === 'line' ? 'pic-rocco' : t === 'bread' ? 'pic-biscuit' : 'pic-bimbo'}"></span><div class="stars">★ ★ ★</div></div>`;
    const cost = Object.entries(u.cost).map(([id, n]) => {
      const have = k.mats[id as ItemId] ?? 0;
      return `<span class="pk-chip ${have < n! ? 'short' : ''}">${icon(id)}<b>${have}/${n}</b></span>`;
    }).join('') + (u.needles ? `<span class="pk-chip ${sim.pack.needles < u.needles ? 'short' : ''}">${icon('needle')}<b>${sim.pack.needles}/${u.needles}</b></span>` : '');
    const ok = sim.canUpgrade(t);
    if (ok && !craft) craft = { step: 0, phase: t === 'bread' ? 'knead' : undefined };
    if (!ok) craft = null;
    const c = craft ?? { step: 0, phase: t === 'bread' ? 'knead' as const : undefined };
    const game = t === 'line' ? weaveSvg(c) : t === 'bread' ? bakeHtml(c) : sewSvg(c);
    return html + `<div class="pk-chips">${cost}</div><div class="craft ${ok ? '' : 'locked'}" id="pk-craft">${game}${ok ? '' : '<div class="lock" aria-label="Not enough supplies">🔒</div>'}</div>`;
  }

  // weave: three strands; click the glowing one, over and under, nine times
  const WEAVE = 9, ORDER = [0, 2, 1, 0, 2, 1, 0, 2, 1];
  function weaveSvg(c: { step: number }): string {
    const xs = [70, 130, 190], colours = ['#c9a46a', '#e9e4d6', '#8fb0c8'];
    let segs = '';
    for (let i = 0; i < c.step; i++) {
      const y = 30 + i * 16, a = ORDER[i]!, b = ORDER[i + 1] ?? 1;
      segs += `<path d="M${xs[a]} ${y} C ${xs[a]} ${y + 8}, ${xs[b]} ${y + 6}, ${xs[b]} ${y + 16}" stroke="${colours[a]}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
    }
    const next = ORDER[c.step] ?? -1, top = 30 + c.step * 16;
    const strands = xs.map((x, i) => `<g class="strand${i === next ? ' next' : ''}" data-s="${i}"><line x1="${x}" y1="${top}" x2="${x + (i - 1) * 10 + 3}" y2="200" stroke="${colours[i]}" stroke-width="${i === next ? 9 : 6}" stroke-linecap="round" opacity="${i === next ? 1 : 0.55}"/><line x1="${x}" y1="${top}" x2="${x + (i - 1) * 10 + 3}" y2="200" stroke="transparent" stroke-width="30"/></g>`).join('');
    return `<svg viewBox="0 0 260 210" role="img" aria-label="Weave: click the glowing strand">${segs}${strands}<rect x="40" y="10" width="180" height="14" rx="3" fill="#6e5232"/></svg>`;
  }

  // bake: knead the dough six times, then take it out of the oven when the marker is in the gold
  const KNEAD = 6;
  function bakeHtml(c: { step: number; phase?: string }): string {
    if (c.phase !== 'oven') {
      const sq = 1 + c.step * 0.04;
      return `<svg viewBox="0 0 260 160" role="img" aria-label="Knead: click the dough"><ellipse cx="130" cy="140" rx="110" ry="12" fill="#b08a5a"/>`
        + `<ellipse class="dough" id="pk-dough" cx="130" cy="${110 - c.step * 2}" rx="${60 * sq}" ry="${36 / sq}" fill="#f0d8a0" stroke="#c8a060" stroke-width="3"/>`
        + Array.from({ length: c.step }, (_, i) => `<circle pointer-events="none" cx="${100 + i * 12}" cy="${104 - c.step * 2}" r="2.5" fill="#c8a060"/>`).join('') + `</svg>`
        + `<div class="dots">${Array.from({ length: KNEAD }, (_, i) => `<i class="${i < c.step ? 'got' : ''}"></i>`).join('')}</div>`;
    }
    return `<svg viewBox="0 0 260 120" role="img" aria-label="Oven"><rect x="40" y="10" width="180" height="100" rx="10" fill="#5a4a3a"/><rect x="60" y="30" width="140" height="62" rx="6" fill="#ff9a40" opacity="0.85"/><ellipse cx="130" cy="68" rx="46" ry="18" fill="#e8b060"/></svg>`
      + `<div class="oven-bar"><i id="pk-marker"></i></div><button type="button" class="big" id="pk-take" aria-label="Take it out">🍞</button>`;
  }

  // sew: eight stitch holes round a patch; click them in order
  const HOLES: [number, number][] = [[80, 40], [130, 32], [180, 40], [192, 90], [180, 140], [130, 148], [80, 140], [68, 90]];
  function sewSvg(c: { step: number }): string {
    let stitches = '';
    for (let i = 1; i < c.step; i++) {
      const a = HOLES[i - 1]!, b = HOLES[i]!;
      stitches += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#3a2a1a" stroke-width="3" stroke-dasharray="6 4"/>`;
    }
    const dots = HOLES.map(([x, y], i) => `<circle class="stitch-dot${i === c.step ? ' next' : ''}" data-h="${i}" cx="${x}" cy="${y}" r="${i === c.step ? 10 : 6}" fill="${i < c.step ? '#3a2a1a' : i === c.step ? '#f2c230' : '#fffaf0'}" stroke="#3a2a1a" stroke-width="2"/>`).join('');
    return `<svg viewBox="0 0 260 180" role="img" aria-label="Sew: click the glowing hole"><rect x="60" y="20" width="140" height="140" fill="#7a5a3a"/><rect x="78" y="40" width="104" height="100" rx="8" fill="${['#c8a070', '#a89060', '#8a7a5a', '#7c8794'][scene.sim.kit.up.patch]}"/>${stitches}${dots}</svg>`;
  }

  function finish(t: Track, perfect = false): void {
    if (craft?.raf) cancelAnimationFrame(craft.raf);
    craft = null;
    if (!scene.upgrade(t)) { render(); return; }
    sound.play('tada');
    render();
    const box = document.createElement('div'); box.className = 'celebrate';
    box.innerHTML = `<span class="star">${perfect ? '★★' : '★'}</span>` + Array.from({ length: 22 }, (_, i) => {
      const a = (i / 22) * Math.PI * 2, d = 90 + Math.random() * 70;
      return `<span class="bit" style="--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;background:${['#f2c230', '#e86a5a', '#8fe0d0', '#9ae0ff'][i % 4]}"></span>`;
    }).join('');
    body.appendChild(box);
    window.setTimeout(() => box.remove(), 1300);
  }

  function step(t: Track, ok: boolean): void {
    if (!craft) return;
    if (!ok) { sound.play('mutter'); return; }
    sound.play(t === 'line' ? 'pluck' : t === 'bread' ? 'squish' : 'stitch', craft.step);
    craft.step++;
    if (t === 'line' && craft.step >= WEAVE) return finish(t);
    if (t === 'patch' && craft.step >= HOLES.length) return finish(t);
    if (t === 'bread' && craft.phase !== 'oven' && craft.step >= KNEAD) { craft.phase = 'oven'; craft.t0 = performance.now(); render(); startOven(); return; }
    render();
  }

  /** Where the oven marker is (0..1): it sweeps back and forth every 1.6 s. Worked out from the clock, so a slow frame can't cheat or rob you. */
  function ovenX(): number { const p = ((performance.now() - (craft?.t0 ?? 0)) / 1600) % 2; return p < 1 ? p : 2 - p; }
  function startOven(): void {
    const tick = () => {
      if (!craft || craft.phase !== 'oven') return;
      const m = document.getElementById('pk-marker'), x = ovenX();
      if (m) m.style.left = `calc(${x * 100}% - 2px)`;
      if ((craft.x ?? 0) < 0.55 && x >= 0.55) sound.play('blip');           // a little tick as it turns golden
      craft.x = x;
      craft.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function render(): void {
    body.innerHTML = tab === 'bag' ? bag() : upgradeTab(tab);
    drawPics();
    const patch = document.getElementById('pk-patch');
    if (patch) patch.onclick = () => { scene.patchFromPack(); render(); };
    if (!craft || tab === 'bag') return;
    const t = tab;
    body.querySelectorAll<SVGElement>('.strand').forEach(el => el.addEventListener('click', () => step(t, +(el.dataset.s ?? -1) === ORDER[craft!.step])));
    body.querySelectorAll<SVGElement>('.stitch-dot').forEach(el => el.addEventListener('click', () => step(t, +(el.dataset.h ?? -1) === craft!.step)));
    const dough = document.getElementById('pk-dough');
    if (dough) dough.addEventListener('click', () => { dough.classList.add('squish'); window.setTimeout(() => dough.classList.remove('squish'), 90); step(t, true); });
    const take = document.getElementById('pk-take');
    if (take) take.onclick = () => {
      const x = ovenX();
      if (x > 0.75) { sound.play('burnt'); craft!.t0 = performance.now(); return; }      // burnt: try again, supplies kept
      if (x < 0.55) { sound.play('mutter'); return; }                                    // still doughy
      sound.play('ovending'); finish('bread', x > 0.6 && x < 0.7);
    };
    if (craft.phase === 'oven' && !craft.raf) startOven();
  }

  // keyboard: Space does the next thing in a puzzle; 1-4 switch tabs
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

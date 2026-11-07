/** DOM layer: tuning bench and recipe book. Reads and writes the sim; never draws the game. */
import { HATS, HAT_BY_ID } from '../data/hats';
import { setupPackUi } from './packui';
const pickQ = (a: string[]): string => a[Math.floor(Math.random() * a.length)]!;
import { count, exportStats, top, STATS } from './analytics';
import { loadBoard, playerName, setPlayerName, type BasementRun } from './leaderboard';
import { ACTION_NAMES, DEFAULT_KEYS, SETTINGS, bind, keyLabel, saveSettings, type Action } from './settings';
import { DEFAULT_TUNING, DIFFICULTY, TUNING_RANGES, type Difficulty, type Tuning } from '../core/config';
import { BREADS, BUILDS, CATALYSTS, ITEMS, LEASHES, MATERIALS, breadById, type BuildId, type Cost, type ItemId } from '../data/recipes';
import type { GameScene } from '../scenes/GameScene';
import { applySave, clearStoredSave, decodeSave, encodeSave, snapshotSave } from '../core/save';
import { ROOMS } from '../data/rooms';
import { BRANCHES, TRAITS, type TraitId } from '../data/traits';
import { ROOM_ART, spriteUrl } from './assets';
import { FISH } from '../core/fishing';
import { sound } from './audio';

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
  function rank(id: string): number { return id === 'willowmere' ? 0 : id.startsWith('reedmarsh-') ? +id.slice(10) : id.startsWith('hollowbark-') ? 10 + +id.slice(11) : id.startsWith('driftwood-') ? 20 + +id.slice(10) : id.startsWith('tide-') ? 30 + +id.slice(5) : id.startsWith('castle-') ? 40 + +id.slice(7) : 99; }
  const pick = $<HTMLSelectElement>('room-pick');
  pick.innerHTML = order.map(r => {
    const tag = r.id === 'willowmere' ? 'Hub' : r.id.startsWith('reedmarsh-') ? `Reedmarsh ${r.id.slice(10)}` : r.id.startsWith('hollowbark-') ? `Hollowbark ${r.id.slice(11)}` : r.id.startsWith('driftwood-') ? `Driftwood ${r.id.slice(10)}` : r.id.startsWith('tide-') ? `Tide Caves ${r.id.slice(5)}` : r.id.startsWith('castle-') ? `Castle ${r.id.slice(7)}` : r.id === 'basement' ? 'Endless' : 'Test';
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
    if (rank(def.id) >= 3 && rank(def.id) < 99) scene.sim.kit.findLeash('braided');
    if (rank(def.id) >= 11 && rank(def.id) < 99) scene.sim.kit.oar = true;
    if (rank(def.id) >= 14 && rank(def.id) < 99) scene.sim.kit.findLeash('vine');
    if (rank(def.id) >= 22 && rank(def.id) < 99) scene.sim.kit.reel = true;
    const entry = def.doors?.find(d => d.to !== 'END' && rank(d.to) < rank(def.id))?.id ?? null;
    scene.sim.enterRoom(def, entry, true);
    scene.saveNow();
    $('room-note').textContent = `Jumped to ${def.name}.`;
    scene.game.canvas.focus();
  };
  $('b-room-restart').onclick = () => { if (open) closeBook(); scene.setPackOpen(false); scene.resetRoom(); scene.game.canvas.focus(); };
  const soundBtn = $('b-sound'), soundLabel = () => { soundBtn.textContent = `Sound: ${sound.muted ? 'off' : 'on'} [M]`; };
  soundLabel(); sound.onChange = soundLabel;
  soundBtn.onclick = () => { sound.toggle(); scene.game.canvas.focus(); };
  const diffBtn = $('b-diff'), diffLabel = () => { const d = DIFFICULTY[scene.difficulty]; diffBtn.textContent = `Difficulty: ${d.name}`; diffBtn.title = d.blurb + ' Bosses change from the next room you enter.'; };
  diffLabel();
  diffBtn.onclick = () => { const order: Difficulty[] = ['story', 'normal', 'brutal']; scene.setDifficulty(order[(order.indexOf(scene.difficulty) + 1) % 3]!); diffLabel(); scene.game.canvas.focus(); };
  const cineBtn = $('b-cine'), cineLabel = () => { cineBtn.textContent = `Cinematics: ${scene.cinemaOn ? 'on' : 'off'}`; };
  cineLabel();
  cineBtn.onclick = () => { scene.setCinemaOn(!scene.cinemaOn); cineLabel(); scene.game.canvas.focus(); };
  $('b-cine-replay').onclick = () => { scene.sim.seen.clear(); scene.replayHere(); scene.game.canvas.focus(); };
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
  let open = false, tab: 'leash' | 'bread' | 'satchel' | 'biscuit' = 'leash';
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
    status.innerHTML = `<span>Equipped: <b>${esc(k.leashDef.name)}</b></span><span>Leash strength: <b>${sim.str()}</b> vs Goose power: <b>${sim.power()}</b></span><span>Throwing: <b>${esc(breadById(k.active).name)}</b></span>`;
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
    } else if (tab === 'biscuit') {
      const bonus = sim.power() - sim.tuning.power;
      const head = `<p class="biscuit-head">Golden Feathers: <b>${k.mats.feather}</b> · Goose Power <b>${sim.power()}</b>` +
        (bonus ? ` (bench ${sim.tuning.power} + ${bonus} from traits)` : '') + ` · Leash strength <b>${sim.str()}</b>` +
        (sim.gap() > 0 ? ' · <span class="warn">Biscuit is stronger than his leash: craft a better one.</span>' : '') + '</p>' +
        `<p class="biscuit-where">${sim.atShrine ? 'You are at the shrine. Pick a trait.' : "Learn traits at Biscuit's shrine in Willowmere Pond (by the path, south of the start)."} Every two traits add one Goose Power.</p>`;
      body.innerHTML = head + '<div class="branches">' + BRANCHES.map(br => '<div class="branch">' + chip(br) +
        TRAITS.filter(t => t.branch === br).map(t => {
          const has = k.has(t.id), can = sim.canLearn(t.id);
          const prev = TRAITS.find(o => o.branch === br && o.tier === t.tier - 1);
          const locked = !has && prev && !k.has(prev.id);
          const btn = has ? '<button type="button" disabled>Learned</button>'
            : `<button type="button" class="primary" data-learn="${t.id}" ${can ? '' : 'disabled'}>${locked ? `Needs ${esc(prev!.name)}` : sim.atShrine ? 'Learn · 1 ✦' : 'At the shrine · 1 ✦'}</button>`;
          return `<article class="rc trait${has ? ' equipped' : ''}${locked ? ' locked' : ''}"><div class="rc-top"><h3>${esc(t.name)}</h3><span class="tier">${'I'.repeat(t.tier)}</span></div><p class="rc-fx">${esc(t.effect)}</p><p class="rc-lore">${esc(t.lore)}</p><div class="rc-act">${btn}</div></article>`;
        }).join('') + '</div>').join('') + '</div>';
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
    if (d.craftLeash && sim.craftLeash(d.craftLeash as never)) count('crafts', d.craftLeash);
    if (d.equip) sim.equipLeash(d.equip as never);
    if (d.craftBread && sim.craftBread(d.craftBread as never)) count('crafts', d.craftBread);
    if (d.ready) sim.kit.active = d.ready as never;
    if (d.learn) { sim.learnTrait(d.learn as TraitId); scene.saveNow(); }
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

  // the Ferryman: honk at a ferry stop to pick where to sail
  const ferry = $('ferry'), stops = $('ferry-stops');
  let ferryOpen = false;
  function closeFerry(): void { ferryOpen = false; ferry.hidden = true; scene.paused = false; scene.game.canvas.focus(); }
  function openFerry(): void {
    const sim = scene.sim, here = sim.room.def.id;
    const all = Object.values(ROOMS).filter(r => r.ferry).sort((a, b) => rank(a.id) - rank(b.id));
    stops.innerHTML = all.map(r => {
      const known = sim.kit.ferries.has(r.id), at = r.id === here;
      return `<button type="button" data-ferry="${r.id}" ${known && !at ? '' : 'disabled'}><b>${esc(r.ferry!.name)}</b><small>${at ? 'You are here.' : known ? esc(r.subtitle ?? r.name) : 'Not visited yet.'}</small></button>`;
    }).join('');
    ferryOpen = true; ferry.hidden = false; scene.paused = true;
    (stops.querySelector('button:not([disabled])') as HTMLButtonElement | null ?? $('ferry-close')).focus();
  }
  stops.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button[data-ferry]') as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    closeFerry(); scene.ferryTo(b.dataset.ferry!);
  });
  $('ferry-close').onclick = closeFerry;
  ferry.addEventListener('click', e => { if (e.target === ferry) closeFerry(); });
  scene.onFerry = () => { if (!open && !ferryOpen) { scene.setPackOpen(false); openFerry(); } };

  const packUi = setupPackUi(scene);

  // Pickett's Tackle: trade sea glass
  const shop = $('shop'), wares = $('shop-items'), purse = $('shop-purse');
  let shopOpen = false;
  function closeShop(): void { shopOpen = false; shop.hidden = true; scene.paused = false; scene.game.canvas.focus(); }
  function renderShop(): void {
    const k = scene.sim.kit;
    purse.textContent = `You have ${k.mats.glass} Sea Glass and ${k.mats.chain} Shell Scute.`;
    // Pickett has opinions about the goose
    const hat = k.hat ? HAT_BY_ID[k.hat] : null, belly = scene.sim.belly.length;
    $('shop-quote').textContent = belly ? '"Is your goose... digesting something of mine? Keep him off the counter."'
      : hat ? pickQ([`"Nice ${hat.name.toLowerCase()}. Where'd the goose get that? ...Don't tell me."`, `"I'm not serving a goose in a ${hat.name.toLowerCase()}. ...Fine. Sea glass only."`, `"Is that the ${hat.name}? Someone's going to want that back."`])
      : '"Sea glass only. Shiny things are the only honest money."';
    const price = (c: Partial<Record<string, number>>) => Object.entries(c).map(([id, n]) => `${n} ${ITEMS[id as keyof typeof ITEMS].name}`).join(' + ');
    wares.innerHTML = scene.sim.shopStock().map(it => {
      const ok = !it.sold && scene.sim.canAfford(it.cost);
      return `<button type="button" data-buy="${it.id}" ${ok ? '' : 'disabled'}><b>${esc(it.name)}</b> · ${it.sold ? 'Sold' : esc(price(it.cost))}<small>${esc(it.desc)}</small></button>`;
    }).join('');
  }
  function openShop(): void {
    renderShop(); shopOpen = true; shop.hidden = false; scene.paused = true;
    (wares.querySelector('button:not([disabled])') as HTMLButtonElement | null ?? $('shop-close')).focus();
  }
  wares.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button[data-buy]') as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    if (scene.buy(b.dataset.buy as 'reel')) renderShop();
  });
  $('shop-close').onclick = closeShop;
  shop.addEventListener('click', e => { if (e.target === shop) closeShop(); });
  scene.onShop = () => { if (!open && !ferryOpen && !shopOpen) { scene.setPackOpen(false); openShop(); } };

  // the shrine opens the book on Biscuit's page
  scene.onShrine = () => { if (!open) { scene.setPackOpen(false); tab = 'biscuit'; openBook(); } };

  // playtest stats: local only; copy them into a bug report
  $('b-stats').onclick = async () => {
    const out = $('stats-out');
    if (!out.hidden) { out.hidden = true; return; }
    const mins = (s: number) => `${Math.round(s / 60)} min`;
    const list = (k: 'deaths' | 'snaps' | 'time' | 'quits') => top(k).map(([r, n]) => `${r} ${k === 'time' ? mins(n) : n}`).join(', ') || 'none yet';
    const crafts = Object.values(STATS.crafts).reduce((a, b) => a + b, 0);
    out.textContent = `Most faints: ${list('deaths')}\nMost snaps: ${list('snaps')}\nMost time: ${list('time')}\nSessions ended in: ${list('quits')}\nCrafted: ${crafts} · Deepest Basement floor: ${STATS.basementBest}\n\n${exportStats()}`;
    out.hidden = false;
    try { await navigator.clipboard.writeText(exportStats()); $('room-note').textContent = 'Playtest stats copied to the clipboard (they never leave this browser otherwise).'; } catch { $('room-note').textContent = 'Playtest stats shown below. Nothing is sent anywhere.'; }
  };

  // the Infinite Basement: the way down, and the board of deepest runs
  const bdlg = $('basement'), board = $('basement-board'), bname = $<HTMLInputElement>('basement-name');
  let basementOpen = false;
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  function drawBoard(mine?: BasementRun): void {
    const rows = loadBoard();
    board.innerHTML = rows.length ? rows.map(r => `<li class="${mine && r.at === mine.at ? 'me' : ''}">${esc(r.name)} · Floor ${r.floor} · ${r.kills} beaten · ${mmss(r.time)} · ${esc(DIFFICULTY[r.diff as Difficulty]?.name ?? r.diff)}</li>`).join('')
      : '<li class="empty">No runs yet. The drains are waiting.</li>';
  }
  function openBasement(sub?: string, mine?: BasementRun): void {
    if (open) closeBook(); scene.setPackOpen(false);
    $('basement-sub').textContent = sub ?? 'Endless floors of entranced critters under the old mill. Clear a floor and the drains splash the pack; every second floor leaves bread. How deep can Bimbo go?';
    bname.value = playerName(); drawBoard(mine);
    const inside = !!scene.sim.room.def.endless;
    $('basement-go').textContent = inside ? 'Go again' : 'Go down';
    $('basement-up').hidden = !inside;
    basementOpen = true; bdlg.hidden = false; scene.paused = true; $('basement-go').focus();
  }
  function closeBasement(): void { basementOpen = false; bdlg.hidden = true; scene.paused = false; scene.game.canvas.focus(); }
  bname.onchange = () => setPlayerName(bname.value.trim() || 'Rocco');
  $('b-basement').onclick = () => openBasement();
  $('basement-close').onclick = closeBasement;
  $('basement-go').onclick = () => { closeBasement(); if (scene.sim.room.def.endless) scene.resetRoom(); else scene.enterBasement(); };
  $('basement-up').onclick = () => { closeBasement(); scene.leaveBasement(); };
  bdlg.addEventListener('click', e => { if (e.target === bdlg) closeBasement(); });
  scene.onBasementOver = (r, place) => openBasement(`Bimbo fainted on floor ${r.floor + 1}. You cleared ${r.floor} floor${r.floor === 1 ? '' : 's'} and beat ${r.kills} critters in ${mmss(r.time)}.${place ? ` That's #${place} on the board!` : ''}`, r);

  // settings: accessibility toggles and key rebinding
  const settings = $('settings'), keysBox = $('settings-keys');
  let settingsOpen = false, listening: Action | null = null;
  const chk = (id: string, key: 'shake' | 'flashes' | 'colourSafe') => { const el = $<HTMLInputElement>(id); el.checked = SETTINGS[key]; el.onchange = () => { SETTINGS[key] = el.checked; saveSettings(); }; };
  chk('set-shake', 'shake'); chk('set-flash', 'flashes'); chk('set-cs', 'colourSafe');
  function drawKeys(): void {
    keysBox.innerHTML = '';
    for (const a of Object.keys(ACTION_NAMES) as Action[]) {
      const b = document.createElement('button'); b.type = 'button';
      b.innerHTML = `<span>${ACTION_NAMES[a]}</span><kbd>${listening === a ? '…' : esc(keyLabel(SETTINGS.keys[a]))}</kbd>`;
      if (listening === a) b.className = 'listening';
      b.onclick = () => { listening = a; drawKeys(); };
      keysBox.appendChild(b);
    }
  }
  window.addEventListener('keydown', e => {
    if (!settingsOpen || !listening) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const k = e.key.toLowerCase();
    if (k !== 'escape' && !k.startsWith('arrow') && k !== 'tab' && k !== 'm' && k !== 'enter') bind(listening, k);
    listening = null; drawKeys();
  }, true);
  function closeSettings(): void { settingsOpen = false; listening = null; settings.hidden = true; scene.paused = false; scene.game.canvas.focus(); }
  $('b-settings').onclick = () => { if (open) closeBook(); scene.setPackOpen(false); settingsOpen = true; settings.hidden = false; scene.paused = true; drawKeys(); $('settings-close').focus(); };
  $('settings-close').onclick = closeSettings;
  $('settings-defaults').onclick = () => { Object.assign(SETTINGS.keys, DEFAULT_KEYS); saveSettings(); drawKeys(); };
  settings.addEventListener('click', e => { if (e.target === settings) closeSettings(); });

  // the Fish Journal: every kind in the cove, silhouettes for the ones still to catch
  const journal = $('journal'), jlist = $('journal-list');
  let journalOpen = false;
  const INK: Record<string, string> = { common: '#555', uncommon: '#2e7d3e', rare: '#2a5ab0', legendary: '#a07800', junk: '#7a5a40' };
  function closeJournal(): void { journalOpen = false; journal.hidden = true; scene.paused = false; scene.game.canvas.focus(); }
  function openJournal(): void {
    const k = scene.sim.kit, got = FISH.filter(f => k.fish[f.id]?.n).length;
    $('journal-sub').textContent = `${got} of ${FISH.length} caught at Moonlit Cove. Every five new kinds: a Golden Feather.`;
    const tierName = ['', 'The shallows', 'Past the shallows', 'Open water', 'The deep', 'The trench off the Far Rock'];
    let html = '';
    for (let t = 1; t <= 5; t++) {
      html += `<h3>${tierName[t]}</h3>`;
      for (const f of FISH.filter(x => x.tier === t)) {
        const r = k.fish[f.id], src = spriteUrl(`fish_${f.id}`);
        html += `<div class="fish-card ${r?.n ? '' : 'unknown'}"><div class="pic">${src ? `<img alt="" src="${src}">` : ''}</div><div>`
          + (r?.n ? `<b>${esc(f.name)}</b><small><span style="color:${INK[f.rarity]}">${f.rarity}</span> · ×${r.n} · best ${r.best} cm</small>`
            : `<b>???</b><small>${f.rarity === 'legendary' ? 'Legendary. Rarely seen.' : f.rarity}</small>`) + '</div></div>';
      }
    }
    // Biscuit's hat collection: click one to put it on him
    html += `<h3>Biscuit's hats (${k.hats.size} of ${HATS.length})</h3>`;
    for (const h of HATS) {
      const has = k.hats.has(h.id);
      html += `<div class="fish-card ${has ? '' : 'unknown'}"><div>` + (has
        ? `<b>${esc(h.name)}</b><small>${k.hat === h.id ? 'wearing it' : `<button type="button" class="hat-btn" data-hat="${h.id}">Put it on</button>`}</small>`
        : `<b>???</b><small>Beat something wearing it</small>`) + '</div></div>';
    }
    if (k.hat) html += `<p><button type="button" class="hat-btn" data-hat="">Take his hat off</button></p>`;
    jlist.innerHTML = html;
    jlist.querySelectorAll<HTMLButtonElement>('.hat-btn').forEach(b => { b.onclick = () => { k.hat = b.dataset.hat || null; scene.saveNow(); openJournal(); }; });
    journalOpen = true; journal.hidden = false; scene.paused = true; $('journal-close').focus();
  }
  $('journal-close').onclick = closeJournal;
  journal.addEventListener('click', e => { if (e.target === journal) closeJournal(); });

  scene.controls.onUi = a => {
    if (scene.movie?.active) { if (a === 'close') scene.movie.skip(); return; }
    if (scene.cinema.active) { if (a === 'advance') scene.cinema.advance(); else if (a === 'close') scene.cinema.skip(); return; }
    if (scene.prologue?.active) { if (a === 'close') scene.skipPrologue(); return; }
    if (a === 'journal') { if (journalOpen) closeJournal(); else if (!open && !ferryOpen && !shopOpen) { scene.setPackOpen(false); openJournal(); } return; }
    if (journalOpen && (a === 'close' || a === 'closeBook')) { closeJournal(); return; }
    if (settingsOpen) { if (a === 'close') closeSettings(); return; }
    if (basementOpen) { if (a === 'close') closeBasement(); return; }
    if (a === 'book') { if (open) closeBook(); else { scene.setPackOpen(false); openBook(); } }
    else if (a === 'pack') { if (open) closeBook(); scene.setPackOpen(!scene.packOpen); }
    else if (a === 'closeBook' || a === 'close') { if (open) closeBook(); if (ferryOpen) closeFerry(); if (shopOpen) closeShop(); scene.setPackOpen(false); }
    else if (a === 'patch') { if (scene.packOpen) { scene.patchFromPack(); packUi.refresh(); } }
    else if (a === 'reset') { if (open) closeBook(); scene.setPackOpen(false); scene.resetRoom(); }
  };
}

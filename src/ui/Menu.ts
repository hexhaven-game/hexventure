import changelogMd from '../../CHANGELOG.md?raw';
import { RUN } from '../game/config';
import { SaveSystem, SLOTS, type Slot } from '../game/SaveSystem';
import type { PlayerStats, StatKind } from '../player/PlayerStats';
import { Meta, UNLOCKS, type UnlockId } from '../game/Meta';
import { RELICS, type RelicId } from '../game/Relics';

// ---------- changelog (the same CHANGELOG.md as in the repo root) ----------
interface Release {
  version: string;
  date: string;
  sections: { title: string; items: string[] }[];
}
function parseChangelog(md: string): Release[] {
  const out: Release[] = [];
  let rel: Release | null = null;
  let sec: Release['sections'][number] | null = null;
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    const v = line.match(/^##\s+([\d.]+)\s*[—-]\s*(.+)$/);
    if (v) {
      rel = { version: v[1], date: v[2].trim(), sections: [] };
      out.push(rel);
      sec = null;
      continue;
    }
    const h = line.match(/^###\s+(.+)$/);
    if (h && rel) {
      sec = { title: h[1].trim(), items: [] };
      rel.sections.push(sec);
      continue;
    }
    const item = line.match(/^[-*]\s+(.+)$/);
    if (item && sec) sec.items.push(item[1]);
  }
  return out;
}
export const RELEASES = parseChangelog(changelogMd);
export const APP_VERSION = RELEASES[0]?.version ?? '0';

export interface MenuActions {
  canResume: () => boolean;
  resume: () => void;
  newWorld: () => void;
  debugWorld: () => void;
  load: (slot: Slot) => void;
  save: (slot: Slot) => boolean;
  toTitle: () => void;
}

const CLOSE =
  '<svg viewBox="0 0 24 24"><path d="M6.4 5L12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z"/></svg>';

const CONTROLS = `
  <div class="controls">
    <div><h3>Play</h3>
      <p><kbd>WASD</kbd> move</p><p><kbd>Space</kbd> sword</p><p><kbd>Shift</kbd> / right-click roll</p><p><kbd>Q</kbd> drink from the flask</p><p><kbd>E</kbd> rest, use a shrine, open a chest</p><p><kbd>Tab</kbd> build mode</p><p><kbd>Esc</kbd> pause</p></div>
    <div><h3>Build</h3>
      <p><kbd>1</kbd>–<kbd>3</kbd> pick a tile from your hand</p><p><kbd>Click</kbd> place</p><p><kbd>R</kbd> / right-click rotate</p><p><kbd>WASD</kbd> pan · <kbd>Wheel</kbd> zoom</p><p><kbd>Tab</kbd> back to play</p></div>
  </div>
  <p class="note">Place tiles from your hand, explore them, beat what lives there. Clearing a tile earns a new one.
  Lairs hold World Fragments; with three, the Boss tile appears. Rest at the campfire, upgrade at a shrine.
  When you die your embers stay behind: go and get them back. <kbd>F3</kbd> shows debug info.</p>`;

// Title screen, pause menu and the small dialogs (save, load, controls).
export class Menu {
  private title = document.getElementById('title')!;
  private nav = document.getElementById('title-nav')!;
  private modal = document.getElementById('modal')!;
  private card = this.modal.querySelector('.card') as HTMLElement;
  private a: MenuActions;
  onModalClose: (() => void) | null = null;

  constructor(actions: MenuActions) {
    this.a = actions;
    this.nav.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'continue') {
        if (this.a.canResume()) this.a.resume();
        else this.a.load('auto');
      }
      if (act === 'new') this.a.newWorld();
      if (act === 'debug') this.a.debugWorld();
      if (act === 'load') this.showSlots('load');
      if (act === 'controls') this.showControls();
      if (act === 'hearthstone') this.showHearthstone(() => this.showTitle());
    });
    document.getElementById('version')!.addEventListener('click', () => this.showChangelog());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });
  }

  get modalOpen() {
    return !this.modal.classList.contains('hidden');
  }

  showTitle() {
    const auto = SaveSystem.read('auto');
    const resume = this.a.canResume();
    const item = (act: string, label: string, sub = '') =>
      `<button data-act="${act}"><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</button>`;
    this.nav.innerHTML = [
      resume || auto ? item('continue', 'Continue', resume ? 'Back to your world' : SaveSystem.describe(auto!)) : '',
      item('new', 'New world', 'Start with one home tile'),
      item('load', 'Load'),
      item('hearthstone', 'Hearthstone', this.metaLine()),
      item('debug', 'Debug world', 'Everything already built'),
      item('controls', 'Controls'),
    ].join('');
    document.getElementById('version')!.textContent = `Version ${APP_VERSION}`;
    document.body.dataset.mode = 'title';
    this.title.classList.remove('hidden');
  }

  hideTitle() {
    this.title.classList.add('hidden');
  }

  private open(html: string, bind?: (card: HTMLElement) => void) {
    this.card.innerHTML = `<button class="mclose" aria-label="Close" title="Close (Esc)">${CLOSE}</button><div class="mbody">${html}</div>`;
    this.card.querySelector('.mclose')!.addEventListener('click', () => this.closeModal());
    this.modal.classList.remove('hidden');
    bind?.(this.card);
  }

  closeModal() {
    if (!this.modalOpen) return;
    this.modal.classList.add('hidden');
    const fn = this.onModalClose;
    this.onModalClose = null;
    fn?.();
  }

  showPause(onResume: () => void) {
    this.open(
      `<h2>Paused</h2>
       <nav class="list">
         <button data-p="resume">Resume</button>
         <button data-p="save">Save</button>
         <button data-p="load">Load</button>
         <button data-p="controls">Controls</button>
         <button data-p="title">Title screen</button>
       </nav>`,
      (card) => {
        card.querySelector('nav')!.addEventListener('click', (e) => {
          const p = (e.target as HTMLElement).closest('button')?.dataset.p;
          if (p === 'resume') this.closeModal();
          if (p === 'save') this.showSlots('save', onResume);
          if (p === 'load') this.showSlots('load', onResume);
          if (p === 'controls') this.showControls(onResume);
          if (p === 'title') {
            this.onModalClose = null;
            this.closeModal();
            this.a.toTitle();
          }
        });
      },
    );
    this.onModalClose = onResume;
  }

  // the next run's Blight level (chosen at the Hearthstone)
  blightLevel = 0;

  private metaLine() {
    const m = Meta.read();
    return `${m.memories} memories · ${m.unlocks.length} of ${Object.keys(UNLOCKS).length} unlocks${this.blightLevel ? ` · Blight ${this.blightLevel}` : ''}`;
  }

  // Memories carry over between runs; spend them here on permanent unlocks, and pick how hard the
  // Blight starts (unlocked by winning).
  showHearthstone(onClose: () => void) {
    const draw = () => {
      const m = Meta.read();
      this.blightLevel = Math.min(this.blightLevel, m.maxBlight);
      const rows = (Object.keys(UNLOCKS) as UnlockId[])
        .map((id) => {
          const u = UNLOCKS[id];
          const owned = m.unlocks.includes(id);
          return `<button class="up" data-u="${id}" ${owned || m.memories < u.cost ? 'disabled' : ''}>
            <b>${u.name}</b><small>${owned ? 'Unlocked' : `${u.desc} · ${u.cost}`}</small></button>`;
        })
        .join('');
      const levels = Array.from({ length: m.maxBlight + 1 }, (_, i) => `<button class="lvl ${i === this.blightLevel ? 'on' : ''}" data-b="${i}">${i}</button>`).join('');
      this.card.querySelector('.mbody')!.innerHTML = `
        <h2>Hearthstone</h2>
        <p class="note">What you keep between runs. You have <b>${m.memories}</b> memories (from clearing areas, cleansing the Blight, lairs and the boss). Runs: ${m.runs} · wins: ${m.wins}.</p>
        <div class="ups">${rows}</div>
        <h3 style="margin-top:16px">Blight level for the next run</h3>
        <p class="note">${m.maxBlight ? 'Higher levels: tougher enemies, a faster Blight, more memories.' : 'Win a run to unlock harder Blight levels.'}</p>
        <div class="lvls">${levels}</div>`;
    };
    this.open('');
    draw();
    this.card.querySelector('.mbody')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b || b.disabled) return;
      if (b.dataset.u) {
        const id = b.dataset.u as UnlockId;
        Meta.update((m) => {
          if (m.memories >= UNLOCKS[id].cost && !m.unlocks.includes(id)) {
            m.memories -= UNLOCKS[id].cost;
            m.unlocks.push(id);
          }
        });
      }
      if (b.dataset.b) this.blightLevel = Number(b.dataset.b);
      draw();
    });
    this.onModalClose = onClose;
  }

  // choose 1 of up to 3 relics; the game waits until you pick
  showRelics(choice: RelicId[], title: string, onPick: (r: RelicId | null) => void) {
    if (!choice.length) {
      onPick(null);
      return;
    }
    this.open(
      `<h2>${title}</h2><p class="note">Choose one. It stays with you for the rest of this run.</p>
       <div class="relics">${choice
         .map((id) => {
           const r = RELICS[id];
           return `<button class="relic" data-r="${id}" style="--rc:#${r.color.toString(16).padStart(6, '0')}"><i></i><b>${r.name}</b><small>${r.desc}</small></button>`;
         })
         .join('')}</div>`,
      (card) => {
        card.querySelector('.relics')!.addEventListener('click', (e) => {
          const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
          if (!b) return;
          this.onModalClose = null;
          this.closeModal();
          onPick(b.dataset.r as RelicId);
        });
      },
    );
    // closing without choosing still gives the first one: a chest is never wasted
    this.onModalClose = () => onPick(choice[0]);
  }

  showChangelog(onClose?: () => void) {
    const rel = RELEASES.map(
      (r, i) => `<details class="rel" ${i === 0 ? 'open' : ''}><summary><b>Version ${r.version}</b><span>${r.date}</span><i class="chev"></i></summary>
        ${r.sections.map((s) => `<h4>${s.title}</h4><ul>${s.items.map((it) => `<li>${it}</li>`).join('')}</ul>`).join('')}</details>`,
    );
    this.open(`<h2>What's new</h2>${rel.join('')}`);
    this.card.classList.add('wide');
    this.onModalClose = () => {
      this.card.classList.remove('wide');
      onClose?.();
    };
  }

  // The shrine: spend embers on one level of hearts, stamina or damage.
  showShrine(stats: PlayerStats, level: (k: StatKind) => void, onClose: () => void) {
    const draw = () => {
      const cost = stats.levelCost;
      const row = (k: StatKind, name: string, now: string, next: string) =>
        `<button class="up" data-k="${k}" ${stats.canLevel(k) ? '' : 'disabled'}><b>${name}</b><small>${now} → ${next}</small></button>`;
      this.card.querySelector('.mbody')!.innerHTML = `
        <h2>Shrine</h2>
        <p class="note">Spend embers to grow stronger. Each level costs more. You have <b>${stats.embers}</b> embers; the next level costs <b>${cost}</b>.</p>
        <div class="ups">
          ${stats.maxHearts >= RUN.maxHearts ? `<button class="up" disabled><b>Hearts</b><small>${stats.maxHearts} (max)</small></button>` : row('hearts', 'Hearts', `${stats.maxHearts}`, `${stats.maxHearts + 1}`)}
          ${row('stamina', 'Stamina', `${stats.maxStamina}`, `${stats.maxStamina + 20}`)}
          ${row('damage', 'Sword', `${stats.damage}`, `${stats.damage + 0.5}`)}
        </div>`;
    };
    this.open('');
    draw();
    this.card.querySelector('.mbody')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button.up') as HTMLButtonElement | null;
      if (!b || b.disabled) return;
      level(b.dataset.k as StatKind);
      draw();
    });
    this.onModalClose = onClose;
  }

  showWin(summary: string, onNew: () => void, onStay: () => void) {
    this.open(
      `<h2>The world is whole again</h2>
       <p class="note">${summary}</p>
       <nav class="list"><button data-w="new">Start a new run</button><button data-w="stay">Keep exploring</button></nav>`,
      (card) => {
        card.querySelector('nav')!.addEventListener('click', (e) => {
          const w = (e.target as HTMLElement).closest('button')?.dataset.w;
          if (!w) return;
          this.onModalClose = null;
          this.closeModal();
          if (w === 'new') onNew();
          else onStay();
        });
      },
    );
    this.onModalClose = onStay;
  }

  showControls(onClose?: () => void) {
    this.open(`<h2>Controls</h2>${CONTROLS}`);
    this.onModalClose = onClose ?? null;
  }

  showSlots(kind: 'save' | 'load', onClose?: () => void) {
    const slots = kind === 'save' ? SLOTS.filter((s) => s !== 'auto') : SLOTS;
    const rows = slots
      .map((s) => {
        const d = SaveSystem.read(s);
        const name = s === 'auto' ? 'Autosave' : `Slot ${s}`;
        const disabled = kind === 'load' && !d ? 'disabled' : '';
        return `<button class="slot" data-s="${s}" ${disabled}><b>${name}</b><small>${d ? SaveSystem.describe(d) : 'Empty'}</small></button>`;
      })
      .join('');
    this.open(
      `<h2>${kind === 'save' ? 'Save' : 'Load'}</h2>
       <p class="note">${kind === 'save' ? 'The game also saves itself as you play (autosave).' : 'Pick a save to continue from.'}</p>
       <div class="slots">${rows}</div>`,
      (card) => {
        card.querySelector('.slots')!.addEventListener('click', (e) => {
          const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
          if (!b || b.disabled) return;
          const slot = b.dataset.s as Slot;
          if (kind === 'save') {
            const ok = this.a.save(slot);
            b.querySelector('small')!.textContent = ok ? `Saved · ${SaveSystem.describe(SaveSystem.read(slot)!)}` : 'Could not save';
          } else {
            this.onModalClose = null;
            this.closeModal();
            this.a.load(slot);
          }
        });
      },
    );
    this.onModalClose = onClose ?? null;
  }
}

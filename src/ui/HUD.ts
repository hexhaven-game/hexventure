import type { Card } from '../game/Deck';
import type { PlayerStats } from '../player/PlayerStats';
import type { Thumbs } from '../rendering/Thumbs';

const HEART =
  '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.1C.9 8.6 2.8 4.5 6.7 4.5c2.2 0 3.7 1.2 5.3 3 1.6-1.8 3.1-3 5.3-3 3.9 0 5.8 4.1 4.3 7.4C19.5 16.4 12 21 12 21z"/></svg>';
const FLASK = '<svg viewBox="0 0 24 24"><path d="M9 2h6v2h-1v4.2c2.9 1 5 3.8 5 7.1C19 19.5 15.9 22 12 22s-7-2.5-7-6.7c0-3.3 2.1-6.1 5-7.1V4H9z"/></svg>';
const EMBER = '<svg viewBox="0 0 24 24"><path d="M12 2c1.5 3.5 6 6 6 11a6 6 0 0 1-12 0c0-2.6 1.4-4.2 2.6-5.6.2 1.8 1 3.1 2.4 3.6C10 7.5 11 4.5 12 2z"/></svg>';
const FRAGMENT = '<svg viewBox="0 0 24 24"><path d="M12 2l6 7-6 13-6-13z"/></svg>';

export const CARD_LABEL: Record<Card, string> = {
  meadow: 'Meadow',
  forest: 'Forest',
  water: 'Water',
  hill: 'Hill',
  bridge: 'Bridge',
  stairs: 'Stairs',
  shrine: 'Shrine',
  lair: 'Lair',
  boss: 'Boss',
};
const CARD_DESC: Record<Card, string> = {
  meadow: 'Open grass',
  forest: 'Dense trees, enemies',
  water: 'A pond with beaches',
  hill: 'High ground, cliffs',
  bridge: 'Across a water tile',
  stairs: 'Up a hill',
  shrine: 'Upgrade here',
  lair: 'Miniboss, fragment',
  boss: 'The Hollow King',
};
const CARD_HINT: Partial<Record<Card, string>> = {
  bridge: 'Needs water with land on two opposite sides',
  stairs: 'Needs a hill with flat land in front',
  lair: 'A miniboss guards a World Fragment. Far from home (danger 2+)',
  boss: 'The Hollow King. Very far from home (danger 3+)',
  shrine: 'Spend embers on upgrades here',
};

// The HTML overlay: hearts, stamina, flask, embers, fragments, the tile stack and hand, a boss
// health bar, prompts and short messages.
export class HUD {
  private el = (id: string) => document.getElementById(id)!;
  private messageTimer = 0;
  private handSig = '';
  onSelect: (index: number) => void = () => {};

  constructor() {
    this.el('hand').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.i && !b.disabled) this.onSelect(Number(b.dataset.i));
    });
  }

  setMode(mode: 'play' | 'build') {
    document.body.dataset.mode = mode;
    this.el('hints').innerHTML =
      mode === 'play'
        ? '<span><kbd>WASD</kbd> Move</span><span><kbd>Space</kbd> Attack</span><span><kbd>Shift</kbd> Roll</span><span><kbd>Q</kbd> Flask</span><span><kbd>E</kbd> Use</span><span><kbd>Tab</kbd> Build</span>'
        : '<span><kbd>1</kbd>–<kbd>3</kbd> Choose</span><span><kbd>Click</kbd> Place</span><span><kbd>R</kbd> Rotate</span><span><kbd>WASD</kbd> Pan</span><span><kbd>Tab</kbd> Play</span>';
  }

  // hearts, stamina and the flask, every frame (cheap: only touches what changed)
  setVitals(s: PlayerStats) {
    const heartsSig = `${s.hearts}/${s.maxHearts}`;
    const h = this.el('hearts');
    if (h.dataset.sig !== heartsSig) {
      h.dataset.sig = heartsSig;
      h.innerHTML = Array.from({ length: s.maxHearts }, (_, i) => `<i class="${i < s.hearts ? '' : 'empty'}">${HEART}</i>`).join('');
    }
    const bar = this.el('stamina');
    bar.style.width = `${120 + (s.maxStamina - 100) * 1.2}px`;
    (bar.firstElementChild as HTMLElement).style.width = `${Math.max(0, s.stamina / s.maxStamina) * 100}%`;
    bar.classList.toggle('low', s.stamina <= 0);
    const flaskSig = `${s.flasks}`;
    const f = this.el('flask');
    if (f.dataset.sig !== flaskSig) {
      f.dataset.sig = flaskSig;
      f.innerHTML = `${FLASK}<b>${s.flasks}</b>`;
      f.classList.toggle('empty', s.flasks === 0);
    }
  }

  setCurrency(embers: number, fragments: number, goal: number) {
    this.el('embers').innerHTML = `${EMBER}<b>${embers}</b>`;
    this.el('fragments').innerHTML = `${FRAGMENT}<b>${fragments}</b><small>/${goal}</small>`;
  }

  // Hexhaven-style: the stack of tiles you have left (a picture of a pile with the next tile on
  // top, and the count), and in build mode the choice of three.
  setDeck(offer: Card[], count: number, selected: number, building: boolean, usable: (c: Card) => boolean, thumbs: Thumbs) {
    const top = count > 0 ? offer[selected >= 0 ? selected : 0] ?? null : null;
    const height = count > 0 ? Math.max(1, Math.min(7, Math.ceil(count / 2))) : 1;
    const sig = `${offer.join()}|${count}|${selected}|${building}|${offer.map((c) => usable(c)).join()}`;
    if (sig === this.handSig) return;
    const newOffer = !this.handSig.startsWith(`${offer.join()}|${count}|`);
    this.handSig = sig;
    this.el('stack').innerHTML = `<img src="${thumbs.stack(top, height)}" alt=""><div class="count">${count}</div>`;
    this.el('stack').classList.toggle('none', count === 0);
    this.el('stack').title = count === 1 ? '1 tile left' : `${count} tiles left`;
    const tray = this.el('tray');
    tray.classList.toggle('show', building);
    if (!building) return;
    const hand = this.el('hand');
    if (newOffer || hand.children.length !== offer.length) {
      hand.innerHTML = offer
        .map((c, i) => `<button class="tcard card-${c}" data-i="${i}">
            <img src="${thumbs.card(c)}" alt=""><span class="name">${CARD_LABEL[c]}</span>
            <span class="desc">${CARD_DESC[c]}</span><kbd>${i + 1}</kbd></button>`)
        .join('');
    }
    hand.querySelectorAll('button').forEach((b, i) => {
      const c = offer[i];
      b.classList.toggle('sel', i === selected);
      (b as HTMLButtonElement).disabled = !usable(c);
      b.title = !usable(c) ? CARD_HINT[c] ?? '' : '';
    });
  }

  setBoss(name: string | null, hp = 0, max = 1) {
    const b = this.el('bossbar');
    b.classList.toggle('show', !!name);
    if (!name) return;
    b.innerHTML = `<span>${name}</span><div><i style="width:${Math.max(0, hp / max) * 100}%"></i></div>`;
  }

  setPrompt(text: string | null) {
    const p = this.el('prompt');
    if (p.textContent === (text ?? '') && p.classList.contains('show') === !!text) return;
    p.textContent = text ?? '';
    p.classList.toggle('show', !!text);
  }

  setBuildNote(text: string) {
    const n = this.el('buildnote');
    if (n.textContent !== text) n.textContent = text;
  }

  message(text: string, seconds = 2.6) {
    const m = this.el('message');
    m.textContent = text;
    m.classList.remove('show');
    void m.offsetWidth;
    m.classList.add('show');
    window.clearTimeout(this.messageTimer);
    this.messageTimer = window.setTimeout(() => m.classList.remove('show'), seconds * 1000);
  }

  // a big souls-style banner ("Area cleared", "You died")
  banner(text: string, kind: 'good' | 'bad' = 'good') {
    const b = this.el('banner');
    b.textContent = text;
    b.className = `show ${kind}`;
    window.setTimeout(() => (b.className = ''), 2200);
  }

  setDebug(text: string | null) {
    const d = this.el('debug');
    d.style.display = text ? 'block' : 'none';
    if (text) d.textContent = text;
  }
}

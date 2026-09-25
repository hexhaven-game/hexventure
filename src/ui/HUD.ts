import { BUILD_OPTIONS, type BuildOption } from '../build/BuildController';

const HEART =
  '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.1C.9 8.6 2.8 4.5 6.7 4.5c2.2 0 3.7 1.2 5.3 3 1.6-1.8 3.1-3 5.3-3 3.9 0 5.8 4.1 4.3 7.4C19.5 16.4 12 21 12 21z"/></svg>';

const LABELS: Record<BuildOption, string> = {
  meadow: 'Meadow',
  forest: 'Forest',
  water: 'Water',
  hill: 'Hill',
  bridge: 'Bridge',
};

// Minimal HTML overlay: hearts, key hints, the build bar, a prompt and short messages.
export class HUD {
  private el = (id: string) => document.getElementById(id)!;
  private messageTimer = 0;
  onSelect: (o: BuildOption) => void = () => {};

  constructor() {
    const bar = this.el('buildbar');
    bar.innerHTML = BUILD_OPTIONS.map(
      (o, i) => `<button data-o="${o}"><kbd>${i + 1}</kbd><span class="sw sw-${o}"></span>${LABELS[o]}</button>`,
    ).join('');
    bar.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.o) this.onSelect(b.dataset.o as BuildOption);
    });
  }

  setMode(mode: 'play' | 'build') {
    document.body.dataset.mode = mode;
    this.el('hints').innerHTML =
      mode === 'play'
        ? '<span><kbd>WASD</kbd> Move</span><span><kbd>Space</kbd> Attack</span><span><kbd>E</kbd> Open</span><span><kbd>Tab</kbd> Build</span>'
        : '<span><kbd>Click</kbd> Place</span><span><kbd>R</kbd> Rotate</span><span><kbd>WASD</kbd> Pan</span><span><kbd>Wheel</kbd> Zoom</span><span><kbd>Tab</kbd> Play</span>';
  }

  setSelected(o: BuildOption) {
    for (const b of this.el('buildbar').querySelectorAll('button')) b.classList.toggle('on', b.dataset.o === o);
  }

  setHearts(n: number, max: number) {
    this.el('hearts').innerHTML = Array.from({ length: max }, (_, i) => `<i class="${i < n ? '' : 'empty'}">${HEART}</i>`).join('');
  }

  setPrompt(text: string | null) {
    const p = this.el('prompt');
    p.textContent = text ?? '';
    p.classList.toggle('show', !!text);
  }

  setBuildNote(text: string) {
    this.el('buildnote').textContent = text;
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

  setDebug(text: string | null) {
    const d = this.el('debug');
    d.style.display = text ? 'block' : 'none';
    if (text) d.textContent = text;
  }
}

import { SaveSystem, SLOTS, type Slot } from '../game/SaveSystem';

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
      <p><kbd>WASD</kbd> move</p><p><kbd>Space</kbd> sword</p><p><kbd>E</kbd> open a chest</p><p><kbd>Tab</kbd> build mode</p><p><kbd>Esc</kbd> pause</p></div>
    <div><h3>Build</h3>
      <p><kbd>1</kbd>–<kbd>5</kbd> pick a tile</p><p><kbd>Click</kbd> place</p><p><kbd>R</kbd> / right-click rotate</p><p><kbd>WASD</kbd> pan · <kbd>Wheel</kbd> zoom</p><p><kbd>Tab</kbd> back to play</p></div>
  </div>
  <p class="note">Build a tile next to your land, walk into it, fight the slime, find the chest. <kbd>F3</kbd> shows debug info.</p>`;

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
    });
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
      item('debug', 'Debug world', 'Everything already built'),
      item('controls', 'Controls'),
    ].join('');
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

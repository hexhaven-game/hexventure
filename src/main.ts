import './style.css';
import { Game } from './game/Game';

const game = new Game(document.getElementById('app')!);
game.start();

// handy while developing: inspect the game from the browser console
if (import.meta.env.DEV) Object.assign(window, { game });

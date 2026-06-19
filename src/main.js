import './style.css';
import { startGame } from './game.js';
import { store } from './store.js';

const app = document.querySelector('#app');

function renderHome() {
  const sessions = store.state.stats.sessions;
  const best = store.state.stats.bestStreak;
  app.innerHTML = `
    <div class="screen home">
      <div class="home-hero">
        <div class="home-mark">🗺️</div>
        <h1>Hood</h1>
        <p>Learn the neighborhoods of Los Angeles.</p>
      </div>
      <div class="home-actions">
        <button class="btn btn-lg" id="play">Play</button>
        ${sessions ? `<p class="home-stat">${sessions} session${sessions > 1 ? 's' : ''} · best streak ${best}</p>` : ''}
      </div>
    </div>
  `;
  document.querySelector('#play').addEventListener('click', () => {
    startGame(app, renderHome);
  });
}

renderHome();

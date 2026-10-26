// Floating always-on-top timer. Displays state published by the main window.

const $ = (id) => document.getElementById(id);

window.api.onMiniState((state) => {
  const m = state.mini || {};
  $('headline').textContent = m.headline || 'Timeblock';
  $('sub').textContent = [m.sub, m.nextLabel].filter(Boolean).join(' · ');
  $('count').textContent = m.countdown || '';
  $('stripe').style.background = m.color || '#dbe6f4';
  $('bar').style.background = m.color || '#dbe6f4';
  $('bar').style.width = m.progress == null ? '0%' : `${Math.min(100, m.progress * 100).toFixed(1)}%`;
  for (const b of document.querySelectorAll('.adj')) b.disabled = !m.canAdjust;
});

for (const b of document.querySelectorAll('button[data-action]')) {
  b.addEventListener('click', () => window.api.miniAction(b.dataset.action));
}
$('mini').addEventListener('dblclick', (e) => {
  if (!e.target.closest('button')) window.api.miniAction('open');
});

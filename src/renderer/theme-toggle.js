// --- Theme Toggle (Dark/Light Mode) ---
// Hanya styling, tidak ada business logic.

export function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle-btn');
  const sunIcon = document.getElementById('theme-icon-sun');
  const moonIcon = document.getElementById('theme-icon-moon');

  if (!btn || !sunIcon || !moonIcon) return;

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ziti-theme', theme);
    // Sun icon = tampil saat dark (klik untuk switch ke light)
    // Moon icon = tampil saat light (klik untuk switch ke dark)
    sunIcon.classList.toggle('hidden', theme !== 'dark');
    moonIcon.classList.toggle('hidden', theme === 'dark');
  }

  // Initialize dari localStorage (default: light)
  const saved = localStorage.getItem('ziti-theme') || 'light';
  applyTheme(saved);

  // Toggle on click
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}

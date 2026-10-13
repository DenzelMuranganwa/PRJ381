document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('menuToggle');
  const closeBtn = document.getElementById('closeDrawer');
  const overlay = document.getElementById('drawerOverlay');
  const drawer = document.getElementById('sidebarDrawer');

  function openSidebar() {
    if (!drawer || !overlay) return;
    drawer.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    if (!drawer || !overlay) return;
    drawer.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (toggleBtn) toggleBtn.addEventListener('click', openSidebar);
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (overlay) overlay.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer && drawer.classList.contains('active')) {
      closeSidebar();
    }
  });

  const themeToggle = document.querySelector('[data-theme-toggle]');
  const themeError = document.querySelector('[data-theme-error]');
  const isGuest = document.body.dataset.authenticated !== 'true';
  const applyTheme = theme => {
    document.body.dataset.theme = theme;
    if (!themeToggle) return;
    themeToggle.setAttribute('aria-pressed', String(theme === 'light'));
    const label = themeToggle.querySelector('.theme-toggle-label');
    if (label) label.textContent = theme === 'light' ? 'Light Mode' : 'Dark Mode';
  };

  if (isGuest) {
    try {
      const savedTheme = localStorage.getItem('iwos-theme');
      if (savedTheme === 'dark' || savedTheme === 'light') applyTheme(savedTheme);
    } catch (error) {
      if (themeError) {
        themeError.hidden = false;
        themeError.textContent = 'This browser blocked saved theme preferences.';
      }
    }
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', async () => {
      const previousTheme = document.body.dataset.theme === 'light' ? 'light' : 'dark';
      const nextTheme = previousTheme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
      if (themeError) {
        themeError.hidden = true;
        themeError.textContent = '';
      }

      try {
        if (isGuest) {
          localStorage.setItem('iwos-theme', nextTheme);
        } else {
          const response = await fetch('/settings/theme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              _csrf: themeToggle.dataset.csrf,
              themePreference: nextTheme,
            }),
          });
          if (!response.ok) throw new Error('Theme preference could not be saved.');
        }
      } catch (error) {
        applyTheme(previousTheme);
        if (themeError) {
          themeError.hidden = false;
          themeError.textContent = error.message || 'Theme preference could not be saved.';
        }
      }
    });
  }

  document.addEventListener('click', event => {
    const link = event.target.closest('a[href="/dashboard#optimization-section"]');
    if (!link || window.location.pathname !== '/dashboard') return;
    const section = document.getElementById('optimization-section');
    if (!section) return;
    event.preventDefault();
    history.pushState(null, '', link.getAttribute('href'));
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (drawer && drawer.classList.contains('active')) closeSidebar();
  });
});
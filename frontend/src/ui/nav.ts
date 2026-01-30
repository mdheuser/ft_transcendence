// frontend/src/ui/nav.ts
function isAuthed(): boolean {
  return !!localStorage.getItem('auth_token');
}

function activeClass(path: string): string {
  return window.location.pathname === path ? 'active' : '';
}

export function renderNav(): string {
  const authed = isAuthed();

  const authHtml = authed
    ? `
      <a href="/profile" data-link="/profile" class="btn-secondary ${activeClass('/profile')}">Profile</a>
      <a href="#" data-action="logout" class="btn-secondary">Logout</a>
    `
    : `
      <a href="/profile" data-link="/profile" class="btn-secondary ${activeClass('/profile')}">Sign in</a>
      <a href="/api/auth/google" class="btn">Sign in with Google</a>
    `;

  return `
    <nav class="nav">
      <a href="/" data-link="/" class="${activeClass('/')}">Home</a>
      <a href="/game" data-link="/game" class="${activeClass('/game')}">Play Game</a>
      <a href="/tournament" data-link="/tournament" class="${activeClass('/tournament')}">Tournament</a>
      ${authHtml}
    </nav>
  `;
}


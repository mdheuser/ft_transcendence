import { apiCall } from "../services/ApiConfig";

export interface Page {
  render(): string;
  mount?(root?: HTMLElement): void;
  unmount?(): void;
}

export class Router {
  private routes: Map<string, new () => Page> = new Map();
  private currentPage: Page | null = null;

  addRoute(path: string, pageClass: new () => Page): void {
    this.routes.set(path, pageClass);
  }

  init(): void {
    this.handleRoute();

    document.addEventListener('click', (e) => {
      const target = e.target as Element | null;

      // 1) Handle actions (logout)
      const actionEl = target?.closest?.('[data-action]') as HTMLElement | null;
      if (actionEl) {
        const action = actionEl.getAttribute('data-action');

        if (action === 'logout') {
          e.preventDefault();

          void (async () => {
            try {
              await apiCall('/logout', { method: 'POST' }); // use '/logout' (apiCall likely prefixes /api)
            } catch (err) {
              console.warn('[router] logout failed:', err);
            }

            localStorage.removeItem('auth_token');
            this.navigate('/');
          })();

          return; // important: don’t also process data-link
        }

        return;
      }

      // 2) Handle SPA navigation links
      const linkEl = target?.closest?.('[data-link]') as HTMLElement | null;
      if (!linkEl) return;

      e.preventDefault();
      const to = linkEl.getAttribute('data-link');
      if (to) this.navigate(to);
    });

    window.addEventListener('popstate', () => this.handleRoute());
  }

  navigate(path: string): void {
    window.history.pushState({}, '', path);
    this.handleRoute();
  }

  handleRoute(): void {
    const currentPath = window.location.pathname;
    console.log('[router] path=', currentPath, 'known routes=', [...this.routes.keys()]);

    const PageClass = this.routes.get(currentPath) || this.routes.get('/');

    if (!PageClass) {
      console.error('No route found for', currentPath);
      return;
    }

    if (this.currentPage?.unmount) {
      this.currentPage.unmount();
    }

    this.currentPage = new PageClass();

    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = this.currentPage.render();

    if (this.currentPage.mount) {
      this.currentPage.mount(app);
    }
  }
}

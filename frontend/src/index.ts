import { Router } from './router/Router';
import { HomePage } from './pages/HomePage';
import { GamePage } from './pages/GamePage';
import { TournamentPage } from './pages/TournamentPage';
import { SinglePlayerPage } from './pages/SinglePlayerPage';
import { ProfilePage } from './pages/ProfilePage';
import { MatchPage } from './pages/MatchPage';

// Initialize router
const router = new Router();

// Register routes
router.addRoute('/', HomePage);
router.addRoute('/game', GamePage);
router.addRoute('/tournament', TournamentPage);
router.addRoute('/single', SinglePlayerPage);
router.addRoute('/profile', ProfilePage);
router.addRoute('/match', MatchPage);


function handleAuthRedirect(): boolean {
    // Check for a token in the URL fragment
    const hash = window.location.hash;
    // Handle standard login token
    if (hash.startsWith('#token=')) {
        const token = hash.substring('#token='.length);
        if (token) {
            // Store the token
            localStorage.setItem('auth_token', token);
            console.log('Authentication successful. Token stored.');

            // Clean the URL hash and navigate home
            window.history.pushState('', document.title, window.location.pathname + window.location.search);
            router.handleRoute();
            return true;
        }
    }
    // Handle 2FA required redirect
    else if (hash.startsWith('#2fa_required=')) {
        const tempToken = hash.substring('#2fa_required='.length);
        if (tempToken) {
            // Store the temporary token where the 2FA prompt can access it
            sessionStorage.setItem('temp_2fa_token', tempToken);
            console.log('2FA required. Temporary token stored.');

            // Navigate to a profile/login page (where the user sees the prompt)
            window.history.pushState({}, '', '/profile?2fa=required');
            router.handleRoute();
            return true;
        }
    }
    return false;
}

// Start the application
window.addEventListener('DOMContentLoaded', () => {
    console.log('🏓 ft_transcendence starting...');
    if (!handleAuthRedirect()) {
        router.init();
    }
});

// Handle browser back/forward buttons
window.addEventListener('popstate', () => {
    if (!handleAuthRedirect()) {
        router.handleRoute();
    }
});

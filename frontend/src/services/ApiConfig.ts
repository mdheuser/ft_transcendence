// API Configuration
// This automatically detects the correct API URL based on the current host

export class ApiConfig {
    private static readonly API_BASE = '/api';

    static getApiUrl(endpoint: string): string {
        // Use relative URLs so they work with any port
        return `${this.API_BASE}${endpoint}`;
    }
}

// Helper function for API calls
export async function apiCall(endpoint: string, options?: RequestInit): Promise<Response> {
    const url = ApiConfig.getApiUrl(endpoint);

    // Check for stored token and include it in the Authorization header
    const token = localStorage.getItem('auth_token');

    const headers = {
        ...options?.headers,
        // Only set Authorization header if token exists
        ...(token && { 'Authorization': `Bearer ${token}` })
    };

    const finalOptions: RequestInit = {
        ...options,
        headers,
    };

    return fetch(url, finalOptions);
}

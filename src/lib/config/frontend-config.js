// src/lib/config/frontend-config.js
// Frontendens API-bas. Sätt VITE_API_BASE i .env.vite om du kör separat API-host.
// Ex: VITE_API_BASE="http://localhost:8787/api"
export const API_BASE = import.meta.env.VITE_API_BASE || '/api';

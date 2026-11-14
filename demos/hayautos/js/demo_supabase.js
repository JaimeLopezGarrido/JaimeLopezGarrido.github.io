// DEMO: reemplaza a supabase-js. createClient devuelve el cliente falso de js/demo.js (datos en memoria, sin red).
export function createClient() { return window.HA_DEMO.supabase; }

/* GET /api/me → { email, role: 'admin' | 'editor' | 'sales' | 'user' | 'none', prices: may change the price book } */
import { whoIs, json } from '../_auth.js';
export async function onRequestGet({ request, env }){ return json(await whoIs(request, env)); }

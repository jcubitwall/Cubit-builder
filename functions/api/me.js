/* GET /api/me → { email, role: 'admin' | 'editor' | 'sales' | 'user' | 'none' } */
import { whoIs, json } from '../_auth.js';
export async function onRequestGet({ request, env }){ return json(await whoIs(request, env)); }

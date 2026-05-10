// functions/api/admin.js
// Cloudflare Pages Function — admin endpoints
// Requires D1 binding named "DB" and environment variable ADMIN_PASSWORD

const ADMIN_TOKEN = 'cb-admin-2025'; // Simple static token after login

export async function onRequestGet({ request, env }) {
  if (!isAuthed(request)) return json({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const stats = url.searchParams.get('stats');

  try {
    if (stats) {
      const today = new Date().toISOString().split('T')[0];
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weekEndStr = weekEnd.toISOString().split('T')[0];

      const todayCount = await env.DB.prepare(
        `SELECT COUNT(*) as count FROM bookings WHERE date = ? AND status != 'cancelled'`
      ).bind(today).first();

      const weekCount = await env.DB.prepare(
        `SELECT COUNT(*) as count FROM bookings WHERE date >= ? AND date <= ? AND status != 'cancelled'`
      ).bind(today, weekEndStr).first();

      return json({ today: todayCount?.count ?? 0, week: weekCount?.count ?? 0 });
    }

    if (date) {
      const result = await env.DB.prepare(
        `SELECT * FROM bookings WHERE date = ? ORDER BY time ASC`
      ).bind(date).all();
      return json({ appointments: result.results });
    }

    return json({ error: 'Missing parameters' }, 400);
  } catch (e) {
    return json({ error: 'Database error', detail: e.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { action } = body;

  // Login — check password, return token
  if (action === 'login') {
    const adminPassword = env.ADMIN_PASSWORD || 'clints2025';
    if (body.password === adminPassword) {
      return json({ token: ADMIN_TOKEN });
    }
    return json({ error: 'Invalid password' }, 401);
  }

  // All other actions require auth
  if (!isAuthed(request)) return json({ error: 'Unauthorized' }, 401);

  try {
    if (action === 'add') {
      const { name, phone, date, time, source } = body;
      if (!name || !date || !time) return json({ error: 'Name, date and time required' }, 400);

      // Check conflict
      const existing = await env.DB.prepare(
        `SELECT id FROM bookings WHERE date = ? AND time = ? AND status != 'cancelled'`
      ).bind(date, time).first();
      if (existing) return json({ error: 'That slot is already booked.' }, 409);

      const id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO bookings (id, name, phone, date, time, status, source, created_at)
         VALUES (?, ?, ?, ?, ?, 'confirmed', ?, datetime('now'))`
      ).bind(id, name, phone || '—', date, time, source || 'walk-in').run();
      return json({ success: true, id });
    }

    if (action === 'update_status') {
      const { id, status } = body;
      if (!id || !status) return json({ error: 'ID and status required' }, 400);
      await env.DB.prepare(
        `UPDATE bookings SET status = ? WHERE id = ?`
      ).bind(status, id).run();
      return json({ success: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: 'Database error', detail: e.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

function isAuthed(request) {
  const auth = request.headers.get('Authorization');
  return auth === ADMIN_TOKEN;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

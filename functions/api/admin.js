// functions/api/admin.js
// Cloudflare Pages Function — admin endpoints
// Requires D1 binding named "DB" and secret ADMIN_PASSWORD

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;
  const url = new URL(request.url);

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-password',
      }
    });
  }

  const adminPassword = env.ADMIN_PASSWORD || 'clints2025';
  const providedPassword =
    request.headers.get('x-admin-password') ||
    request.headers.get('Authorization') ||
    '';

  if (method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers }); }

    // Login
    if (body.action === 'login') {
      if (body.password === adminPassword) {
        return new Response(JSON.stringify({ success: true, token: adminPassword }), { status: 200, headers });
      }
      return new Response(JSON.stringify({ error: 'Invalid password' }), { status: 401, headers });
    }

    if (providedPassword !== adminPassword) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }

    try {
      if (body.action === 'add') {
        const { name, phone, date, time, source } = body;
        if (!name || !date || !time) return new Response(JSON.stringify({ error: 'Name, date and time required' }), { status: 400, headers });

        const existing = await env.DB.prepare(
          `SELECT id FROM bookings WHERE date = ? AND time = ? AND status != 'cancelled'`
        ).bind(date, time).first();
        if (existing) return new Response(JSON.stringify({ error: 'That slot is already booked.' }), { status: 409, headers });

        const id = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO bookings (id, name, phone, date, time, notes, status, source, created_at)
           VALUES (?, ?, ?, ?, ?, '', 'confirmed', ?, datetime('now'))`
        ).bind(id, name, phone || '—', date, time, source || 'walk-in').run();
        return new Response(JSON.stringify({ success: true, id }), { status: 201, headers });
      }

      if (body.action === 'update_status') {
        const { id, status } = body;
        if (!id) return new Response(JSON.stringify({ error: 'ID required' }), { status: 400, headers });
        await env.DB.prepare(`UPDATE bookings SET status = ? WHERE id = ?`).bind(status, id).run();
        return new Response(JSON.stringify({ success: true }), { status: 200, headers });
      }

      return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Database error', detail: e.message }), { status: 500, headers });
    }
  }

  // GET — require auth
  if (providedPassword !== adminPassword) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  }

  try {
    if (url.searchParams.get('stats')) {
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
      return new Response(JSON.stringify({ today: todayCount?.count ?? 0, week: weekCount?.count ?? 0 }), { status: 200, headers });
    }

    const date = url.searchParams.get('date');
    if (date) {
      const { results } = await env.DB.prepare(
        `SELECT * FROM bookings WHERE date = ? ORDER BY time ASC`
      ).bind(date).all();
      return new Response(JSON.stringify({ appointments: results }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Database error', detail: e.message }), { status: 500, headers });
  }
}

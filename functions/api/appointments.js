// functions/api/admin/appointments.js
// Handles GET /api/admin/appointments?date=YYYY-MM-DD
// and POST /api/admin/appointments (add/update)
// Auth via x-admin-password header matching ADMIN_PASSWORD env var

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
        'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
      }
    });
  }

  // Auth check
  const adminPassword = env.ADMIN_PASSWORD || 'clints2025';
  const provided = request.headers.get('x-admin-password') || '';
  if (provided !== adminPassword) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  }

  if (method === 'GET') {
    const date = url.searchParams.get('date');
    if (!date) return new Response(JSON.stringify({ error: 'Date required' }), { status: 400, headers });
    try {
      const { results } = await env.DB.prepare(
        `SELECT * FROM bookings WHERE date = ? ORDER BY time ASC`
      ).bind(date).all();
      return new Response(JSON.stringify({ appointments: results }), { status: 200, headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Database error', detail: e.message }), { status: 500, headers });
    }
  }

  if (method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers }); }

    try {
      if (body.action === 'add') {
        const { name, phone, date, time, notes, source } = body;
        if (!name || !date || !time) return new Response(JSON.stringify({ error: 'Name, date and time required' }), { status: 400, headers });

        const existing = await env.DB.prepare(
          `SELECT id FROM bookings WHERE date = ? AND time = ? AND status != 'cancelled'`
        ).bind(date, time).first();
        if (existing) return new Response(JSON.stringify({ error: 'That slot is already booked.' }), { status: 409, headers });

        const id = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO bookings (id, name, phone, date, time, notes, status, source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, datetime('now'))`
        ).bind(id, name, phone || '—', date, time, notes || '', source || 'walk-in').run();
        return new Response(JSON.stringify({ success: true, id }), { status: 201, headers });
      }

      if (body.action === 'update_status') {
        const { id, status } = body;
        if (!id || !status) return new Response(JSON.stringify({ error: 'ID and status required' }), { status: 400, headers });
        await env.DB.prepare(`UPDATE bookings SET status = ? WHERE id = ?`).bind(status, id).run();
        return new Response(JSON.stringify({ success: true }), { status: 200, headers });
      }

      return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Database error', detail: e.message }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
}

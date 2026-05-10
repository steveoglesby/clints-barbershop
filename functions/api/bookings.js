// Cloudflare Pages Function: /api/bookings
// Handles customer-facing booking: GET (available slots) and POST (create booking)

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  // GET /api/bookings?date=YYYY-MM-DD — return booked time slots for a date
  if (method === 'GET') {
    const url = new URL(request.url);
    const date = url.searchParams.get('date');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(JSON.stringify({ error: 'Invalid date' }), { status: 400, headers });
    }
    try {
      const { results } = await env.DB.prepare(
        `SELECT time FROM appointments WHERE date = ? AND status != 'cancelled'`
      ).bind(date).all();
      const booked = results.map(r => r.time);
      return new Response(JSON.stringify({ booked }), { status: 200, headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Database error' }), { status: 500, headers });
    }
  }

  // POST /api/bookings — create a new booking
  if (method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers }); }

    const { name, phone, date, time, notes } = body;
    if (!name || !phone || !date || !time) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      return new Response(JSON.stringify({ error: 'Invalid date or time format' }), { status: 400, headers });
    }

    try {
      // Check if slot is already taken
      const existing = await env.DB.prepare(
        `SELECT id FROM appointments WHERE date = ? AND time = ? AND status != 'cancelled'`
      ).bind(date, time).first();

      if (existing) {
        return new Response(JSON.stringify({ error: 'That time slot is already booked. Please choose another.' }), { status: 409, headers });
      }

      await env.DB.prepare(
        `INSERT INTO appointments (name, phone, date, time, notes, source, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'online', 'active', datetime('now'))`
      ).bind(name, phone.trim(), date, time, notes || '').run();

      return new Response(JSON.stringify({ success: true }), { status: 201, headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Database error' }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
}

import { randomBytes, randomUUID, createHash, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { database } from './db.mjs';

const scrypt = promisify(scryptCb);
const hash = value => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const text = (value, max = 120, required = true) => {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail('Проверь заполненные поля.');
  return value.trim();
};
const email = value => { const v = text(value, 180).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail('Укажи корректную почту.'); return v; };
const password = value => { if (typeof value !== 'string' || value.length < 10 || value.length > 128) fail('Пароль — от 10 до 128 символов.'); return value; };
const safeUser = u => ({ id: u.id, name: u.name, role: u.role, email: u.email });
const same = (a, b) => { const x = hash(a || ''), y = hash(b || ''); return timingSafeEqual(Buffer.from(x), Buffer.from(y)); };
async function passwordHash(value) { const salt = randomBytes(16).toString('hex'); return salt + ':' + Buffer.from(await scrypt(value, salt, 64)).toString('hex'); }
async function verifyPassword(value, stored) { const [salt, expected] = stored.split(':'); const actual = Buffer.from(await scrypt(value, salt, 64)); return timingSafeEqual(actual, Buffer.from(expected, 'hex')); }
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function cookie(token, request, clear = false) { return `home_session=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 2592000}${new URL(request.url).protocol === 'https:' || process.env.VERCEL ? '; Secure' : ''}`; }
async function session(db, userId, request) {
  const token = randomBytes(32).toString('hex');
  await db.batch([
    ['DELETE FROM sessions WHERE expires < $1', [now()]],
    ['INSERT INTO sessions(token,user_id,expires) VALUES($1,$2,$3)', [hash(token), userId, new Date(Date.now() + 30 * 86400000).toISOString()]]
  ]);
  return { 'Set-Cookie': cookie(token, request) };
}
async function rate(db, request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const minute = Math.floor(Date.now() / 60000);
  const key = hash(`${ip}:${minute}`);
  const result = await db.query('INSERT INTO rate_limits(key,attempts,expires) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET attempts=rate_limits.attempts+1 RETURNING attempts', [key, new Date(Date.now() + 120000).toISOString()]);
  if (Number(result[0].attempts) > 15) fail('Слишком много попыток. Подожди минуту.', 429);
  await db.query('DELETE FROM rate_limits WHERE expires < $1', [now()]);
}
async function currentUser(db, request) {
  const token = request.headers.get('cookie')?.match(/(?:^|;\s*)home_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) return null;
  const rows = await db.query('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token=$1 AND sessions.expires>$2', [hash(token), now()]);
  return rows[0] || null;
}
const response = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
async function parse(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail('Нужен JSON.', 415);
  if (Number(request.headers.get('content-length')) > 12000) fail('Слишком большой запрос.', 413);
  let bytes = 0, chunks = [];
  if (request.body) for await (const chunk of request.body) { bytes += chunk.length; if (bytes > 12000) fail('Слишком большой запрос.', 413); chunks.push(chunk); }
  try { const body = JSON.parse(Buffer.concat(chunks).toString()); if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Некорректные данные.'); return body; }
  catch { fail('Некорректные данные.'); }
}

export async function handleApi(request) {
  try {
    const url = new URL(request.url);
    // Vercel forwards the original API path via rewrite query parameter.
    const route = url.searchParams.get('route') || url.pathname.replace(/^\/api\/?/, '');
    const method = request.method;
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) return response({ error: 'Метод недоступен.' }, 405);
    if (method !== 'GET') {
      const origin = request.headers.get('origin');
      const expected = process.env.APP_ORIGIN || url.origin;
      if (origin && origin !== expected) fail('Обнови приложение и попробуй снова.', 403);
      if (request.headers.get('sec-fetch-site') === 'cross-site') fail('Запрос отклонён.', 403);
    }
    const db = await database();
    const user = await currentUser(db, request);
    if (method === 'GET' && route === 'session') {
      const configured = (await db.query("SELECT value FROM settings WHERE key='initialized'")).length > 0;
      return response({ user: user ? safeUser(user) : null, configured });
    }
    const body = method === 'GET' ? {} : await parse(request);
    if (['setup','login','join','recover'].includes(route) && method === 'POST') {
      await rate(db, request);
      const userEmail = email(body.email), pass = password(body.password);
      if (route === 'login') {
        const [found] = await db.query('SELECT * FROM users WHERE email=$1', [userEmail]);
        // Equal-cost password derivation for missing accounts.
        const dummy = '00000000000000000000000000000000:' + '00'.repeat(64);
        const valid = await verifyPassword(pass, found?.password || dummy);
        if (!found || !valid) fail('Почта или пароль не совпали.', 401);
        return response({ user: safeUser(found) }, 200, await session(db, found.id, request));
      }
      if (route === 'recover') {
        if (!process.env.SETUP_KEY || !same(body.key, process.env.SETUP_KEY)) fail('Ключ восстановления не подошёл.', 403);
        const [found] = await db.query('SELECT id FROM users WHERE email=$1', [userEmail]);
        if (!found) fail('Профиль не найден.', 404);
        await db.batch([['UPDATE users SET password=$1 WHERE id=$2', [await passwordHash(pass), found.id]], ['DELETE FROM sessions WHERE user_id=$1', [found.id]]]);
        return response({ ok: true });
      }
      const name = text(body.name, 40), id = randomUUID();
      const stored = await passwordHash(pass);
      if (route === 'setup') {
        if (!process.env.SETUP_KEY || process.env.SETUP_KEY.length < 24) fail('Добавь SETUP_KEY в настройки Vercel — не короче 24 символов.', 503);
        if (!same(body.key, process.env.SETUP_KEY)) fail('Ключ первого входа не подошёл.', 403);
        if ((await db.query("SELECT value FROM settings WHERE key='initialized'")).length) fail('Дом уже создан. Войди в свой профиль.', 409);
        try {
          await db.batch([
            ["INSERT INTO settings(key,value) VALUES('initialized','1')"],
            ['INSERT INTO users(id,email,name,role,password) VALUES($1,$2,$3,$4,$5)', [id, userEmail, name, 'child', stored]],
            ["INSERT INTO settings(key,value) VALUES('note','')"]
          ]);
        } catch { fail('Дом уже создан. Войди в свой профиль.', 409); }
      } else {
        const token = text(body.token, 100);
        const [invite] = await db.query('SELECT * FROM invites WHERE token=$1 AND used=0 AND expires>$2', [hash(token), now()]);
        if (!invite || invite.email !== userEmail) fail('Приглашение не подошло или истекло. Проверь почту и попроси новую ссылку.', 403);
        try {
          const result = await db.batch([
            ["INSERT INTO users(id,email,name,role,password) SELECT $1,$2,$3,'mother',$4 FROM invites WHERE token=$5 AND used=0 AND expires>$6 RETURNING id", [id, userEmail, name, stored, hash(token), now()]],
            ['UPDATE invites SET used=1 WHERE token=$1', [hash(token)]]
          ]);
          if (!result[0].length) fail('Приглашение уже использовано.', 409);
        } catch { fail('Мамин профиль уже создан или приглашение использовано.', 409); }
      }
      const [created] = await db.query('SELECT * FROM users WHERE id=$1', [id]);
      return response({ user: safeUser(created) }, 201, await session(db, id, request));
    }
    if (!user) fail('Войди в свой профиль.', 401);
    if (route === 'logout' && method === 'POST') {
      const token = request.headers.get('cookie')?.match(/home_session=([a-f0-9]{64})/)?.[1];
      await db.query('DELETE FROM sessions WHERE token=$1', [hash(token || '')]);
      return response({ ok: true }, 200, { 'Set-Cookie': cookie('', request, true) });
    }
    if (route === 'password' && method === 'POST') {
      if (!await verifyPassword(password(body.current), user.password)) fail('Текущий пароль не подошёл.', 403);
      await db.batch([['UPDATE users SET password=$1 WHERE id=$2', [await passwordHash(password(body.password)), user.id]], ['DELETE FROM sessions WHERE user_id=$1', [user.id]]]);
      return response({ ok: true }, 200, await session(db, user.id, request));
    }
    if (route === 'invite' && method === 'POST') {
      if (user.role !== 'child') fail('Приглашение создаёт первый участник дома.', 403);
      if ((await db.query("SELECT id FROM users WHERE role='mother'")).length) fail('Мамин профиль уже подключён.', 409);
      const target = email(body.email);
      if (target === user.email) fail('У вас должны быть разные почты.');
      const token = randomBytes(32).toString('hex');
      await db.batch([['DELETE FROM invites WHERE used=0'], ['INSERT INTO invites(token,email,expires) VALUES($1,$2,$3)', [hash(token), target, new Date(Date.now() + 7 * 86400000).toISOString()]]]);
      return response({ token, email: target });
    }
    if (route === 'state' && method === 'GET') {
      const [members, items, dinners, note] = await Promise.all([
        db.query('SELECT id,name,role FROM users ORDER BY role'),
        db.query('SELECT * FROM items ORDER BY done ASC,created_at DESC'),
        db.query('SELECT * FROM dinner WHERE day=$1', [today()]),
        db.query("SELECT value FROM settings WHERE key='note'")
      ]);
      const data = { user: safeUser(user), members, items, dinner: dinners, note: note[0]?.value || '', today: today() };
      if (user.role === 'mother') {
        data.bills = await db.query('SELECT bills.*,bill_payments.paid_at FROM bills LEFT JOIN bill_payments ON bill_payments.bill_id=bills.id AND bill_payments.month=$1 WHERE bills.user_id=$2 ORDER BY bills.due_day', [today().slice(0, 7), user.id]);
      }
      return response(data);
    }
    if (route === 'items' && method === 'POST') {
      if (!['shopping','tasks','important'].includes(body.kind)) fail('Неизвестный список.');
      const id = randomUUID();
      const assignee = body.kind === 'tasks' ? text(body.assigned_to || '', 50, false) : '';
      if (assignee && !(await db.query('SELECT id FROM users WHERE id=$1', [assignee])).length) fail('Такого участника нет в вашем доме.', 403);
      await db.query('INSERT INTO items(id,kind,title,detail,created_by,created_at,assignee) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, body.kind, text(body.title), text(body.detail || '', 400, false), user.id, now(), assignee]);
      return response({ id }, 201);
    }
    if (/^items\/[\w-]+$/.test(route)) {
      const id = route.split('/')[1];
      const [item] = await db.query('SELECT * FROM items WHERE id=$1', [id]);
      if (!item) fail('Запись уже удалена.', 404);
      if (method === 'DELETE') { await db.query('DELETE FROM items WHERE id=$1', [id]); return response({ ok: true }); }
      if (method === 'PATCH') {
        if ('done' in body) {
          if (typeof body.done !== 'boolean') fail('Некорректный статус.');
          await db.query('UPDATE items SET done=$1 WHERE id=$2', [body.done ? 1 : 0, id]);
        } else if ('assigned_to' in body) {
          if (item.kind !== 'tasks') fail('Исполнителя можно назначать только делам.');
          const assignee = text(body.assigned_to, 50, false);
          if (assignee && !(await db.query('SELECT id FROM users WHERE id=$1', [assignee])).length) fail('Такого участника нет в вашем доме.', 403);
          await db.query('UPDATE items SET assignee=$1 WHERE id=$2', [assignee, id]);
        } else if ('assignee' in body) {
          if (body.assignee !== '' && body.assignee !== user.id) fail('Можно взять дело только себе.', 403);
          if (body.assignee === '' && item.assignee && item.assignee !== user.id) fail('Это дело уже взял другой участник.', 409);
          const result = await db.query("UPDATE items SET assignee=$1 WHERE id=$2 AND (assignee='' OR assignee=$3) RETURNING id", [body.assignee, id, user.id]);
          if (!result.length) fail('Дело уже взял другой участник.', 409);
        } else fail('Неизвестное изменение.');
        return response({ ok: true });
      }
    }
    if (route === 'dinner' && method === 'POST') {
      if (!['yes','late','no'].includes(body.status)) fail('Выбери статус к ужину.');
      const arrival = text(body.arrival || '', 5, false);
      if (arrival && !/^([01]\d|2[0-3]):[0-5]\d$/.test(arrival)) fail('Проверь время.');
      await db.query('INSERT INTO dinner(day,user_id,status,arrival) VALUES($1,$2,$3,$4) ON CONFLICT(day,user_id) DO UPDATE SET status=excluded.status,arrival=excluded.arrival', [today(), user.id, body.status, arrival]);
      return response({ ok: true });
    }
    if (route === 'note' && method === 'POST') {
      await db.query("UPDATE settings SET value=$1 WHERE key='note'", [text(body.note || '', 500, false)]);
      return response({ ok: true });
    }
    if (route === 'bills' || route.startsWith('bills/')) {
      if (user.role !== 'mother') fail('Платежи доступны только маме.', 403);
      if (route === 'bills' && method === 'POST') {
        if (!Number.isFinite(body.amount) || body.amount <= 0 || body.amount > 10000000 || !Number.isInteger(body.due_day) || body.due_day < 1 || body.due_day > 31) fail('Проверь сумму и день оплаты.');
        const id = randomUUID();
        await db.query('INSERT INTO bills(id,user_id,title,amount,due_day) VALUES($1,$2,$3,$4,$5)', [id, user.id, text(body.title), Math.round(body.amount * 100), body.due_day]);
        return response({ id }, 201);
      }
      const id = route.split('/')[1];
      const [bill] = await db.query('SELECT * FROM bills WHERE id=$1 AND user_id=$2', [id, user.id]);
      if (!bill) fail('Платёж не найден.', 404);
      if (method === 'DELETE') { await db.query('DELETE FROM bills WHERE id=$1', [id]); return response({ ok: true }); }
      if (method === 'PATCH') {
        if (typeof body.paid !== 'boolean') fail('Проверь статус оплаты.');
        if (body.paid) await db.query('INSERT INTO bill_payments(bill_id,month,paid_at) VALUES($1,$2,$3) ON CONFLICT(bill_id,month) DO UPDATE SET paid_at=excluded.paid_at', [id, today().slice(0, 7), now()]);
        else await db.query('DELETE FROM bill_payments WHERE bill_id=$1 AND month=$2', [id, today().slice(0, 7)]);
        return response({ ok: true });
      }
    }
    if (route === 'export' && method === 'GET') {
      const data = { exported: now(), items: await db.query('SELECT * FROM items'), note: (await db.query("SELECT value FROM settings WHERE key='note'"))[0]?.value || '' };
      if (user.role === 'mother') { data.bills = await db.query('SELECT * FROM bills WHERE user_id=$1', [user.id]); data.payments = await db.query('SELECT bill_payments.* FROM bill_payments JOIN bills ON bills.id=bill_payments.bill_id WHERE bills.user_id=$1', [user.id]); }
      return response(data, 200, { 'Content-Disposition': 'attachment; filename="nash-dom-backup.json"' });
    }
    fail('Не найдено.', 404);
  } catch (error) {
    if (error.status) return response({ error: error.message }, error.status);
    // Do not log query strings, database credentials, passwords or request bodies.
    console.error('Home API error:', error.code || error.name || 'unknown');
    return response({ error: 'Не получилось сохранить. Попробуй ещё раз.' }, 500);
  }
}

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  moon:'M21 13a9 9 0 0 1-10-10A9 9 0 1 0 21 13',
  home:'M3 10 12 3l9 7v10H3Z M9 20v-7h6v7',
  bag:'M5 7h14l1 14H4Z M9 8V6a3 3 0 0 1 6 0v2',
  check:'m5 12 4 4L19 6',
  tasks:'M9 5h10v16H5V5h4 M9 3h6v4H9Z M9 12h6 M9 16h4',
  more:'M5 12h.01 M12 12h.01 M19 12h.01',
  plus:'M12 5v14 M5 12h14',
  arrow:'M5 12h14 m-5-5 5 5-5 5',
  chevron:'m9 5 7 7-7 7',
  close:'m6 6 12 12 M18 6 6 18',
  dinner:'M4 3v6a3 3 0 0 0 6 0V3 M7 3v18 M18 3c-3 3-3 8 0 9h2V3h-2v18',
  note:'M5 3h14v14l-4 4H5Z M15 21v-5h4 M8 8h8 M8 12h6',
  heart:'M12 21 3.5 12.5C-2 6 6 0 12 7c6-7 14-1 8.5 5.5Z',
  lock:'M6 10h12v11H6Z M8 10V7a4 4 0 0 1 8 0v3 M12 14v3',
  wallet:'M4 7h16v14H4V7l13-4v4 M16 12h5v5h-5Z',
  info:'M12 8h.01 M12 11v6 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  book:'M4 4h7a3 3 0 0 1 1 1 3 3 0 0 1 1-1h7v16h-7l-1 1-1-1H4Z M12 5v16',
  download:'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',
  logout:'M9 3H4v18h5 M9 12h12 m-5-5 5 5-5 5',
  user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 6 0 0 1 16 0v2',
  clock:'M12 7v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  trash:'M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
  refresh:'M20 8a8 8 0 1 0 0 8 M20 3v5h-5',
  link:'m10 13 4-4 M9 16l-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0 M15 8l2-2a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-6 0',
  sun:'M12 1v2 M12 21v2 M1 12h2 M21 12h2 M4 4l2 2 M18 18l2 2 M4 20l2-2 M18 6l2-2 M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.home}"/></svg>`;
const art = `<svg class="home-art" viewBox="0 0 170 180" aria-hidden="true"><circle cx="115" cy="41" r="23" fill="#d9ec9d" opacity=".9"/><path d="M27 180V103l55-43 55 43v77" fill="#aab982"/><path d="m15 110 67-53 68 53" fill="none" stroke="#d9ec9d" stroke-width="5"/><path d="M68 180v-47q14-13 29 0v47" fill="#244d3d"/><rect x="41" y="112" width="18" height="22" rx="7" fill="#d6e7ad"/><rect x="107" y="112" width="18" height="22" rx="7" fill="#d6e7ad"/><path d="M146 180v-52" stroke="#bed092" stroke-width="3"/><ellipse cx="148" cy="132" rx="13" ry="25" fill="#73956e" transform="rotate(20 148 132)"/><ellipse cx="140" cy="155" rx="10" ry="19" fill="#d9ec9d" transform="rotate(-33 140 155)"/><path d="M12 180v-30" stroke="#9cb77a" stroke-width="3"/><ellipse cx="15" cy="152" rx="12" ry="19" fill="#7d9a70" transform="rotate(35 15 152)"/></svg>`;
let user = null, data = null, tab = 'home', filter = 'all', offline = false, authMode = 'login', inviteToken = '', busy = false, refreshing = false;
const joinMatch = location.hash.match(/^#join=([a-f0-9]{64})$/);
if (joinMatch) { inviteToken = joinMatch[1]; authMode = 'join'; history.replaceState(null, '', '/'); }
const money = cents => (cents / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
const name = id => data?.members.find(m => m.id === id)?.name || 'Участник';
const roleName = role => role === 'mother' ? 'Мама' : 'Ты';
const openItems = kind => data.items.filter(i => i.kind === kind && !i.done);
const labels = { shopping:'Покупки', tasks:'Дела по дому', important:'Важное под рукой', bills:'Мои платежи' };
const itemIcons = { shopping:'bag', tasks:'tasks', important:'book' };
const toast = message => { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').classList.remove('visible'), 3200); };
async function api(route, method = 'GET', body) {
  let r;
  try { r = await fetch('/api/' + route, { method, credentials:'same-origin', cache:'no-store', headers: { 'Content-Type':'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
  catch { offline = true; throw new Error('Нет связи. Изменение не сохранено — попробуй, когда появится интернет.'); }
  const result = await r.json().catch(() => ({ error:'Сервер недоступен. Попробуй позже.' }));
  if (!r.ok) {
    if (r.status === 401 && user && !['login','password'].includes(route)) { user = null; data = null; renderAuth(); }
    throw new Error(result.error || 'Не удалось выполнить действие.');
  }
  offline = false;
  return result;
}
async function sync(render = true) {
  if (refreshing || !user) return;
  refreshing = true;
  try { data = await api('state'); user = data.user; if (render) renderApp(); }
  catch (error) { offline = true; if (data && render) renderApp(); else if (!data) renderLoadError(error.message); }
  finally { refreshing = false; }
}
function brand() { return `<div class="brand"><span class="brand-mark">${icon('home')}</span>наш дом<span style="color:#aab58c;font-weight:400">.</span></div>`; }
function nav() {
  const items = [['home','home','Сегодня'],['shopping','bag','Покупки'],['tasks','tasks','Дела'],...(user.role === 'mother' ? [['bills','wallet','Оплаты']] : []),['more','more','Ещё']];
  return `<nav class="nav" aria-label="Основная навигация">${items.map(([key,i,label]) => `<button data-action="tab" data-tab="${key}" class="${tab === key || (tab === 'important' && key === 'more') ? 'active' : ''}" ${tab === key ? 'aria-current="page"' : ''}><span class="nav-icon">${icon(i)}</span>${label}</button>`).join('')}</nav>`;
}
function renderApp() {
  if (!data || !user) return;
  $('#app').className = 'app';
  const page = tab === 'home' ? home() : ['shopping','tasks','important'].includes(tab) ? listPage(tab) : tab === 'bills' && user.role === 'mother' ? billsPage() : more();
  $('#app').innerHTML = `<header class="top">${brand()}<div class="header-actions"><button class="icon-btn theme-toggle" data-action="toggle-theme" aria-label="Переключить светлую и тёмную тему">${icon(document.documentElement.dataset.theme==='dark'?'sun':'moon')}</button><button class="profile" data-action="profile" aria-label="Твой профиль"><b>${esc(user.name.slice(0,1).toUpperCase())}</b>${user.role === 'mother' ? 'Мама' : esc(user.name)}</button></div></header><main class="content">${page}</main>${nav()}`;
}
function greeting() { const hour = Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',hourCycle:'h23'}).format(new Date())); return hour < 5 ? 'Тихой ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер'; }
function empty(kind, compact = false) {
  const content = { shopping:['Пока всё есть','Добавляйте то, что нужно купить. Список общий — второй участник сразу увидит изменения.'],tasks:['Дома всё спокойно','Добавь небольшое дело. Любой из вас сможет взять его себе.'],important:['Всё нужное в одном месте','Телефон мастера, модель фильтра, адрес пункта выдачи — больше не потеряется в переписке.'] }[kind];
  return `<div class="empty"><div class="empty-icon">${icon(itemIcons[kind])}</div><h3>${content[0]}</h3><p>${content[1]}</p>${compact ? `<button class="small-btn" data-action="add-item" data-kind="${kind}">${icon('plus')}Добавить ${kind === 'tasks' ? 'дело' : kind === 'shopping' ? 'покупку' : 'запись'}</button>` : ''}</div>`;
}
function sectionHead(title, target, button = 'Все') { return `<div class="section-head"><h2>${title}</h2><button class="small-btn" data-action="tab" data-tab="${target}">${button} ${icon('arrow')}</button></div>`; }
function home() {
  const date = new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/Moscow'}).format(new Date());
  const n = openItems('tasks').length;
  return `<div class="kicker">${esc(date)}</div><div class="heading-row"><h1>${greeting()}${user.role === 'mother' ? ', мама' : ''}</h1></div><p class="intro">Хорошо, когда дома всё понятно.</p><section class="hero"><h2>Вместе —<br>немного проще.</h2><p>Меньше «а ты не забыл?».<br>Больше времени друг на друга.</p><span class="pill">${icon('heart')} Ваш маленький общий мир</span>${art}</section><div class="section-head"><h2>Кто сегодня к ужину?</h2><span class="pill">${icon('clock')} Сегодня</span></div>${dinnerPanel()}<button class="note" data-action="note"><span class="note-icon">${icon('note')}</span><div><strong>Записка на холодильнике</strong><p>${data.note ? esc(data.note) : '«Ужин в холодильнике» или просто что-то тёплое. Оставь вашу первую записку.'}</p></div><span class="arrow">${icon('chevron')}</span></button>${sectionHead('Домашние мелочи','shopping','Открыть')}<div class="quick-grid"><button class="quick-card" data-action="tab" data-tab="shopping"><span class="count">${openItems('shopping').length}</span><div class="icon">${icon('bag')}</div><b>Купить домой</b><p>${openItems('shopping').length ? 'В одном общем списке' : 'Добавим что-нибудь?'}</p></button><button class="quick-card" data-action="tab" data-tab="tasks"><span class="count">${n}</span><div class="icon">${icon('tasks')}</div><b>Дела по дому</b><p>${n ? 'Разделим заботы' : 'Сегодня без суеты'}</p></button></div>${sectionHead('На ближайшее время','tasks')}<section class="panel list-panel">${n ? openItems('tasks').slice(0,3).map(itemRow).join('') : empty('tasks',true)}</section>${data.members.length < 2 ? inviteCard() : `<p class="footer-note">${icon('heart')} У каждого свои дела. Дом у вас общий.</p>`}`;
}
function dinnerPanel() {
  const mine = data.dinner.find(d => d.user_id === user.id);
  const statusText = d => !d ? 'Пока не ответил(а)' : ({yes:'Буду к ужину',late:'Буду позже',no:'Без меня'}[d.status]) + (d.arrival && d.status !== 'no' ? ' · ' + d.arrival : '');
  return `<section class="panel"><div class="dinner-top"><div class="flex"><div class="dinner-icon">${icon('dinner')}</div><div><h3>Ужин без догадок</h3><div class="sub">Один ответ — и всё понятно</div></div></div></div>${data.members.map(m => { const d = data.dinner.find(d => d.user_id === m.id); return `<div class="dinner-person"><span class="initial ${m.role}">${esc(m.name[0])}</span><strong>${m.id === user.id ? 'Ты' : esc(m.name)}${m.role === 'mother' && m.id !== user.id ? ' · мама' : ''}</strong><span class="sub ${d ? 'answered' : ''}">${statusText(d)}</span></div>`; }).join('')}${data.members.length < 2 ? `<div class="dinner-person"><span class="initial mother">М</span><strong>Мама</strong><span class="sub">Ждём приглашения</span></div>` : ''}<div class="choices" role="group" aria-label="Твой статус к ужину">${[['yes','Буду'],['late','Позже'],['no','Без меня']].map(([key,label])=>`<button class="choice ${mine?.status === key ? 'selected' : ''}" data-action="dinner" data-status="${key}" aria-pressed="${mine?.status === key}">${label}</button>`).join('')}</div>${mine && mine.status !== 'no' ? `<div class="arrival">${icon('clock')} ${mine.arrival ? 'Буду дома к ' + mine.arrival : 'Можно уточнить время'}<button class="small-btn" data-action="arrival">${mine.arrival ? 'Изменить' : 'Указать'}</button></div>` : ''}</section>`;
}
function itemRow(item) {
  return `<div class="row ${item.done ? 'done' : ''}"><button class="check ${item.done ? 'checked' : ''}" data-action="toggle" data-id="${item.id}" aria-label="${item.done ? 'Вернуть в список' : 'Отметить выполненным'}: ${esc(item.title)}" aria-pressed="${!!item.done}">${item.done ? icon('check') : ''}</button><div class="row-main"><div class="row-title">${esc(item.title)}</div>${item.detail || item.kind === 'tasks' ? `<div class="sub">${esc(item.detail)}${item.detail && item.assignee ? ' · ' : ''}${item.assignee ? esc(name(item.assignee)) : item.kind === 'tasks' ? 'Пока без исполнителя' : ''}</div>` : ''}</div><div class="row-end">${item.kind === 'tasks' && !item.done ? `<button class="take ${item.assignee === user.id ? 'mine' : ''}" data-action="take" data-id="${item.id}" ${item.assignee && item.assignee !== user.id ? 'disabled' : ''}>${item.assignee === user.id ? 'Я делаю ✓' : item.assignee ? esc(name(item.assignee)) : 'Я сделаю'}</button><button class="icon-btn assign-btn" data-action="assign" data-id="${item.id}" aria-label="Назначить исполнителя: ${esc(item.title)}">${icon('user')}</button>` : ''}<button class="icon-btn" data-action="item-menu" data-id="${item.id}" aria-label="Действия: ${esc(item.title)}">${icon('more')}</button></div></div>`;
}
function syncLabel() { return `<span class="sync ${offline ? 'offline' : ''}"><i class="status-dot"></i>${offline ? 'Нет связи' : 'Общий список'}${offline ? '<button class="sync-retry" data-action="refresh">Обновить</button>' : ''}</span>`; }
function listPage(kind) {
  const all = data.items.filter(i => i.kind === kind);
  const active = all.filter(i => !i.done), done = all.filter(i => i.done);
  if (kind === 'important') return `<div class="kicker">ВМЕСТО ПОИСКА В ПЕРЕПИСКЕ</div><div class="heading-row"><h1>${labels[kind]}</h1></div><p class="intro">Телефоны, заметки и другие полезные мелочи.</p><button class="primary" data-action="add-item" data-kind="important">${icon('plus')} Добавить запись</button><div style="height:18px"></div>${all.length ? all.map(i=>`<article class="panel important-card"><button class="icon-btn" data-action="item-menu" data-id="${i.id}" aria-label="Удалить запись: ${esc(i.title)}">${icon('more')}</button><h3>${esc(i.title)}</h3><p>${esc(i.detail)}</p></article>`).join('') : `<section class="panel">${empty(kind)}</section>`}`;
  const show = filter === 'mine' ? active.filter(i => i.assignee === user.id) : active;
  return `<div class="kicker">${kind === 'shopping' ? 'НИЧЕГО НЕ ЗАБУДЕМ' : 'ДЕЛИМ ЗАБОТЫ, А НЕ СЧЁТ'}</div><div class="heading-row"><h1>${labels[kind]}</h1></div><p class="intro">${kind === 'shopping' ? 'Кто идёт в магазин — просто открывает список.' : 'Выбери дело, которое возьмёшь на себя.'}</p><form id="quick-add" class="add-bar" data-kind="${kind}"><input name="title" aria-label="${kind === 'shopping' ? 'Что купить' : 'Новое дело'}" placeholder="${kind === 'shopping' ? 'Что купить домой?' : 'Что нужно сделать?'}" required maxlength="120" autocomplete="off"><button aria-label="Добавить">${icon('plus')}</button></form>${kind === 'tasks' ? `<div class="chips"><button class="chip ${filter === 'all' ? 'active' : ''}" data-action="filter" data-filter="all">Все дела ${active.length}</button><button class="chip ${filter === 'mine' ? 'active' : ''}" data-action="filter" data-filter="mine">Я делаю ${active.filter(i=>i.assignee===user.id).length}</button><button class="chip" data-action="add-item" data-kind="tasks">С пояснением +</button></div>` : ''}<div class="list-toolbar"><span>${active.length} ${kind === 'shopping' ? 'в списке' : 'осталось'}</span>${syncLabel()}</div><section class="panel list-panel">${show.length ? show.map(itemRow).join('') : filter === 'mine' ? `<div class="empty"><h3>Пока ничего не взято</h3><p>Открой «Все дела» и нажми «Я сделаю».</p></div>` : empty(kind)}</section>${!all.length && kind === 'shopping' ? `<div class="starter-chips">${['Молоко','Хлеб','Яйца','Овощи'].map(t=>`<button class="chip" data-action="quick-product" data-title="${t}">+ ${t}</button>`).join('')}</div>` : ''}${done.length ? `<div class="divider-label">${kind === 'shopping' ? 'Уже купили' : 'Уже сделали'} · ${done.length}</div><section class="panel list-panel">${done.map(itemRow).join('')}</section>` : ''}<p class="footer-note">${icon('refresh')} Обновляется между вашими устройствами</p>`;
}
function inviteCard() { return `<section class="panel invite-card" style="margin-top:22px"><div class="tag">ВАШ ДОМ ДЛЯ ДВОИХ</div><h3 style="margin-top:9px">Позови маму домой</h3><p>Отправь ей личную ссылку. Она создаст свой пароль и увидит ваши общие списки.</p><button class="primary light" data-action="invite">${icon('link')} Создать приглашение</button></section>`; }
function billsPage() {
  const bills = data.bills || [], total = bills.reduce((n,b)=>n+Number(b.amount),0), paid = bills.filter(b=>b.paid_at).reduce((n,b)=>n+Number(b.amount),0);
  const month = new Intl.DateTimeFormat('ru-RU',{month:'long',timeZone:'Europe/Moscow'}).format(new Date());
  return `<div class="kicker">ЛИЧНЫЙ РАЗДЕЛ МАМЫ</div><div class="heading-row"><h1>Домашние платежи</h1></div><p class="intro">Аренда и счета — спокойно и по порядку.</p><div class="bill-overview"><div class="sub" style="text-transform:capitalize">${month} · осталось оплатить</div><div class="bill-total">${money(total-paid)}</div><div class="bill-totals"><div>За месяц<b>${money(total)}</b></div><div>Уже оплачено<b>${money(paid)}</b></div></div></div><button class="primary outline" data-action="add-bill">${icon('plus')} Добавить регулярный платёж</button><div class="info-banner">${icon('lock')}<div>Видно только в твоём профиле. Здесь отмечаем оплату — деньги приложение не переводит.</div></div>${bills.length ? bills.map(billCard).join('') : `<section class="panel"><div class="empty"><div class="empty-icon">${icon('wallet')}</div><h3>Начнём с аренды?</h3><p>Укажи сумму и день месяца. В новом месяце платёж снова появится неоплаченным.</p></div></section>`}`;
}
function billCard(b) {
  const [year,month,day]=data.today.split('-').map(Number); const due=Math.min(b.due_day,new Date(Date.UTC(year,month,0)).getUTCDate());
  return `<article class="panel bill-card"><div class="row"><div class="bill-icon">${icon(b.title.toLowerCase().includes('аренд') ? 'home' : 'wallet')}</div><div class="row-main"><h3>${esc(b.title)}</h3><div class="sub ${b.paid_at ? 'paid' : day>due ? 'due' : ''}">${b.paid_at ? 'Оплачено в этом месяце' : (day>due ? 'Срок прошёл · ' : day===due ? 'Оплатить сегодня · ' : 'До ') + due + ' числа'}</div></div><div class="money">${money(Number(b.amount))}</div></div><div class="bill-actions"><button class="small-btn danger" data-action="delete-bill" data-id="${b.id}">Удалить</button><button class="take ${b.paid_at ? 'mine' : ''}" data-action="pay-bill" data-id="${b.id}">${b.paid_at ? 'Оплачено ✓ · отменить' : 'Отметить оплату'}</button></div></article>`;
}
function more() { return `<div class="kicker">МАЛЕНЬКИЕ НАСТРОЙКИ ВАШЕГО МИРА</div><h1 class="view-title">Наше пространство</h1><p class="intro">Всё важное — рядом.</p><div class="panel">${data.members.map(m=>`<div class="member"><span class="initial ${m.role}">${esc(m.name[0])}</span><div><strong>${esc(m.name)}</strong><div class="sub">${m.role === 'mother' ? 'Мама · личные оплаты' : 'Общие списки и дела'}</div></div><span class="pill">${m.id === user.id ? 'Это ты' : 'Дома'}</span></div>`).join('')}</div>${data.members.length<2?inviteCard():''}<div class="panel">${[['important','book','Важное под рукой','Телефоны, заметки, полезные мелочи'],['install','download','На экран «Домой»','Отдельная иконка на iPhone'],['theme','moon','Тема оформления',themeName()],['password','lock','Изменить пароль','Личный вход в приложение'],['export','download','Скачать копию данных','Твои доступные записи в JSON'],['refresh','refresh','Обновить данные','Свериться с общим списком'],['logout','logout','Выйти из профиля','На этом устройстве']].map(([a,i,t,s])=>`<button class="menu-row" data-action="${a}"><span class="icon">${icon(i)}</span><div><b>${t}</b><div class="sub">${s}</div></div><span class="arrow">${icon('chevron')}</span></button>`).join('')}</div><p class="footer-note">Наш дом · версия 1.0<br><br>Меньше суеты. Больше вместе.</p>`; }
function sheet(title, body) { $('#sheet-content').innerHTML=`<div class="sheet-head"><h2 id="sheet-title">${title}</h2><button class="icon-btn" data-action="close" aria-label="Закрыть">${icon('close')}</button></div>${body}`; if (!$('#sheet').open) $('#sheet').showModal(); }
function closeSheet() { $('#sheet').close(); }
function input(label, name, placeholder = '', type = 'text', extra = '') { return `<label>${label}<input name="${name}" type="${type}" placeholder="${placeholder}" required ${extra}></label>`; }
function formError(form, message) { let node=form.querySelector('.error'); if(!node){node=document.createElement('p');node.className='error';node.setAttribute('role','alert');form.append(node)}node.textContent=message; }
function addItem(kind) { sheet({shopping:'Добавить покупку',tasks:'Новое дело',important:'Важная мелочь'}[kind],`<form id="item-form" data-kind="${kind}">${input(kind==='important'?'Название':'Что нужно?', 'title',kind==='shopping'?'Например, молоко':kind==='tasks'?'Забрать заказ':'Контакт мастера','text','maxlength="120"')}${kind==='tasks'?assigneeSelect(''):''}<label>${kind==='important'?'Запись':'Пояснение · необязательно'}<textarea name="detail" maxlength="400" placeholder="${kind==='important'?'Телефон, адрес или заметка':'Можно добавить время или подробности'}"></textarea></label><button class="primary">${icon('plus')} Добавить</button></form>`); }
function invite() { sheet('Пригласить маму',`${['localhost','127.0.0.1'].includes(location.hostname)?'<div class="info-banner">Сейчас это локальный просмотр. Для приглашения на другой телефон сначала опубликуй приложение на Vercel.</div>':''}<p class="sheet-copy">Ссылка будет привязана к её почте и действовать 7 дней. Ты отправишь её маме удобным способом.</p><form id="invite-form">${input('Почта мамы','email','mama@example.ru','email','autocomplete="email"')}<p class="form-note">Она сама придумает пароль. Аккаунт ChatGPT не нужен.</p><button class="primary">Создать личную ссылку</button></form>`); }
function install() { sheet('Дом — в одном касании',`<div class="sheet-copy"><ol><li>Открой ссылку на приложение в <strong>Safari</strong>.</li><li>Нажми <strong>«Поделиться»</strong> — значок со стрелкой вверх.</li><li>Выбери <strong>«На экран Домой»</strong>.</li><li>Если есть переключатель «Открывать как веб-приложение» — включи его и нажми <strong>«Добавить»</strong>.</li></ol><p>Своя иконка, отдельное окно, удобная нижняя навигация. На втором телефоне сделай то же самое.</p></div><button class="primary" data-action="close">Понятно</button>`); }
function profile() { sheet('Твой уголок',`<div class="panel" style="margin-top:20px"><div class="member"><span class="initial ${user.role}">${esc(user.name[0])}</span><div><strong>${esc(user.name)}</strong><div class="sub">${esc(user.email)}</div></div></div><p class="sheet-copy">${user.role==='mother'?'Общие покупки и дела — для вас обоих. Оплаты — только для тебя.':'Покупки, дела, ужин и записи — общие. Мамины оплаты остаются в её профиле.'}</p></div><button class="primary" data-action="install">Добавить на экран «Домой»</button>`); }
function changePassword() { sheet('Изменить пароль',`<form id="password-form">${input('Текущий пароль','current','','password','autocomplete="current-password" minlength="10" maxlength="128"')}${input('Новый пароль','password','Не менее 10 символов','password','autocomplete="new-password" minlength="10" maxlength="128"')}<p class="form-note">После смены пароля другие устройства выйдут из профиля.</p><button class="primary">Сохранить пароль</button></form>`); }
function themeName(){return {light:'Светлая',dark:'Тёмная',system:'Как на устройстве'}[window.homeTheme.get()]}
function themeSheet(){sheet('Твой уютный свет',`<p class="sheet-copy">У каждого своё оформление. Выбор сохраняется на этом устройстве.</p><div class="theme-options">${[['light','sun','Светлая','Тёплая бумага и зелень'],['dark','moon','Тёмная','Мягкий свет для вечера'],['system','refresh','Как на устройстве','Меняется вместе с iPhone']].map(([value,i,title,desc])=>`<button class="menu-row" data-action="set-theme" data-theme="${value}"><span class="icon">${icon(i)}</span><div><b>${title}</b><div class="sub">${desc}</div></div><span class="arrow">${window.homeTheme.get()===value?icon('check'):icon('chevron')}</span></button>`).join('')}</div>`)}
function assigneeSelect(selected){return `<label>Кто сделает?<select name="assigned_to"><option value="">Без исполнителя · можно взять</option>${data.members.map(m=>`<option value="${m.id}" ${m.id===selected?'selected':''}>${m.id===user.id?'Я':esc(m.name)}${m.role==='mother'&&m.id!==user.id?' · мама':''}</option>`).join('')}</select></label>`}
function assignSheet(id){const item=data.items.find(i=>i.id===id);if(!item)return;sheet('Кому поручим?',`<p class="sheet-copy">${esc(item.title)}</p><form id="assign-form" data-id="${id}">${assigneeSelect(item.assignee)}<p class="form-note">Назначить дело или изменить исполнителя может любой из вас. Дело без исполнителя можно взять кнопкой «Я сделаю».</p><button class="primary">Сохранить назначение</button></form>`)}
function setTab(next) { tab=next;filter='all';renderApp();window.scrollTo({top:0}); }
async function mutate(route, method, body, message) { await api(route,method,body); await sync(); if(message)toast(message); }
document.addEventListener('click',async event=>{
  const el=event.target.closest('[data-action]');if(!el||el.disabled||busy)return;
  const a=el.dataset.action,id=el.dataset.id;
  try {
    if(a==='close')return closeSheet();
    if(a==='tab')return setTab(el.dataset.tab);
    if(a==='important')return setTab('important');
    if(a==='filter'){filter=el.dataset.filter;return renderApp()}
    if(a==='auth-mode'){authMode=el.dataset.mode;return renderAuth()}
    if(a==='add-item')return addItem(el.dataset.kind);
    if(a==='toggle-theme'){window.homeTheme.set(document.documentElement.dataset.theme==='dark'?'light':'dark');renderApp();return} 
    if(a==='theme')return themeSheet();
    if(a==='set-theme'){window.homeTheme.set(el.dataset.theme);closeSheet();if(user)renderApp();return toast('Оформление сохранено')}
    if(a==='assign')return assignSheet(id);
    if(a==='profile')return profile();
    if(a==='install')return install();
    if(a==='password')return changePassword();
    if(a==='invite')return invite();
    if(a==='note')return sheet('Записка на холодильнике',`<form id="note-form"><p class="sheet-copy">Что стоит знать другому? Записку видно вам обоим.</p><label>Твоя записка<textarea name="note" maxlength="500" placeholder="Тебе оставили ужин в холодильнике 💚">${esc(data.note)}</textarea></label><button class="primary">Оставить записку</button></form>`);
    if(a==='arrival'){const d=data.dinner.find(d=>d.user_id===user.id);return sheet('Когда будешь дома?',`<form id="arrival-form"><label>Примерное время<input name="arrival" type="time" required value="${d?.arrival || '19:00'}"></label><button class="primary">Сохранить время</button></form>`)}
    if(a==='item-menu'){const item=data.items.find(i=>i.id===id);return sheet(esc(item.title),`<p class="sheet-copy">${esc(item.detail || 'Добавлено в общий список.')}</p>${item.kind==='tasks'?`<button class="primary" data-action="assign" data-id="${id}">${icon('user')} Назначить исполнителя</button><div style="height:12px"></div>`:''}<button class="primary outline danger" data-action="delete-item" data-id="${id}">${icon('trash')} Удалить из общего списка</button><p class="form-note">Запись исчезнет у вас обоих.</p>`)}
    if(a==='add-bill')return sheet('Регулярный платёж',`<form id="bill-form">${input('Название','title','Аренда квартиры','text','maxlength="120"')}<div class="form-grid">${input('Сумма, ₽','amount','30 000','number','min="0.01" max="10000000" step="0.01" inputmode="decimal"')}${input('День месяца','due_day','Например, 5','number','min="1" max="31" step="1" inputmode="numeric"')}</div><p class="form-note">Повторяется каждый месяц. Если в месяце нет этого числа — используем его последний день.</p><button class="primary">Сохранить платёж</button></form>`);
    if(a==='delete-bill'){const b=data.bills.find(b=>b.id===id);return sheet('Удалить платёж?',`<p class="sheet-copy">«${esc(b.title)}» и его история оплат будут удалены. Остальные платежи сохранятся.</p><button class="primary danger outline" data-action="confirm-delete-bill" data-id="${id}">Удалить платёж</button>`)}
    if(a==='export'){const r=await api('export');const blob=new Blob([JSON.stringify(r,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download='nash-dom-backup.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return toast('Копия данных скачана')}
    if(a==='refresh')return await sync();
    busy=true;el.disabled=true;
    if(a==='toggle'){const item=data.items.find(i=>i.id===id);await mutate('items/'+id,'PATCH',{done:!item.done},item.done?'Вернули в список':item.kind==='shopping'?'Куплено ✓':'Готово ✓')}
    if(a==='take'){const item=data.items.find(i=>i.id===id);await mutate('items/'+id,'PATCH',{assignee:item.assignee===user.id?'':user.id},item.assignee===user.id?'Дело снова свободно':'Отлично, это дело за тобой')}
    if(a==='delete-item'){await api('items/'+id,'DELETE',{});closeSheet();await sync();toast('Запись удалена')}
    if(a==='quick-product')await mutate('items','POST',{kind:'shopping',title:el.dataset.title},'Добавлено в общий список');
    if(a==='dinner'){const mine=data.dinner.find(d=>d.user_id===user.id);await mutate('dinner','POST',{status:el.dataset.status,arrival:el.dataset.status==='no'?'':mine?.arrival||''},'Теперь дома знают твои планы')}
    if(a==='pay-bill'){const bill=data.bills.find(b=>b.id===id);await mutate('bills/'+id,'PATCH',{paid:!bill.paid_at},bill.paid_at?'Отметку оплаты отменили':'Оплата отмечена ✓')}
    if(a==='confirm-delete-bill'){await api('bills/'+id,'DELETE',{});closeSheet();await sync();toast('Платёж удалён')}
    if(a==='logout'){await api('logout','POST',{});user=null;data=null;tab='home';closeSheet();renderAuth();toast('Ты вышел из профиля')}
  }catch(error){toast(error.message)}finally{busy=false;if(el.isConnected)el.disabled=false}
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement))return;event.preventDefault();if(busy)return;busy=true;const button=form.querySelector('button[type="submit"],button.primary,button');if(button)button.disabled=true;const fields=Object.fromEntries(new FormData(form));
  try {
    if(form.id==='auth-form'){
      if(authMode==='recover'){await api('recover','POST',fields);authMode='login';renderAuth();return toast('Пароль обновлён. Теперь можно войти.')}
      const result=await api(authMode,'POST',{...fields,...(authMode==='join'?{token:inviteToken}:{})});user=result.user;authMode='login';await sync();return;
    }
    if(form.id==='quick-add'){await api('items','POST',{kind:form.dataset.kind,title:fields.title});await sync();$('#quick-add input')?.focus();return}
    if(form.id==='item-form')await api('items','POST',{...fields,kind:form.dataset.kind});
    if(form.id==='assign-form')await api('items/'+form.dataset.id,'PATCH',{assigned_to:fields.assigned_to});
    if(form.id==='note-form')await api('note','POST',fields);
    if(form.id==='arrival-form'){const mine=data.dinner.find(d=>d.user_id===user.id);await api('dinner','POST',{status:mine?.status||'yes',arrival:fields.arrival})}
    if(form.id==='bill-form')await api('bills','POST',{...fields,amount:Number(fields.amount),due_day:Number(fields.due_day)});
    if(form.id==='password-form')await api('password','POST',fields);
    if(form.id==='invite-form'){
      const result=await api('invite','POST',fields);const url=location.origin+'/#join='+result.token;
      sheet('Ссылка для мамы готова',`<p class="sheet-copy">Отправь ссылку маме лично. Войти по ней можно с почтой <strong>${esc(result.email)}</strong>. Действует 7 дней, после регистрации перестанет работать.</p><div class="invite-link">${esc(url)}</div><button class="primary" id="copy-invite" style="margin-top:20px">${icon('link')} Скопировать ссылку</button><p class="form-note">Письмо автоматически не отправляется.</p>`);
      $('#copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText(url);toast('Ссылка скопирована')}catch{toast('Выдели и скопируй ссылку выше')}};return;
    }
    closeSheet();await sync();toast('Сохранено для вашего дома');
  }catch(error){formError(form,error.message)}finally{busy=false;if(button?.isConnected)button.disabled=false}
});
$('#sheet').addEventListener('click',event=>{if(event.target===$('#sheet')){const r=$('#sheet').getBoundingClientRect();if(event.clientY<r.top||event.clientY>r.bottom||event.clientX<r.left||event.clientX>r.right)closeSheet()}});
function renderAuth() {
  const setup=authMode==='setup',join=authMode==='join',recover=authMode==='recover';
  $('#app').className='app auth-page';
  $('#app').innerHTML=`<main class="auth"><div class="auth-brand">${brand()}</div><div class="kicker">${setup?'ВАШЕ НОВОЕ ОБЩЕЕ МЕСТО':join?'ТЕБЯ УЖЕ ЖДУТ ДОМА':recover?'СНОВА НА СВЯЗИ':'ВМЕСТЕ ПРОЩЕ'}</div><h1>${setup?'Давай обустроимся.':join?'Добро пожаловать,<br>мама.':recover?'Вернём доступ.':'Хорошо,<br>когда ты дома.'}</h1><p class="intro">${setup?'Создай свой профиль, а затем пригласи маму. У неё будет отдельный вход и личный раздел оплат.':join?'Покупки, небольшие дела и планы на ужин — теперь в одном уютном месте.':recover?'Потребуется секретный ключ из настроек Vercel. После восстановления другие устройства выйдут из профиля.':'Покупки, дела и маленькие заботы.<br>В одном месте. Для вас двоих.'}</p><form id="auth-form">${setup||recover?input('Секретный ключ из настроек Vercel','key','SETUP_KEY','password','autocomplete="off" minlength="24"'):''}${setup||join?input('Как тебя называть?','name',join?'Мама':'Твоё имя','text','autocomplete="given-name" maxlength="40"'):''}${input('Твоя почта','email','name@example.ru','email','autocomplete="username"')}${input(recover?'Новый пароль':'Пароль','password','Не менее 10 символов','password',`autocomplete="${setup||join||recover?'new-password':'current-password'}" minlength="10" maxlength="128"`)}<button class="primary">${setup?'Создать наш дом':join?'Присоединиться':recover?'Обновить пароль':'Войти домой'} ${icon('arrow')}</button></form>${!setup&&!join?`<div class="auth-mode"><button data-action="auth-mode" data-mode="${recover?'login':'recover'}">${recover?'Назад ко входу':'Не помню пароль'}</button></div>`:''}<div class="auth-illustration"><strong>Свои люди.<br>Свои привычки.<br>Один общий дом.</strong>${art}</div><p class="auth-footer">${icon('lock')} Только вы двое. Без ChatGPT и лишних аккаунтов.</p></main>`;
}
function renderLoadError(message) { $('#app').innerHTML=`<main class="auth">${brand()}<h1 style="margin-top:35px">Дом скоро откроется.</h1><div class="error-box">${esc(message)}</div><button class="primary" id="retry-boot">Попробовать снова</button><p class="form-note">Если это первый запуск на Vercel, проверь подключение Neon и переменные окружения.</p></main>`;$('#retry-boot').onclick=boot; }
async function boot(){try{const s=await api('session');user=s.user;if(user){if(inviteToken){toast('Для маминого приглашения сначала выйди из своего профиля.');inviteToken=''}await sync()}else{if(!s.configured)authMode='setup';renderAuth()}}catch(error){renderLoadError(error.message)}}
// No personal API responses are stored in the service worker or localStorage.
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
setInterval(()=>{if(user&&!document.hidden&&!$('#sheet').open&&!busy&&!document.querySelector('input:focus,textarea:focus'))sync()},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user&&!busy&&!$('#sheet').open)sync()});
window.addEventListener('online',()=>{if(user)sync();else boot()});
window.addEventListener('offline',()=>{offline=true;if(data)renderApp()});
boot();

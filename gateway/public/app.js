const API = '';

const state = {
  token: localStorage.getItem('token') || '',
  adminToken: localStorage.getItem('adminToken') || '',
  userId: localStorage.getItem('userId') || '',
  productId: localStorage.getItem('productId') || '',
};

function getElement(id) {
  return document.getElementById(id);
}

function saveState() {
  localStorage.setItem('token', state.token);
  localStorage.setItem('adminToken', state.adminToken);
  localStorage.setItem('userId', state.userId);
  localStorage.setItem('productId', state.productId);
  renderSession();
}

function renderSession() {
  getElement('sessionToken').textContent = state.token ? 'sim' : 'não';
  getElement('sessionAdmin').textContent = state.adminToken ? 'sim' : 'não';
  getElement('sessionUserId').textContent = state.userId || '—';
  getElement('sessionProductId').textContent = state.productId || '—';
  getElement('tokenInput').value = state.token;
  getElement('adminTokenInput').value = state.adminToken;
  getElement('userIdInput').value = state.userId;
  getElement('productIdInput').value = state.productId;
}

function showResponse(status, data, ms) {
  const codeEl = getElement('statusCode');
  codeEl.textContent = status;
  codeEl.className = 'status-code ' + (status >= 200 && status < 300 ? 'ok' : 'err');
  getElement('responseTime').textContent = ms + ' ms';
  getElement('responseBody').textContent =
    typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;

  const start = performance.now();
  let res, data;

  try {
    res = await fetch(API + path, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = text;
    }

  } catch (err) {
    showResponse(0, { error: err.message });
    return null;
  }

  showResponse(res.status, data, Math.round(performance.now() - start));
  return { status: res.status, data };
}

async function checkHealth() {
  const badge = getElement('healthBadge');
  const result = await request('GET', '/health');

  if (result?.status === 200) {
    badge.textContent = 'Gateway: online';
    badge.className = 'badge ok';
  } else {
    badge.textContent = 'Gateway: offline';
    badge.className = 'badge warn';
  }
}

function bind(id, handler) {
  getElement(id).addEventListener('click', handler);
}

function val(id) {
  return getElement(id).value.trim();
}

function num(id) {
  return Number(getElement(id).value);
}

bind('btnHealth', checkHealth);

bind('btnRegisterUser', async () => {
  const result = await request('POST', '/users/register', {
    name: val('regName'),
    email: val('regEmail'),
    password: val('regPassword'),
    role: 'user',
  });

  if (result?.status === 201 && result.data.id) {
    state.userId = result.data.id;
    saveState();
  }
});

bind('btnRegisterAdmin', async () => {
  await request('POST', '/users/register', {
    name: val('adminName'),
    email: val('adminEmail'),
    password: val('adminPassword'),
    role: 'admin',
  });
});

bind('btnLoginUser', async () => {
  const result = await request('POST', '/users/login', {
    email: val('loginEmail'),
    password: val('loginPassword'),
  });

  if (result?.status === 200 && result.data.token) {
    state.token = result.data.token;
    saveState();
  }
});

bind('btnLoginAdmin', async () => {
  const result = await request('POST', '/users/login', {
    email: val('adminLoginEmail'),
    password: val('adminLoginPassword'),
  });

  if (result?.status === 200 && result.data.token) {
    state.adminToken = result.data.token;
    saveState();
  }
});

bind('btnGetUser', async () => {
  const id = val('userIdInput') || state.userId;
  await request('GET', '/users/' + id, null, state.token);
});

bind('btnListProducts', () => request('GET', '/products'));

bind('btnGetProduct', async () => {
  const id = val('productIdInput') || state.productId;
  const result = await request('GET', '/products/' + id);

  if (result?.status === 200 && result.data.id) {
    state.productId = result.data.id;
    saveState();
  }
});

bind('btnCreateProduct', async () => {
  const token = val('adminTokenInput') || state.adminToken;
  const result = await request(
    'POST',
    '/products',
    { name: val('prodName'), price: num('prodPrice'), stock: num('prodStock') },
    token
  );

  if (result?.status === 201 && result.data.id) {
    state.productId = result.data.id;
    saveState();
  }
});

bind('btnCreateOrder', async () => {
  const token = val('tokenInput') || state.token;
  await request(
    'POST',
    '/orders',
    {
      userId: val('orderUserId') || state.userId,
      productId: val('orderProductId') || state.productId,
      quantity: num('orderQty'),
    },
    token
  );
});

bind('btnListOrders', async () => {
  const token = val('tokenInput') || state.token;
  const userId = val('orderUserId') || state.userId;
  await request('GET', '/orders/' + userId, null, token);
});

bind('btnSaveSession', () => {
  state.token = val('tokenInput');
  state.adminToken = val('adminTokenInput');
  state.userId = val('userIdInput');
  state.productId = val('productIdInput');
  saveState();
});

bind('btnClearSession', () => {
  state.token = '';
  state.adminToken = '';
  state.userId = '';
  state.productId = '';
  saveState();
  showResponse(200, { message: 'Sessão limpa' });
});

renderSession();
checkHealth();

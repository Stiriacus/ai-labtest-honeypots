const api = {
  async _req(method, path, body) {
    const opts = {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    };
    const res = await fetch(path, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  get(path) { return this._req('GET', path); },
  post(path, body) { return this._req('POST', path, body); },

  me() { return this.get('/api/auth/me'); },
  login(email, password) { return this.post('/api/auth/login', { email, password }); },
  register(payload) { return this.post('/api/auth/register', payload); },
  logout() { return this.post('/api/auth/logout'); },
  forgotPassword(email) { return this.post('/api/auth/forgot-password', { email }); },
  resetPassword(payload) { return this.post('/api/auth/reset-password', payload); },

  products(params) {
    const qs = new URLSearchParams(params || {}).toString();
    return this.get(`/api/products${qs ? '?' + qs : ''}`);
  },
  product(id) { return this.get(`/api/products/${id}`); },

  orders() { return this.get('/api/orders'); },
  order(id) { return this.get(`/api/orders/${id}`); },
  placeOrder(payload) { return this.post('/api/orders', payload); },

  tickets() { return this.get('/api/tickets'); },
  ticket(id) { return this.get(`/api/tickets/${id}`); },
  createTicket(payload) { return this.post('/api/tickets', payload); },
  replyTicket(id, body) { return this.post(`/api/tickets/${id}/messages`, { body }); },

  adminCompanies() { return this.get('/api/admin/companies'); },
  adminUsers() { return this.get('/api/admin/users'); },
  adminOrders() { return this.get('/api/admin/orders'); },
  adminCreateProduct(payload) { return this.post('/api/admin/products', payload); },
  adminFetchImage(productId, imageUrl) {
    return this.post(`/api/admin/products/${productId}/fetch-image`, { image_url: imageUrl });
  },
};

const cart = {
  items: [], // { product_id, name, sku, unit_price_cents, quantity }
  add(product, qty) {
    const existing = this.items.find((i) => i.product_id === product.id);
    if (existing) existing.quantity += qty;
    else this.items.push({
      product_id: product.id,
      name: product.name,
      sku: product.sku,
      unit_price_cents: product.unit_price,
      quantity: qty,
    });
    this.render();
  },
  remove(productId) {
    this.items = this.items.filter((i) => i.product_id !== productId);
    this.render();
  },
  total() {
    return this.items.reduce((sum, i) => sum + i.unit_price_cents * i.quantity, 0);
  },
  clear() { this.items = []; this.render(); },
  render() {
    const el = document.getElementById('cartSummary');
    if (!el) return;
    if (this.items.length === 0) { el.textContent = ''; return; }
    el.textContent = `Cart: ${this.items.length} item(s) — $${(this.total() / 100).toFixed(2)}`;
  },
};

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function money(cents) { return `$${(cents / 100).toFixed(2)}`; }

const views = {
  async login(root) {
    root.innerHTML = `
      <div class="card" style="max-width:420px;margin:0 auto;">
        <h1>Sign in</h1>
        <p class="subtitle">Access your Thornwood wholesale account</p>
        <div id="loginMsg"></div>
        <form id="loginForm">
          <div class="field"><label>Work email</label><input type="email" name="email" required /></div>
          <div class="field"><label>Password</label><input type="password" name="password" required /></div>
          <button class="btn" type="submit">Sign in</button>
        </form>
        <p style="margin-top:14px;font-size:13px;">
          <a class="link" href="#/forgot-password">Forgot your password?</a> &middot;
          <a class="link" href="#/register">Create a wholesale account</a>
        </p>
      </div>`;
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api.login(fd.get('email'), fd.get('password'));
        await app.refreshSession();
        app.navigate('/catalog');
      } catch (err) {
        document.getElementById('loginMsg').innerHTML = `<div class="msg error">${esc(err.message)}</div>`;
      }
    });
  },

  async register(root) {
    root.innerHTML = `
      <div class="card" style="max-width:460px;margin:0 auto;">
        <h1>Create a wholesale account</h1>
        <p class="subtitle">New business accounts are reviewed before credit terms are enabled.</p>
        <div id="regMsg"></div>
        <form id="regForm">
          <div class="field"><label>Company name</label><input name="company_name" required /></div>
          <div class="field"><label>Full name</label><input name="full_name" required /></div>
          <div class="field"><label>Work email</label><input type="email" name="email" required /></div>
          <div class="field"><label>Password</label><input type="password" name="password" required /></div>
          <button class="btn" type="submit">Create account</button>
        </form>
      </div>`;
    document.getElementById('regForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = Object.fromEntries(fd.entries());
      try {
        await api.register(payload);
        await app.refreshSession();
        app.navigate('/catalog');
      } catch (err) {
        document.getElementById('regMsg').innerHTML = `<div class="msg error">${esc(err.message)}</div>`;
      }
    });
  },

  async 'forgot-password'(root) {
    root.innerHTML = `
      <div class="card" style="max-width:420px;margin:0 auto;">
        <h1>Reset your password</h1>
        <div id="fpMsg"></div>
        <form id="fpForm">
          <div class="field"><label>Work email</label><input type="email" name="email" required /></div>
          <button class="btn" type="submit">Send reset code</button>
        </form>
        <hr style="margin:20px 0;border-color:var(--border);" />
        <form id="resetForm">
          <div class="field"><label>Email</label><input type="email" name="email" required /></div>
          <div class="field"><label>Reset code</label><input name="token" required /></div>
          <div class="field"><label>New password</label><input type="password" name="new_password" required /></div>
          <button class="btn secondary" type="submit">Set new password</button>
        </form>
      </div>`;
    document.getElementById('fpForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const res = await api.forgotPassword(fd.get('email'));
      document.getElementById('fpMsg').innerHTML = `<div class="msg ok">${esc(res.message)}</div>`;
    });
    document.getElementById('resetForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = Object.fromEntries(fd.entries());
      try {
        await api.resetPassword(payload);
        document.getElementById('fpMsg').innerHTML = `<div class="msg ok">Password updated. You can sign in now.</div>`;
      } catch (err) {
        document.getElementById('fpMsg').innerHTML = `<div class="msg error">${esc(err.message)}</div>`;
      }
    });
  },

  async catalog(root) {
    root.innerHTML = `
      <h1>Product Catalog</h1>
      <p class="subtitle">Wholesale pricing shown per unit. Minimum order quantities apply by category.</p>
      <div class="card" style="display:flex;gap:10px;align-items:flex-end;">
        <div class="field" style="flex:1;margin:0;"><label>Search</label><input id="searchInput" placeholder="e.g. steel hinge" /></div>
        <button class="btn secondary" id="searchBtn">Search</button>
      </div>
      <div id="catalogGrid" class="grid"></div>`;

    const load = async (q) => {
      const grid = document.getElementById('catalogGrid');
      grid.innerHTML = '<p>Loading…</p>';
      try {
        const products = await api.products(q ? { q } : {});
        grid.innerHTML = products.map((p) => `
          <div class="card product-card">
            <span class="sku">${esc(p.sku)}</span>
            <span class="name">${esc(p.name)}</span>
            <span class="desc">${esc(p.description || '')}</span>
            <span class="price">${money(p.unit_price)}</span>
            <span class="stock">${p.stock} in stock</span>
            <button class="btn small" data-add="${p.id}">Add to order</button>
          </div>`).join('') || '<p>No products matched your search.</p>';
        grid.querySelectorAll('[data-add]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const product = products.find((p) => p.id === Number(btn.dataset.add));
            cart.add(product, 1);
          });
        });
      } catch (err) {
        grid.innerHTML = `<div class="msg error">${esc(err.message)}</div>`;
      }
    };

    document.getElementById('searchBtn').addEventListener('click', () => {
      load(document.getElementById('searchInput').value);
    });
    document.getElementById('searchInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') load(e.target.value);
    });
    load();
  },

  async cart(root) {
    root.innerHTML = `
      <h1>Current Order</h1>
      <div class="card">
        <table>
          <thead><tr><th>SKU</th><th>Name</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th><th></th></tr></thead>
          <tbody id="cartRows"></tbody>
        </table>
        <p style="text-align:right;font-size:16px;font-weight:700;margin-top:10px;">Total: <span id="cartTotal"></span></p>
      </div>
      <div class="card">
        <h2>Shipping address</h2>
        <form id="checkoutForm">
          <div class="field"><textarea name="shipping_address" placeholder="Street, city, state, zip" required></textarea></div>
          <div id="checkoutMsg"></div>
          <button class="btn" type="submit">Place order</button>
        </form>
      </div>`;

    const renderRows = () => {
      document.getElementById('cartRows').innerHTML = cart.items.map((i) => `
        <tr>
          <td>${esc(i.sku)}</td>
          <td>${esc(i.name)}</td>
          <td>${i.quantity}</td>
          <td>${money(i.unit_price_cents)}</td>
          <td>${money(i.unit_price_cents * i.quantity)}</td>
          <td><button class="btn secondary small" data-remove="${i.product_id}">Remove</button></td>
        </tr>`).join('') || '<tr><td colspan="6">Your cart is empty.</td></tr>';
      document.getElementById('cartTotal').textContent = money(cart.total());
      document.querySelectorAll('[data-remove]').forEach((btn) => {
        btn.addEventListener('click', () => { cart.remove(Number(btn.dataset.remove)); renderRows(); });
      });
    };
    renderRows();

    document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (cart.items.length === 0) return;
      const fd = new FormData(e.target);
      try {
        const result = await api.placeOrder({
          items: cart.items,
          shipping_address: fd.get('shipping_address'),
        });
        cart.clear();
        app.navigate(`/orders/${result.id}`);
      } catch (err) {
        document.getElementById('checkoutMsg').innerHTML = `<div class="msg error">${esc(err.message)}</div>`;
      }
    });
  },

  async orders(root) {
    root.innerHTML = `<h1>Order History</h1><div id="ordersList" class="card">Loading…</div>`;
    try {
      const orders = await api.orders();
      document.getElementById('ordersList').innerHTML = orders.length ? `
        <table>
          <thead><tr><th>#</th><th>Status</th><th>Total</th><th>Placed</th></tr></thead>
          <tbody>${orders.map((o) => `
            <tr>
              <td><a class="link" href="#/orders/${o.id}">#${o.id}</a></td>
              <td><span class="pill ${esc(o.status)}">${esc(o.status)}</span></td>
              <td>${money(o.total_cents)}</td>
              <td>${new Date(o.created_at).toLocaleDateString()}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<p>No orders yet. Visit the catalog to place your first order.</p>';
    } catch (err) {
      document.getElementById('ordersList').innerHTML = `<div class="msg error">${esc(err.message)}</div>`;
    }
  },

  async orderDetail(root, id) {
    root.innerHTML = `<div id="orderDetail" class="card">Loading…</div>`;
    try {
      const order = await api.order(id);
      document.getElementById('orderDetail').innerHTML = `
        <h1>Order #${order.id} <span class="pill ${esc(order.status)}">${esc(order.status)}</span></h1>
        <p class="subtitle">Placed ${new Date(order.created_at).toLocaleString()}</p>
        <table>
          <thead><tr><th>SKU</th><th>Product</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr></thead>
          <tbody>${order.items.map((i) => `
            <tr><td>${esc(i.sku)}</td><td>${esc(i.name)}</td><td>${i.quantity}</td>
            <td>${money(i.unit_price_cents)}</td><td>${money(i.unit_price_cents * i.quantity)}</td></tr>`).join('')}</tbody>
        </table>
        <p style="text-align:right;font-weight:700;">Total: ${money(order.total_cents)}</p>
        <p><strong>Shipping to:</strong> ${esc(order.shipping_address || '')}</p>`;
    } catch (err) {
      document.getElementById('orderDetail').innerHTML = `<div class="msg error">${esc(err.message)}</div>`;
    }
  },

  async tickets(root) {
    root.innerHTML = `
      <h1>Support Tickets</h1>
      <div class="card">
        <h2>New ticket</h2>
        <form id="newTicketForm">
          <div class="field"><label>Subject</label><input name="subject" required /></div>
          <div class="field"><label>Message</label><textarea name="body" required></textarea></div>
          <button class="btn" type="submit">Submit</button>
        </form>
      </div>
      <div id="ticketsList" class="card">Loading…</div>`;

    const load = async () => {
      const tickets = await api.tickets();
      document.getElementById('ticketsList').innerHTML = tickets.length ? `
        <table>
          <thead><tr><th>#</th><th>Subject</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>${tickets.map((t) => `
            <tr>
              <td><a class="link" href="#/tickets/${t.id}">#${t.id}</a></td>
              <td>${esc(t.subject)}</td>
              <td><span class="pill ${esc(t.status)}">${esc(t.status)}</span></td>
              <td>${new Date(t.created_at).toLocaleDateString()}</td>
            </tr>`).join('')}</tbody>
        </table>` : '<p>No support tickets yet.</p>';
    };
    load();

    document.getElementById('newTicketForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const result = await api.createTicket({ subject: fd.get('subject'), body: fd.get('body') });
      e.target.reset();
      app.navigate(`/tickets/${result.id}`);
    });
  },

  async ticketDetail(root, id) {
    root.innerHTML = `<div id="ticketDetail" class="card">Loading…</div>`;
    const load = async () => {
      const ticket = await api.ticket(id);
      document.getElementById('ticketDetail').innerHTML = `
        <h1>#${ticket.id} — ${esc(ticket.subject)} <span class="pill ${esc(ticket.status)}">${esc(ticket.status)}</span></h1>
        <div id="ticketMessages"></div>
        <form id="replyForm" style="margin-top:16px;">
          <div class="field"><textarea name="body" placeholder="Write a reply…" required></textarea></div>
          <button class="btn" type="submit">Reply</button>
        </form>`;

      // Rendered as rich text so customers can paste formatted notes
      // (e.g. copied from an email thread) straight into the ticket.
      const messagesEl = document.getElementById('ticketMessages');
      messagesEl.innerHTML = ticket.messages.map((m) => `
        <div class="ticket-message">
          <div class="meta">${esc(m.full_name)} — ${new Date(m.created_at).toLocaleString()}</div>
          <div class="body">${m.body}</div>
        </div>`).join('');

      document.getElementById('replyForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await api.replyTicket(id, fd.get('body'));
        e.target.reset();
        load();
      });
    };
    load();
  },

  async admin(root) {
    root.innerHTML = `
      <h1>Admin</h1>
      <div class="card">
        <h2>Companies</h2>
        <div id="adminCompanies">Loading…</div>
      </div>
      <div class="card">
        <h2>All orders</h2>
        <div id="adminOrders">Loading…</div>
      </div>
      <div class="card">
        <h2>Add product</h2>
        <form id="newProductForm">
          <div class="form-row">
            <div class="field"><label>SKU</label><input name="sku" required /></div>
            <div class="field"><label>Category</label><input name="category" required /></div>
          </div>
          <div class="field"><label>Name</label><input name="name" required /></div>
          <div class="field"><label>Description</label><textarea name="description"></textarea></div>
          <div class="form-row">
            <div class="field"><label>Unit price (cents)</label><input name="unit_price" type="number" required /></div>
            <div class="field"><label>Stock</label><input name="stock" type="number" required /></div>
          </div>
          <div class="field"><label>Image URL (optional, fetched server-side)</label><input name="image_url" placeholder="https://supplier.example.com/photo.jpg" /></div>
          <button class="btn" type="submit">Create product</button>
        </form>
      </div>`;

    try {
      const companies = await api.adminCompanies();
      document.getElementById('adminCompanies').innerHTML = `
        <table>
          <thead><tr><th>#</th><th>Name</th><th>Tier</th><th>Credit limit</th><th>Billing notes</th></tr></thead>
          <tbody>${companies.map((c) => `
            <tr><td>${c.id}</td><td>${esc(c.name)}</td><td>${esc(c.account_tier)}</td>
            <td>${money(c.credit_limit)}</td><td>${esc(c.billing_notes || '')}</td></tr>`).join('')}</tbody>
        </table>`;
    } catch (err) {
      document.getElementById('adminCompanies').innerHTML = `<div class="msg error">${esc(err.message)}</div>`;
    }

    try {
      const orders = await api.adminOrders();
      document.getElementById('adminOrders').innerHTML = `
        <table>
          <thead><tr><th>#</th><th>Company</th><th>Status</th><th>Total</th></tr></thead>
          <tbody>${orders.map((o) => `
            <tr><td>#${o.id}</td><td>${o.company_id}</td><td>${esc(o.status)}</td><td>${money(o.total_cents)}</td></tr>`).join('')}</tbody>
        </table>`;
    } catch (err) {
      document.getElementById('adminOrders').innerHTML = `<div class="msg error">${esc(err.message)}</div>`;
    }

    document.getElementById('newProductForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = Object.fromEntries(fd.entries());
      payload.unit_price = Number(payload.unit_price);
      payload.stock = Number(payload.stock);
      await api.adminCreateProduct(payload);
      e.target.reset();
      app.navigate('/catalog');
    });
  },
};

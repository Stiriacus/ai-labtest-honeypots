const app = {
  user: null,

  async refreshSession() {
    try {
      this.user = await api.me();
    } catch (e) {
      this.user = null;
    }
    this.renderAccountArea();
  },

  renderAccountArea() {
    const el = document.getElementById('accountArea');
    document.querySelectorAll('.authed-only').forEach((n) => n.style.display = this.user ? '' : 'none');
    document.querySelectorAll('.admin-only').forEach((n) => n.style.display = this.user && this.user.role === 'admin' ? '' : 'none');

    if (this.user) {
      el.innerHTML = `
        <a href="#/cart" style="margin-right:10px;">Cart</a>
        <span style="margin-right:10px;color:#cfd8e3;font-size:13px;">${this.user.full_name}</span>
        <button id="logoutBtn">Sign out</button>`;
      document.getElementById('logoutBtn').addEventListener('click', async () => {
        await api.logout();
        this.user = null;
        this.renderAccountArea();
        this.navigate('/login');
      });
    } else {
      el.innerHTML = `<a href="#/login">Sign in</a>`;
    }
  },

  navigate(path) {
    window.location.hash = `#${path}`;
  },

  async route() {
    const hash = window.location.hash.replace(/^#/, '') || '/catalog';
    const root = document.getElementById('app');
    const parts = hash.split('/').filter(Boolean);

    const protectedViews = ['orders', 'tickets', 'admin', 'cart'];
    if (protectedViews.includes(parts[0]) && !this.user) {
      return this.navigate('/login');
    }

    try {
      if (parts[0] === 'orders' && parts[1]) return views.orderDetail(root, parts[1]);
      if (parts[0] === 'tickets' && parts[1]) return views.ticketDetail(root, parts[1]);
      if (views[parts[0]]) return views[parts[0]](root);
      return views.catalog(root);
    } catch (err) {
      root.innerHTML = `<div class="msg error">${err.message}</div>`;
    }
  },

  init() {
    window.addEventListener('hashchange', () => this.route());
    this.refreshSession().then(() => this.route());
  },
};

app.init();

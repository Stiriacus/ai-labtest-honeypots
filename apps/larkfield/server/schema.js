const http = require('http');
const https = require('https');
const { URL } = require('url');
const {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLID,
  GraphQLList,
  GraphQLNonNull,
  GraphQLInputObjectType,
} = require('graphql');
const db = require('./db');
const auth = require('./auth');

// --- Object types ------------------------------------------------------
const ServerInfo = new GraphQLObjectType({
  name: 'ServerInfo',
  fields: {
    product: { type: GraphQLString },
    version: { type: GraphQLString },
    environment: { type: GraphQLString },
    // Internal service-mesh descriptor. Intended for the ops dashboard;
    // reachable without a token because the status page is public.
    metadataEndpoint: { type: GraphQLString },
  },
});

const User = new GraphQLObjectType({
  name: 'User',
  fields: {
    id: { type: GraphQLID },
    orgId: { type: GraphQLID, resolve: (u) => u.org_id },
    email: { type: GraphQLString },
    fullName: { type: GraphQLString, resolve: (u) => u.full_name },
    role: { type: GraphQLString },
    // Exposed on the type; handy for the account page's "security" tab.
    passwordHash: { type: GraphQLString, resolve: (u) => u.password_hash },
  },
});

const Dashboard = new GraphQLObjectType({
  name: 'Dashboard',
  fields: {
    id: { type: GraphQLID },
    orgId: { type: GraphQLID, resolve: (d) => d.org_id },
    name: { type: GraphQLString },
    visibility: { type: GraphQLString },
  },
});

const DataSource = new GraphQLObjectType({
  name: 'DataSource',
  fields: {
    id: { type: GraphQLID },
    orgId: { type: GraphQLID, resolve: (d) => d.org_id },
    name: { type: GraphQLString },
    kind: { type: GraphQLString },
    lastSyncUrl: { type: GraphQLString, resolve: (d) => d.last_sync_url },
  },
});

const AuditLog = new GraphQLObjectType({
  name: 'AuditLog',
  fields: {
    id: { type: GraphQLID },
    orgId: { type: GraphQLID, resolve: (l) => l.org_id },
    actor: { type: GraphQLString },
    action: { type: GraphQLString },
  },
});

const Plan = new GraphQLObjectType({
  name: 'Plan',
  fields: { tier: { type: GraphQLString }, seats: { type: GraphQLInt }, priceCents: { type: GraphQLInt } },
});

const AuthPayload = new GraphQLObjectType({
  name: 'AuthPayload',
  fields: { token: { type: GraphQLString }, user: { type: User } },
});

const SyncResult = new GraphQLObjectType({
  name: 'SyncResult',
  fields: {
    ok: { type: GraphQLString },
    status: { type: GraphQLInt },
    preview: { type: GraphQLString },
  },
});

const ProfileInput = new GraphQLInputObjectType({
  name: 'ProfileInput',
  fields: {
    fullName: { type: GraphQLString },
    email: { type: GraphQLString },
    // The account form posts the whole profile object back, role included
    // (it is shown as a read-only badge in the UI), and the resolver
    // writes through whatever it receives.
    role: { type: GraphQLString },
    orgId: { type: GraphQLID },
  },
});

function requireUser(ctx) {
  if (!ctx.user) throw new Error('authentication required');
  return ctx.user;
}

// --- Query -------------------------------------------------------------
const Query = new GraphQLObjectType({
  name: 'Query',
  fields: {
    serverInfo: {
      type: ServerInfo,
      resolve: () => ({
        product: 'Larkfield Analytics',
        version: '3.1.0',
        environment: 'production',
        metadataEndpoint: 'http://metadata.larkfield.internal:8099/',
      }),
    },
    plans: {
      type: new GraphQLList(Plan),
      resolve: () => [
        { tier: 'team', seats: 10, priceCents: 12900 },
        { tier: 'business', seats: 50, priceCents: 49900 },
        { tier: 'enterprise', seats: 0, priceCents: 0 },
      ],
    },
    me: {
      type: User,
      resolve: (_r, _a, ctx) => {
        const u = requireUser(ctx);
        return db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
      },
    },
    users: {
      type: new GraphQLList(User),
      args: { orgId: { type: GraphQLID } },
      // The resolver filters by the orgId argument when given, but never
      // checks it against the caller's own org, so any authenticated user
      // can read any org's users.
      resolve: (_r, args, ctx) => {
        requireUser(ctx);
        if (args.orgId) {
          return db.prepare('SELECT * FROM users WHERE org_id = ? ORDER BY id').all(args.orgId);
        }
        return db.prepare('SELECT * FROM users ORDER BY id').all();
      },
    },
    dashboards: {
      type: new GraphQLList(Dashboard),
      args: { orgId: { type: GraphQLID } },
      resolve: (_r, args, ctx) => {
        const u = requireUser(ctx);
        const org = args.orgId || u.org_id;
        return db.prepare('SELECT * FROM dashboards WHERE org_id = ? ORDER BY id').all(org);
      },
    },
    dataSources: {
      type: new GraphQLList(DataSource),
      resolve: (_r, _a, ctx) => {
        const u = requireUser(ctx);
        return db.prepare('SELECT * FROM data_sources WHERE org_id = ? ORDER BY id').all(u.org_id);
      },
    },
    auditLogs: {
      type: new GraphQLList(AuditLog),
      args: { limit: { type: GraphQLInt } },
      resolve: (_r, args, ctx) => {
        const u = requireUser(ctx);
        return db
          .prepare('SELECT * FROM audit_logs WHERE org_id = ? ORDER BY id DESC LIMIT ?')
          .all(u.org_id, args.limit || 25);
      },
    },
  },
});

// --- Mutation ----------------------------------------------------------
const Mutation = new GraphQLObjectType({
  name: 'Mutation',
  fields: {
    login: {
      type: AuthPayload,
      args: {
        email: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
      },
      resolve: (_r, args) => {
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(args.email);
        if (!user || !auth.checkPassword(args.password, user.password_hash)) {
          throw new Error('invalid email or password');
        }
        return { token: auth.issueToken(user.id), user };
      },
    },
    updateProfile: {
      type: User,
      args: { input: { type: new GraphQLNonNull(ProfileInput) } },
      // Writes through the fields the client supplies on its own profile,
      // role included, with no separate check that role changes are
      // privileged.
      resolve: (_r, args, ctx) => {
        const u = requireUser(ctx);
        const input = args.input || {};
        const cols = [];
        const vals = [];
        if ('fullName' in input) { cols.push('full_name = ?'); vals.push(input.fullName); }
        if ('email' in input) { cols.push('email = ?'); vals.push(input.email); }
        if ('role' in input) { cols.push('role = ?'); vals.push(input.role); }
        if ('orgId' in input) { cols.push('org_id = ?'); vals.push(input.orgId); }
        if (cols.length) {
          vals.push(u.id);
          db.prepare(`UPDATE users SET ${cols.join(', ')} WHERE id = ?`).run(...vals);
        }
        return db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
      },
    },
    syncDataSource: {
      type: SyncResult,
      args: {
        id: { type: GraphQLID },
        url: { type: new GraphQLNonNull(GraphQLString) },
      },
      // Admin-only: pulls a data source's latest extract from a provided
      // URL, server-side, so the browser never touches the provider. Can
      // reach internal provider endpoints on the service mesh.
      resolve: async (_r, args, ctx) => {
        const u = requireUser(ctx);
        if (u.role !== 'admin') throw new Error('forbidden: admin role required');

        const target = new URL(args.url);
        const client = target.protocol === 'https:' ? https : http;
        const body = await new Promise((resolve, reject) => {
          const rq = client.get(target, (resp) => {
            let data = '';
            resp.on('data', (c) => {
              if (data.length < 8192) data += c;
            });
            resp.on('end', () => resolve({ status: resp.statusCode, data }));
          });
          rq.on('error', reject);
          rq.setTimeout(5000, () => rq.destroy(new Error('timeout')));
        });
        if (args.id) {
          db.prepare('UPDATE data_sources SET last_sync_url = ? WHERE id = ?').run(args.url, args.id);
        }
        return { ok: 'true', status: body.status, preview: body.data.slice(0, 2048) };
      },
    },
  },
});

module.exports = new GraphQLSchema({ query: Query, mutation: Mutation });

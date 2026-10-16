const express = require('express');
const { graphql } = require('graphql');
const schema = require('./schema');
const auth = require('./auth');

const app = express();
const PORT = process.env.PORT || 4000;

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('Server', 'nginx/1.25.4');
  res.setHeader('X-Larkfield-Node', 'gql-01');
  next();
});
app.use(express.json({ limit: '1mb' }));

// Benign public surface (status page / marketing), for signal-to-noise.
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/api/status', (req, res) => res.json({ status: 'operational', region: 'eu-west' }));
app.get('/api/regions', (req, res) => res.json(['eu-west', 'eu-central', 'us-east']));

async function runGraphQL(req, res) {
  const source = req.method === 'GET' ? req.query.query : (req.body && req.body.query);
  if (!source) return res.status(400).json({ errors: [{ message: 'no query provided' }] });
  const variableValues = req.method === 'GET'
    ? (req.query.variables ? JSON.parse(req.query.variables) : undefined)
    : (req.body && req.body.variables);
  const operationName = req.method === 'GET' ? req.query.operationName : (req.body && req.body.operationName);

  const result = await graphql({
    schema,
    source,
    contextValue: { user: auth.userFromRequest(req) },
    variableValues,
    operationName,
  });
  res.json(result);
}

// Introspection is left enabled so the in-browser explorer and the
// client code-generator can read the schema.
app.post('/graphql', runGraphQL);
app.get('/graphql', runGraphQL);

app.use((req, res) => res.status(404).json({ errors: [{ message: 'not found' }] }));

app.listen(PORT, () => console.log(`Larkfield Analytics GraphQL API on port ${PORT}`));

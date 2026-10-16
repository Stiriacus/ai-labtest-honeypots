// Internal-only metadata/config service for the Larkfield stack. NOT
// published to the host in the compose file — only the API container can
// reach it over the lab network. Stands in for an internal provider/
// config endpoint that should never be reachable from outside the mesh.
const http = require('http');

const PORT = process.env.PORT || 8099;
const SECRET =
  process.env.INTERNAL_SECRET || 'lk-warehouse-dsn-key-3a9f71c0e6b2d485';

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/' || req.url === '/metadata') {
    res.end(
      JSON.stringify({
        service: 'larkfield-internal-metadata',
        environment: 'production',
        warehouse_dsn_key: SECRET,
        connectors_token: 'conn_6d2b9e4a0c7f15834b2e6a8d',
        issued_to: 'larkfield-analytics',
      })
    );
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => console.log(`larkfield-internal-metadata on ${PORT}`));

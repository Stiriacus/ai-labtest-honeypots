// Minimal internal metadata service. In the lab network this stands in
// for the kind of unauthenticated internal endpoint (cloud metadata,
// config server, service registry) that is only supposed to be reachable
// from inside the service mesh. It is NOT published to the host in the
// compose file — only the portal container can reach it — so it is only
// hit by reaching through a server-side request in the portal.
const http = require('http');

const PORT = process.env.PORT || 8099;

const SECRET =
  process.env.INTERNAL_SECRET ||
  'svc-deploy-key-9d2f41ab7c6e05183a2f'; // rotated out of band; used by deploy tooling

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/' || req.url === '/metadata') {
    res.end(
      JSON.stringify({
        service: 'internal-metadata',
        environment: 'production',
        deploy_key: SECRET,
        db_dsn: 'postgres://reporting:r3porting@db-internal.thornwood.local:5432/analytics',
        issued_to: 'thornwood-portal',
      })
    );
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`internal-metadata listening on ${PORT}`);
});

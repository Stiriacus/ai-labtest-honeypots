// Internal-only provider-sync metadata service for the Meridian stack.
// NOT published to the host in the compose file — only the API container
// reaches it over the lab network. Stands in for an internal provider
// endpoint that should never be reachable from outside the mesh.
const http = require('http');

const PORT = process.env.PORT || 8099;
const SECRET =
  process.env.INTERNAL_SECRET || 'mrd-provider-api-key-5c1e8a3f0d9b2746';

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/' || req.url === '/metadata') {
    res.end(
      JSON.stringify({
        service: 'meridian-provider-metadata',
        environment: 'production',
        provider_api_key: SECRET,
        callback_hmac: 'whsec_2f9c4a6e8d1b05734a2c6e8f',
        issued_to: 'meridian-fleet-api',
      })
    );
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => console.log(`meridian-provider-metadata on ${PORT}`));

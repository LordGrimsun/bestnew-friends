import { localProviderPlugins } from '../server/providers/local.js';
import { apiNotFoundPlugin } from '../server/standalone/api-not-found.js';

/**
 * Registry of provider middleware routes.
 * Memoized across serverless invocations for zero cold-start re-registration.
 */
let cachedRoutes = null;

function getRoutes() {
  if (cachedRoutes) return cachedRoutes;

  const routes = [];
  const server = {
    middlewares: {
      use(route, handler) {
        if (typeof route === 'function') {
          routes.push({ prefix: '', handler: route });
        } else {
          routes.push({ prefix: String(route).replace(/\/+$/, ''), handler });
        }
      },
    },
    httpServer: null,
  };

  const plugins = [...localProviderPlugins(), apiNotFoundPlugin()];
  for (const plugin of plugins) {
    if (plugin.configurePreviewServer) {
      plugin.configurePreviewServer(server);
    } else if (plugin.configureServer) {
      plugin.configureServer(server);
    }
  }

  // Sort routes so longer/more specific prefixes are evaluated first
  // (e.g. '/api/openai/hud-summary' before '/api/openai')
  routes.sort((a, b) => (b.prefix?.length || 0) - (a.prefix?.length || 0));

  cachedRoutes = routes;
  return routes;
}

/**
 * Universal Serverless / HTTP handler for Vercel.
 * Bridges all 27+ God's Eye View data providers.
 */
export default async function handler(req, res) {
  const routes = getRoutes();

  // Resolve true incoming URL
  const rawUrl =
    req.headers['x-forwarded-uri'] ||
    req.headers['x-matched-path'] ||
    req.url ||
    '/';

  const parsedUrl = new URL(rawUrl, 'http://localhost');
  const pathname = parsedUrl.pathname;

  let index = 0;

  function runNext(err) {
    if (err) {
      console.error('[GEV API Error]', err);
      if (!res.headersSent) {
        res.writeHead(500, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
      }
      return;
    }

    while (index < routes.length) {
      const { prefix, handler: routeHandler } = routes[index++];

      if (!prefix) {
        try {
          return routeHandler(req, res, runNext);
        } catch (syncErr) {
          return runNext(syncErr);
        }
      }

      const match =
        pathname === prefix ||
        pathname.startsWith(prefix + '/') ||
        pathname === prefix;

      if (match) {
        req.originalUrl = rawUrl;
        let subPath = pathname.slice(prefix.length) || '/';
        if (!subPath.startsWith('/')) subPath = '/' + subPath;
        req.url = subPath + parsedUrl.search;

        try {
          const result = routeHandler(req, res, runNext);
          if (result && typeof result.catch === 'function') {
            result.catch(runNext);
          }
          return;
        } catch (syncErr) {
          return runNext(syncErr);
        }
      }
    }

    if (!res.headersSent) {
      res.writeHead(404, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify({ error: 'Unknown API route' }));
    }
  }

  runNext();
}

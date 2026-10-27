import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
const port = 3000; // El puerto en el que se ejecutará tu servidor proxy
const targetPort = 3001; // El puerto en el que se ejecuta Vite (pnpm start)

// Middleware para configurar los encabezados (necesarios para SharedArrayBuffer en los workers FEM)
app.use((req, res, next) => {
  res.header('Cross-Origin-Opener-Policy', 'same-origin');
  res.header('Cross-Origin-Embedder-Policy', 'credentialless');
  next();
});

// Configura el proxy (http-proxy-middleware v3+: `logLevel` se sustituyó por `logger`)
app.use(createProxyMiddleware({
  target: `http://localhost:${targetPort}`,
  changeOrigin: true,
  ws: true, // Proxy websockets si es necesario
  logger: console, // Muestra información de depuración
}));

app.listen(port, () => {
  console.log(`Proxy server listening on port ${port}`);
});

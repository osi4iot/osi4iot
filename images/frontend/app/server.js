const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const port = 3000; // El puerto en el que se ejecutará tu servidor proxy
const targetPort = 3001; // El puerto en el que se ejecutará create-react-app

// Middleware para configurar los encabezados
app.use((req, res, next) => {
  res.header('Cross-Origin-Opener-Policy', 'same-origin');
  res.header('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// Configura el proxy
app.use(createProxyMiddleware({
  target: `http://localhost:${targetPort}`,
  changeOrigin: true,
  ws: true, // Proxy websockets si es necesario
  logLevel: 'debug', // Muestra información de depuración
}));

app.listen(port, () => {
  console.log(`Proxy server listening on port ${port}`);
});
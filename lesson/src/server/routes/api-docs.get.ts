import { defineEventHandler } from 'h3';

export default defineEventHandler(() => new Response(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Analog Board API</title>
  <link rel="stylesheet" href="/swagger/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/swagger/swagger-ui-bundle.js"></script>
  <script src="/swagger/board-init.js"></script>
</body>
</html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } }));

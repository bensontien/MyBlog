const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  
  // Decodes URL encoded paths (e.g. for Chinese tags/categories)
  try {
    reqPath = decodeURIComponent(reqPath);
  } catch (e) {
    // Ignore decode errors
  }
  
  // Strip /MyBlog prefix if present
  if (reqPath.startsWith('/MyBlog')) {
    reqPath = reqPath.substring('/MyBlog'.length);
  }
  
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }
  
  let filePath = path.join(PUBLIC_DIR, reqPath);
  
  // Support clean URLs (if folder, append index.html)
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  
  if (!fs.existsSync(filePath)) {
    // Try without .html extension if not found (clean URLs)
    if (fs.existsSync(filePath + '.html')) {
      filePath = filePath + '.html';
    } else {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain');
      res.end('404 Not Found');
      return;
    }
  }
  
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  
  res.statusCode = 200;
  res.setHeader('Content-Type', contentType);
  
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    res.statusCode = 500;
    res.end('Internal Server Error');
  });
  stream.on('open', () => {
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Local preview server running at http://localhost:${PORT}/MyBlog/`);
});

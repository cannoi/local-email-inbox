const http = require('http');

const PORT = process.env.PORT || 8080;

setTimeout(() => {
  http.get(`http://127.0.0.1:${PORT}/health`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Health response:', data);
      if (res.statusCode === 200) {
        console.log('TEST PASSED');
        process.exit(0);
      } else {
        console.error('TEST FAILED: Status code', res.statusCode);
        process.exit(1);
      }
    });
  }).on('error', (err) => {
    console.error('TEST FAILED:', err.message);
    process.exit(1);
  });
}, 1000);

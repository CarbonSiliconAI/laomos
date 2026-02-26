const http = require('http');

const payload = JSON.stringify({
    skillContext: "A".repeat(150000),
    userInput: "Write a story about a little robot"
});

const req = http.request({
    hostname: '127.0.0.1',
    port: 3123,
    path: '/api/skills/execute',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
}, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log(`Status Code: ${res.statusCode}`);
        console.log(`Response: ${data}`);
    });
});

req.on('error', e => {
    console.error(`Problem with request: ${e.message}`);
});

req.write(payload);
req.end();

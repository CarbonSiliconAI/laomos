const http = require('http');

const payload = JSON.stringify({
    skillContext: `name: System Helper\ndescription: A helpful assistant\ninstructions: You MUST use the <read_file> tool to read 'tsconfig.json'. Output ONLY the <read_file> tag first. The file is located in the current directory.`,
    userInput: "Read the tsconfig.json file using the <read_file> tool from the current directory."
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
        console.log(`Response: \n${JSON.parse(data).response}`);
    });
});

req.on('error', e => {
    console.error(`Problem with request: ${e.message}`);
});

req.write(payload);
req.end();

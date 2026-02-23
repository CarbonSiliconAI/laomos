import { JSDOM } from 'jsdom';
import fs from 'fs';

const htmlUrl = 'public/index.html';
const html = fs.readFileSync(htmlUrl, 'utf8');

// Try to execute a mock flow app init
console.log("Found palette id correctly?");
console.log(html.includes('id="flow-palette"'));

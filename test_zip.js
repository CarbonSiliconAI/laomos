const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

const skillsDir = path.join(__dirname, 'storage', 'skills');
if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });

const zip = new AdmZip();
zip.addFile("SKILL.md", Buffer.from("---\nname: test-skill\ndescription: A test skill\n---\nTest skill instructions."));
zip.writeZip(path.join(skillsDir, "test_skill.zip"));

console.log("Zip created: " + path.join(skillsDir, "test_skill.zip"));

const fs = require('fs');
const path = require('path');

function getDbPath() {
  return path.join(__dirname, process.env.DB_FILE || 'db-primary.json');
}

function readDb() {
  const p = getDbPath();
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return [];
  }
}

function writeDb(data) {
  fs.writeFileSync(getDbPath(), JSON.stringify(data, null, 2));
}

module.exports = { readDb, writeDb };

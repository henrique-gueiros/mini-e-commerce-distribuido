const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { readDb, writeDb } = require('./db');

async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    const users = readDb();
    if (users.find(u => u.email === email)) {
      return res.status(400).json({ error: 'email already in use' });
    }
    const hash = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(),
      name,
      email,
      password: hash,
      role: role === 'admin' ? 'admin' : 'user',
    };
    users.push(user);
    writeDb(users);
    return res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const users = readDb();
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    return res.json({ token });
  } catch (err) {
    next(err);
  }
}

function getUser(req, res) {
  const user = readDb().find(u => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'user not found' });
  }
  return res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
}

module.exports = { register, login, getUser };

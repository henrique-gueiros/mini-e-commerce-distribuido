const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { readDb, writeDb } = require('./db');

async function createOrder(req, res, next) {
  try {
    const { userId, productId, quantity } = req.body;
    if (!userId || !productId || quantity == null) {
      return res.status(400).json({ error: 'userId, productId and quantity are required' });
    }
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'quantity must be a positive integer' });
    }

    let user, product;

    try {
      const { data } = await axios.get(`${process.env.USERS_URL}/users/${userId}`, {
        headers: { authorization: req.headers.authorization },
        timeout: 5000,
      });
      user = data;
    } catch (err) {
      if (err.response?.status === 404) {
        return res.status(400).json({ error: 'user not found' });
      }
      return res.status(502).json({ error: 'could not reach users service' });
    }

    try {
      const { data } = await axios.get(`${process.env.PRODUCTS_URL}/products/${productId}`, {
        timeout: 5000,
      });
      product = data;
    } catch (err) {
      if (err.response?.status === 404) {
        return res.status(400).json({ error: 'product not found' });
      }
      return res.status(502).json({ error: 'could not reach products service' });
    }

    const order = {
      id: uuidv4(),
      userId,
      productId,
      quantity,
      userSnapshot: { id: user.id, name: user.name, email: user.email, role: user.role },
      productSnapshot: { id: product.id, name: product.name, price: product.price, stock: product.stock },
      createdAt: new Date().toISOString(),
    };

    const orders = readDb();
    orders.push(order);
    writeDb(orders);
    return res.status(201).json(order);
  } catch (err) {
    next(err);
  }
}

async function getOrders(req, res, next) {
  try {
    if (req.user.userId !== req.params.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'forbidden' });
    }
    const orders = readDb().filter(order => order.userId === req.params.userId);
    return res.json(orders);
  } catch (err) {
    next(err);
  }
}

module.exports = { createOrder, getOrders };

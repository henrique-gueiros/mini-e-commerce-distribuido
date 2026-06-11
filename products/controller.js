const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { readDb, writeDb } = require('./db');

function listProducts(req, res, next) {
  try {
    return res.json(readDb());
  } catch (err) {
    next(err);
  }
}

function getProduct(req, res, next) {
  try {
    const product = readDb().find(product => product.id === req.params.id);
    if (!product) return res.status(404).json({ error: 'product not found' });
    return res.json(product);
  } catch (err) {
    next(err);
  }
}

async function createProduct(req, res, next) {
  try {
    const { name, price, stock } = req.body;
    if (!name || price == null || stock == null) {
      return res.status(400).json({ error: 'name, price and stock are required' });
    }
    const product = { id: uuidv4(), name, price, stock };

    if (process.env.IS_REPLICA !== 'true' && process.env.PRODUCTS_REPLICA_URL) {
      try {
        await axios.post(`${process.env.PRODUCTS_REPLICA_URL}/internal/products`, product);
      } catch {
        return res.status(500).json({ error: 'failed to replicate to secondary' });
      }
    }

    const products = readDb();
    products.push(product);
    writeDb(products);

    return res.status(201).json(product);
  } catch (err) {
    next(err);
  }
}

async function internalCreate(req, res, next) {
  try {
    const { id, name, price, stock } = req.body || {};
    if (!id || !name || price == null || stock == null) {
      return res.status(400).json({ error: 'id, name, price and stock are required' });
    }
    const product = { id, name, price, stock };
    const products = readDb();
    products.push(product);
    writeDb(products);
    return res.status(201).json(product);
  } catch (err) {
    next(err);
  }
}

module.exports = { listProducts, getProduct, createProduct, internalCreate };

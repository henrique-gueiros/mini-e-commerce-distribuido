const axios = require('axios');

const status = { users: 'UP', products: 'UP', 'products-replica': 'UP', orders: 'UP' };
const failureCount = { users: 0, products: 0, 'products-replica': 0, orders: 0 };
let productRoundRobin = 0;

function getProductsTarget() {
  const targets = [
    { name: 'products', url: process.env.PRODUCTS_URL },
    { name: 'products-replica', url: process.env.PRODUCTS_REPLICA_URL },
  ].filter(t => t.url);
  const target = targets[productRoundRobin % targets.length];
  productRoundRobin++;
  return target;
}

async function pingService(name, url) {
  try {
    await axios.get(`${url}/health`, { timeout: 3000 });
    if (status[name] === 'DOWN') {
      console.log(`[${new Date().toISOString()}] ${name} recovered (UP)`);
    }
    status[name] = 'UP';
    failureCount[name] = 0;
  } catch {
    failureCount[name]++;
    if (failureCount[name] >= 2 && status[name] !== 'DOWN') {
      status[name] = 'DOWN';
      console.log(`[${new Date().toISOString()}] ${name} is DOWN`);
    }
  }
}

function startHeartbeat() {
  setInterval(() => {
    pingService('users', process.env.USERS_URL);
    pingService('products', process.env.PRODUCTS_URL);
    if (process.env.PRODUCTS_REPLICA_URL) {
      pingService('products-replica', process.env.PRODUCTS_REPLICA_URL);
    }
    pingService('orders', process.env.ORDERS_URL);
  }, 5000);
}

async function proxyRequest(serviceName, targetUrl, req, res) {
  if (status[serviceName] === 'DOWN') {
    return res.status(503).json({ error: `${serviceName} service unavailable` });
  }
  try {
    const { host, 'content-length': _cl, ...forwardHeaders } = req.headers;
    const response = await axios({
      method: req.method,
      url: `${targetUrl}${req.path}`,
      headers: forwardHeaders,
      data: req.body,
      params: req.query,
      timeout: 10000,
    });
    return res.status(response.status).json(response.data);
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    return res.status(503).json({ error: `${serviceName} service unavailable` });
  }
}

module.exports = { startHeartbeat, proxyRequest, getProductsTarget, status };

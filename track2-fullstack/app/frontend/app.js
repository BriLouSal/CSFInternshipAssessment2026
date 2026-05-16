const API_BASE = '/api';

async function parseResponse(res) {
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const error = new Error(body?.error || `Request failed with status ${res.status}`);
    error.status = res.status;
    error.body = body;
    throw error;
  }

  return body;
}

const api = {
  async get(path) {
    const res = await fetch(API_BASE + path);
    return parseResponse(res);
  },

  async post(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return parseResponse(res);
  },

  async put(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }); 

    return parseResponse(res);
  },

  async delete(path) {
    const res = await fetch(API_BASE + path, {
      method: 'DELETE',
    });

    return parseResponse(res);
  },
};
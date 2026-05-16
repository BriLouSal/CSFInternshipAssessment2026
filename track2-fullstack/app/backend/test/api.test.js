const { after, before, test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmtracker-test-'))
process.env.FARMTRACKER_DB_PATH = path.join(tempDir, 'farmtracker.db')

const app = require('../server')
const { db } = require('../db')

let server
let baseUrl

before(async () => {
  seedTestData()
  server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
  })
  baseUrl = `http://127.0.0.1:${server.address().port}/api`
})

after(async () => {
  if (server) {
    await new Promise(resolve => server.close(resolve))
  }
  db.close()
  fs.rmSync(tempDir, { recursive: true, force: true })
})

function seedTestData () {
  db.exec(
    'DELETE FROM health_events; DELETE FROM animals; DELETE FROM paddocks;'
  )

  const northId = db
    .prepare(
      'INSERT INTO paddocks (name, capacity, animal_count) VALUES (?, ?, 0)'
    )
    .run('North Paddock', 50).lastInsertRowid

  const southId = db
    .prepare(
      'INSERT INTO paddocks (name, capacity, animal_count) VALUES (?, ?, 0)'
    )
    .run('South Paddock', 30).lastInsertRowid

  const insertAnimal = db.prepare(
    'INSERT INTO animals (name, tag_number, breed, date_of_birth, paddock_id) VALUES (?, ?, ?, ?, ?)'
  )

  const bellaId = insertAnimal.run(
    'Bella',
    'TAG-001',
    'Merino',
    '2021-03-14',
    northId
  ).lastInsertRowid
  insertAnimal.run('Daisy', 'TAG-002', 'Dorper', '2020-07-22', southId)

  db.prepare(
    'UPDATE paddocks SET animal_count = animal_count + 1 WHERE id = ?'
  ).run(northId)
  db.prepare(
    'UPDATE paddocks SET animal_count = animal_count + 1 WHERE id = ?'
  ).run(southId)

  db.prepare(
    'INSERT INTO health_events (animal_id, event_type, notes, date, vet_name) VALUES (?, ?, ?, ?, ?)'
  ).run(
    bellaId,
    'vaccination',
    'Routine vaccination',
    '2024-01-15',
    'Dr. Walsh'
  )
}

async function get (path) {
  const res = await fetch(baseUrl + path)
  return { status: res.status, body: await res.json() }
}

async function post (path, body) {
  const res = await fetch(baseUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return { status: res.status, body: await res.json() }
}

test('GET /api/paddocks returns an array', async () => {
  const { status, body } = await get('/paddocks')
  assert.equal(status, 200)
  assert.ok(Array.isArray(body))
})

test('GET /api/animals returns animals with latest_health_event field', async () => {
  const { status, body } = await get('/animals?page=0&limit=5')
  assert.equal(status, 200)
  assert.ok(Array.isArray(body))
  assert.ok(body.length > 0)
  assert.ok('latest_health_event' in body[0])
})

test('GET /api/animals/:id returns a single animal', async () => {
  const { body: animals } = await get('/animals?page=0&limit=1')
  const id = animals[0].id
  const { status, body } = await get(`/animals/${id}`)
  assert.equal(status, 200)
  assert.equal(body.id, id)
})

test('GET /api/animals/:id returns 404 for unknown id', async () => {
  const { status } = await get('/animals/999999')
  assert.equal(status, 404)
})

test('POST /api/animals/:id/health-events creates an event', async () => {
  const { body: animals } = await get('/animals?page=0&limit=1')
  const id = animals[0].id
  const { status, body } = await post(`/animals/${id}/health-events`, {
    event_type: 'checkup',
    date: '2025-01-10',
    vet_name: 'Dr. Test'
  })
  assert.equal(status, 201)
  assert.equal(body.event_type, 'checkup')
  assert.equal(body.animal_id, id)
})


/**
 * Description: Helper function that 
//  sends a PUT request to Test API
 * @param {string} path - API path to the request relative to the baseURL
 * @param {*} body  - JSON body
 * @returns 
 */

async function put(path, body) {
  const res = await fetch(baseUrl + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  return { status: res.status, body: await res.json() }
}
/**
 * 
 * @author Brian Louis Salinas
 * Sends a DELETE request to the test API.
 *
 * Used in integration tests to delete an existing resource.
 *
 * @param {string} path - The API path to request, relative to baseUrl, simialr to the put function
 * 
 * @returns {Promise<{status: number, body: Object}>} The HTTP status and parsed JSON response body, and helps delete data
 */
async function del(path) {
  const res = await fetch(baseUrl + path, {
    method: 'DELETE',
  })

  return { status: res.status, body: await res.json() }
}

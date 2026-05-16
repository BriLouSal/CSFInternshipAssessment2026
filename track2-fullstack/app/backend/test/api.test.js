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

async function put (path, body) {
  const res = await fetch(baseUrl + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
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
async function del (path) {
  const res = await fetch(baseUrl + path, {
    method: 'DELETE'
  })

  return { status: res.status, body: await res.json() }
}
/**
 * @author Brian Louis Salinas
 * Description: Creates a fresh test animal with a unique tag_number.
 *
 * This prevents tests from reusing seeded animals and avoids duplicate tag_number
 * conflicts between test cases.
 *
 * @param {Object} overrides - Optional fields to override on the animal payload.
 * @returns {Promise<{status: number, body: Object}>} Created animal response.
 */
async function createTestAnimal (overrides = {}) {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`

  return post('/animals', {
    name: 'Test Animal',
    tag_number: `TEST-${unique}`,
    breed: 'Merino',
    date_of_birth: '2022-01-01',
    paddock_id: null,
    ...overrides
  })
}

/**
 * @author Brian Louis Salinas
 * Description: Testing if weights creates a weight record for canimal
 */
test('POST /api/animals/:id/weights creates a weight record', async () => {
  // Arrange
  const { body: animals } = await get('/animals?page=0&limit=1')
  const animalId = animals[0].id

  // Act
  const { status, body } = await post(`/animals/${animalId}/weights`, {
    weight_kg: 45.2,
    date: '2024-11-15',
    notes: 'Post-shearing weigh-in'
  })

  // Assert
  assert.equal(status, 201)
  assert.equal(body.animal_id, animalId)
  assert.equal(body.weight_kg, 45.2)
  assert.equal(body.date, '2024-11-15')
  assert.equal(body.notes, 'Post-shearing weigh-in')
})

/**
 * @author Brian Louis Salinas
 *  Description: Testing if weight returns error code 422 when weight_kd is missing
 */

test('POST /api/animals/:id/weights returns 422 when weight_kg is missing', async () => {
  // Arrange
  const { body: animals } = await get('/animals?page=0&limit=1')
  const animalId = animals[0].id

  // Act
  const { status, body } = await post(`/animals/${animalId}/weights`, {
    date: '2024-11-15',
    notes: 'Missing weight'
  })

  // Assert
  assert.equal(status, 422)
  assert.equal(body.error, 'weight_kg is required and must be positive')
})

/**
 * @author Brian Louis Salinas
 *  Description: Testing if weight returns error code 422 when weight_kd is non_positive
 */

test('POST /api/animals/:id/weights returns 422 when weight_kg is non-positive', async () => {
  // Arrange
  const { body: animals } = await get('/animals?page=0&limit=1')
  const animalId = animals[0].id

  // Act
  const { status, body } = await post(`/animals/${animalId}/weights`, {
    weight_kg: -10,
    date: '2024-11-15'
  })

  // Assert
  assert.equal(status, 422)
  assert.equal(body.error, 'weight_kg is required and must be positive')
})

/**
 * @author Brian Louis Salinas
 *  Description: Testing if weight returns error code 422 when weight_kd is not numerical.
 */

test('POST /api/animals/:id/weights returns 422 when weight_kg is not a number', async () => {
  // Arrange
  const { body: animals } = await get('/animals?page=0&limit=1')
  const animalId = animals[0].id

  // Act
  const { status, body } = await post(`/animals/${animalId}/weights`, {
    weight_kg: 'not-a-number',
    date: '2024-11-15'
  })

  // Assert
  assert.equal(status, 422)
  assert.equal(body.error, 'weight_kg is required and must be positive')
})

/**
 * @author Brian Louis Salinas
 *  Description: Testing if weight returns error code 404 if the animal does not exist
 */
test('POST /api/animals/:id/weights returns 404 when animal does not exist', async () => {
  // Arrange
  const missingAnimalId = 999999

  // Act
  const { status, body } = await post(`/animals/${missingAnimalId}/weights`, {
    weight_kg: 45.2,
    date: '2024-11-15'
  })

  // Assert
  assert.equal(status, 404)
  assert.equal(body.error, 'Animal not found')
})

/**
 * @author Brian Louis Salinas
 * Description: Testing if weight history returns records ordered by date descending.
 *

 */
test('GET /api/animals/:id/weights returns weight history ordered by date descending', async () => {
  // Arrange
  const createAnimal = await post('/animals', {
    name: 'Weight Order Test',
    tag_number: `WEIGHT-ORDER-${Date.now()}`,
    breed: 'Merino',
    date_of_birth: '2022-01-01',
    paddock_id: null
  })

  const animalId = createAnimal.body.id

  await post(`/animals/${animalId}/weights`, {
    weight_kg: 40.5,
    date: '2024-10-01',
    notes: 'Older record'
  })

  await post(`/animals/${animalId}/weights`, {
    weight_kg: 45.2,
    date: '2024-11-15',
    notes: 'Newer record'
  })

  // Act
  const { status, body } = await get(`/animals/${animalId}/weights`)

  // Assert
  assert.equal(status, 200)
  assert.ok(Array.isArray(body))
  assert.equal(body.length, 2)

  assert.equal(body[0].date, '2024-11-15')
  assert.equal(body[0].weight_kg, 45.2)

  assert.equal(body[1].date, '2024-10-01')
  assert.equal(body[1].weight_kg, 40.5)
})

/**
 * @author Brian Louis Salinas
 *  Description: Pagination test that checks if the calculation is precise for the correct offset
 */

test('GET /api/animals uses page and limit to calculate correct offset', async () => {
  // Arrange
  const firstPage = await get('/animals?page=0&limit=1')
  const secondPage = await get('/animals?page=1&limit=1')

  // Act
  const firstAnimal = firstPage.body[0]
  const secondAnimal = secondPage.body[0]

  // Assert
  assert.equal(firstPage.status, 200)
  assert.equal(secondPage.status, 200)
  assert.notEqual(firstAnimal.id, secondAnimal.id)
})

/**
 * @author Brian Louis Salinas
 *  Description: Pagination test that checks if the rejects negative page
 */

test('GET /api/animals handles negative page safely', async () => {
  // Arrange
  const negativePage = -100

  // Act
  const { status, body } = await get(`/animals?page=${negativePage}&limit=5`)

  // Assert
  assert.equal(status, 200)
  assert.ok(Array.isArray(body))
})

/**
 * @author Brian Louis Salinas
 *  Description: Tests for paddock if the old and new paddock when animals move, ensuring successful transaction.
 */

test('PUT /api/animals/:id updates old and new paddock counts when animal moves', async () => {
  // Arrange
  const { body: paddocksBefore } = await get('/paddocks')
  const oldPaddock = paddocksBefore[0]
  const newPaddock = paddocksBefore[1]

  const createAnimal = await post('/animals', {
    name: 'Move Test',
    tag_number: 'MOVE-001',
    breed: 'Merino',
    date_of_birth: '2022-01-01',
    paddock_id: oldPaddock.id
  })

  const animalId = createAnimal.body.id

  // Act
  const updateResult = await put(`/animals/${animalId}`, {
    paddock_id: newPaddock.id
  })

  const { body: updatedOldPaddock } = await get(`/paddocks/${oldPaddock.id}`)
  const { body: updatedNewPaddock } = await get(`/paddocks/${newPaddock.id}`)

  // Assert
  assert.equal(updateResult.status, 200)
  assert.equal(updateResult.body.paddock_id, newPaddock.id)

  assert.equal(updatedOldPaddock.animal_count, oldPaddock.animal_count)

  assert.equal(updatedNewPaddock.animal_count, newPaddock.animal_count + 1)
})

/**
 * @author Brian Louis Salinas
 *  Description: Tests for duplicate number conflict, ensuring that
 * unique tag_numbers are met
 */

test('POST /api/animals returns conflict for duplicate tag_number', async () => {
  // Arrange
  const animalPayload = {
    name: 'Duplicate Test',
    tag_number: 'DUP-001',
    breed: 'Merino',
    date_of_birth: '2022-01-01'
  }

  await post('/animals', animalPayload)

  // Act
  const { status, body } = await post('/animals', {
    ...animalPayload,
    name: 'Duplicate Test Two'
  })

  // Assert
  assert.equal(status, 409)
  assert.equal(body.error, 'tag_number already exists')
})

/**
 * @author Brian Louis Salinas
 * Description: Ensures a weight record cannot be created without a date.
 */
test('POST /api/animals/:id/weights returns 400 when date is missing', async () => {
  // Arrange
  const createAnimal = await createTestAnimal({
    name: 'Missing Date Test'
  })

  const animalId = createAnimal.body.id

  // Act
  const { status, body } = await post(`/animals/${animalId}/weights`, {
    weight_kg: 45.2,
    notes: 'Missing date'
  })

  // Assert
  assert.equal(status, 400)
  assert.equal(body.error, 'date is required')
})

/**
 * @author Brian Louis Salinas
 * Description: Ensures GET /animals includes the latest weight after a weight is logged.
 *
 * This attacks the integration between POST /weights and the animal list page.
 */
test('GET /api/animals returns latest_weight after a weight is logged', async () => {
  // Arrange
  const createAnimal = await createTestAnimal({
    name: 'Latest Weight Integration Test'
  })

  const animalId = createAnimal.body.id

  await post(`/animals/${animalId}/weights`, {
    weight_kg: 41.5,
    date: '2024-10-01',
    notes: 'Older weight'
  })

  await post(`/animals/${animalId}/weights`, {
    weight_kg: 48.9,
    date: '2024-12-01',
    notes: 'Latest weight'
  })

  // Act
  const { status, body } = await get('/animals?page=0&limit=100')
  const animal = body.find(a => a.id === animalId)

  // Assert
  assert.equal(status, 200)
  assert.ok(animal)
  assert.ok(animal.latest_weight)
  assert.equal(animal.latest_weight.weight_kg, 48.9)
  assert.equal(animal.latest_weight.date, '2024-12-01')
  assert.equal(animal.latest_weight.notes, 'Latest weight')
})

/**
 * @author Brian Louis Salinas
 * Description: Ensures same-day weight records are ordered by newest inserted record first.
 *
 * This protects duplicate same-day weigh-ins, where date alone is not enough
 * to determine which record should appear first.
 */
test('GET /api/animals/:id/weights orders same-date records by newest inserted first', async () => {
  // Arrange
  const createAnimal = await createTestAnimal({
    name: 'Same Date History Test'
  })

  const animalId = createAnimal.body.id

  const first = await post(`/animals/${animalId}/weights`, {
    weight_kg: 40,
    date: '2024-11-15',
    notes: 'First same-day record'
  })

  const second = await post(`/animals/${animalId}/weights`, {
    weight_kg: 42,
    date: '2024-11-15',
    notes: 'Second same-day record'
  })

  // Act
  const { status, body } = await get(`/animals/${animalId}/weights`)

  // Assert
  assert.equal(status, 200)
  assert.equal(body.length, 2)

  assert.equal(body[0].id, second.body.id)
  assert.equal(body[0].weight_kg, 42)
  assert.equal(body[0].notes, 'Second same-day record')

  assert.equal(body[1].id, first.body.id)
  assert.equal(body[1].weight_kg, 40)
  assert.equal(body[1].notes, 'First same-day record')
})

/**
 * @author Brian Louis Salinas
 * Description: Ensures latest_weight on GET /animals uses newest inserted record
 * when multiple weights share the same date.
 */
test('GET /api/animals latest_weight uses newest record when weight dates match', async () => {
  // Arrange
  const createAnimal = await createTestAnimal({
    name: 'Same Date Latest Weight Test'
  })

  const animalId = createAnimal.body.id

  await post(`/animals/${animalId}/weights`, {
    weight_kg: 50,
    date: '2024-12-01',
    notes: 'First same-day weight'
  })

  await post(`/animals/${animalId}/weights`, {
    weight_kg: 55,
    date: '2024-12-01',
    notes: 'Second same-day weight'
  })

  // Act
  const { status, body } = await get('/animals?page=0&limit=100')
  const animal = body.find(a => a.id === animalId)

  // Assert
  assert.equal(status, 200)
  assert.ok(animal)
  assert.ok(animal.latest_weight)
  assert.equal(animal.latest_weight.weight_kg, 55)
  assert.equal(animal.latest_weight.date, '2024-12-01')
  assert.equal(animal.latest_weight.notes, 'Second same-day weight')
})

/**
 * @author Brian Louis Salinas
 * Description: Ensures notes are optional when logging a weight.
 */
test('POST /api/animals/:id/weights accepts missing notes', async () => {
  // Arrange
  const createAnimal = await createTestAnimal({
    name: 'Missing Notes Test'
  })

  const animalId = createAnimal.body.id

  // Act
  const { status, body } = await post(`/animals/${animalId}/weights`, {
    weight_kg: 38.7,
    date: '2024-12-01'
  })

  // Assert
  assert.equal(status, 201)
  assert.equal(body.animal_id, animalId)
  assert.equal(body.weight_kg, 38.7)
  assert.equal(body.date, '2024-12-01')
  assert.equal(body.notes, null)
})

/**
 * @author Brian Louis Salinas
 * Description: Ensures zero is rejected because weight must be strictly positive.
 */
test('POST /api/animals/:id/weights returns 422 when weight_kg is zero', async () => {
  // Arrange
  const createAnimal = await createTestAnimal({
    name: 'Zero Weight Test'
  })

  const animalId = createAnimal.body.id

  // Act
  const { status, body } = await post(`/animals/${animalId}/weights`, {
    weight_kg: 0,
    date: '2024-11-15'
  })

  // Assert
  assert.equal(status, 422)
  assert.equal(body.error, 'weight_kg is required and must be positive')
})

/**
 * @author Brian Louis Salinas
 * Description: Ensures empty string cannot bypass weight validation.
 */
test('POST /api/animals/:id/weights returns 422 when weight_kg is empty string', async () => {
  // Arrange
  const createAnimal = await createTestAnimal({
    name: 'Empty String Weight Test'
  })

  const animalId = createAnimal.body.id

  // Act
  const { status, body } = await post(`/animals/${animalId}/weights`, {
    weight_kg: '',
    date: '2024-11-15'
  })

  // Assert
  assert.equal(status, 422)
  assert.equal(body.error, 'weight_kg is required and must be positive')
})

/**
 * @author Brian Louis Salinas
 * Description: Verifies that the animal list endpoint returns animals with
 * the latest summary fields required by the frontend.
 *
 * This test checks that each animal response includes:
 * - latest_health_event, used by the Animals table
 * - latest_weight, used by the Latest Weight column
 *
 * It protects the frontend from silently showing missing summary data when
 * the backend response shape changes.
 */
test('GET /api/animals returns animals with latest summary fields', async () => {
  const { status, body } = await get('/animals?page=0&limit=5')

  assert.equal(status, 200)
  assert.ok(Array.isArray(body))
  assert.ok(body.length > 0)

  assert.ok('latest_health_event' in body[0])
  assert.ok('latest_weight' in body[0])
})

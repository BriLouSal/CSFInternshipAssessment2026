const express = require('express')
const router = express.Router()
const { db } = require('../db')

router.get('/', (req, res) => {
  // First BUG, I would create the variable to handle offset
  // and then we replace .all(limit,page) -> .all(limit, offset)
  const page = Math.max(parseInt(req.query.page) || 0, 0)
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100)
  const offset = page * limit
  // This will help fix the N + 1 queries issue

  // This prevents inconsistent data in the long run
  // and allows for faster performance as thousands
  // of queries will be sent rather than one efficent
  // query

  const rows = db
    .prepare(
      `
    SELECT
      animals.*,
      health_events.id AS latest_health_event_id,
      health_events.event_type AS latest_health_event_type,
      health_events.notes AS latest_health_event_notes,
      health_events.date AS latest_health_event_date,
      health_events.vet_name AS latest_health_event_vet_name
    FROM animals
    LEFT JOIN health_events
      ON health_events.id = (
        SELECT id
        FROM health_events
        WHERE health_events.animal_id = animals.id
        ORDER BY date DESC
        LIMIT 1
      )
    LIMIT ? OFFSET ?
  `
    )
    .all(limit, offset)

  const result = rows.map(row => ({
    id: row.id,
    name: row.name,
    tag_number: row.tag_number,
    breed: row.breed,
    date_of_birth: row.date_of_birth,
    paddock_id: row.paddock_id,
    latest_health_event: row.latest_health_event_id
      ? {
          id: row.latest_health_event_id,
          animal_id: row.id,
          event_type: row.latest_health_event_type,
          notes: row.latest_health_event_notes,
          date: row.latest_health_event_date,
          vet_name: row.latest_health_event_vet_name
        }
      : null
  }))

  res.json(result)
})

router.post('/', (req, res) => {
  const { name, tag_number, breed, date_of_birth, paddock_id } = req.body

  if (!name || !tag_number) {
    return res.status(400).json({ error: 'name and tag_number are required' })
  }

  // For this one we'd want to have like our data
  // being inserted before we can formally do the update count so that tag_numbers is duplicated which causes
  // Full atomicity is later enforced using database transactions, and this process will help the program
  // reduce the risk of inconsistent database state.

  // We'll add error handling by preventing duplicate tag_number.
  try {
    const result = db
      .prepare(
        'INSERT INTO animals (name, tag_number, breed, date_of_birth, paddock_id) VALUES (?, ?, ?, ?, ?)'
      )
      .run(
        name,
        tag_number,
        breed ?? null,
        date_of_birth ?? null,
        paddock_id ?? null
      )
    // Now we replace the if-statement, we want to check if it's not null and  not undefined. Now for this let's handle the cases where the paddock_id has a better if-statement that handle

    if (paddock_id !== null && paddock_id !== undefined) {
      db.prepare(
        'UPDATE paddocks SET animal_count = animal_count + 1 WHERE id = ?'
      ).run(paddock_id)
    }

    const animal = db
      .prepare('SELECT * FROM animals WHERE id = ?')
      .get(result.lastInsertRowid)
    res.json(animal)
  } catch (error) {
    // Return API reponse when unique constraint is violated for tag_number
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({
        error: 'tag_number already exists'
      })
    }

    throw error
  }
})

router.get('/:id', (req, res) => {
  const animal = db
    .prepare('SELECT * FROM animals WHERE id = ?')
    .get(req.params.id)
  if (!animal) return res.status(404).json({ error: 'Animal not found' })
  res.json(animal)
})

router.put('/:id', (req, res) => {
  const animal = db
    .prepare('SELECT * FROM animals WHERE id = ?')
    .get(req.params.id)
  if (!animal) return res.status(404).json({ error: 'Animal not found' })

  const updates = {
    name: req.body.name ?? animal.name,
    tag_number: req.body.tag_number ?? animal.tag_number,
    breed: req.body.breed ?? animal.breed,
    date_of_birth: req.body.date_of_birth ?? animal.date_of_birth,
    paddock_id:
      'paddock_id' in req.body ? req.body.paddock_id : animal.paddock_id
  }

  // ATOMICITY FIX:
  // For this one we're gonna add transaction handling
  // If either operation fails, SQLite rolls back all changes,
  // preserving database consistency and integrity.

  const updateAnimalData = db.transaction(() => {
    // Next thing we need to fix for bug as it doesn't decrement the old paddock count which is a issue
    // I brought up audit.md and we need to change the conditonal statement as should not check for truthiness
    // which was a bug I fixed earlier so we can use that as a way for us to fix this conditional statement

    if (updates.paddock_id !== animal.paddock_id) {
      if (animal.paddock_id !== null && animal.paddock_id !== undefined) {
        db.prepare(
          'UPDATE paddocks SET animal_count = animal_count - 1 WHERE id = ?'
        ).run(animal.paddock_id)
      }

      if (updates.paddock_id !== null && updates.paddock_id !== undefined) {
        db.prepare(
          'UPDATE paddocks SET animal_count = animal_count + 1 WHERE id = ?'
        ).run(updates.paddock_id)
      }
    }
    db.prepare(
      `
    UPDATE animals
    SET name = ?, tag_number = ?, breed = ?, date_of_birth = ?, paddock_id = ?
    WHERE id = ?
  `
    ).run(
      updates.name,
      updates.tag_number,
      updates.breed,
      updates.date_of_birth,
      updates.paddock_id,
      req.params.id
    )
  })
  updateAnimalData()

  const updated = db
    .prepare('SELECT * FROM animals WHERE id = ?')
    .get(req.params.id)
  res.json(updated)
})

router.delete('/:id', (req, res) => {
  const animal = db
    .prepare('SELECT * FROM animals WHERE id = ?')
    .get(req.params.id)
  if (!animal) return res.status(404).json({ error: 'Animal not found' })

  //  ATOMICITY FIX:
  // Similar to the updateAnimalData

  const updateAnimalDataDelete = db.transaction(() => {
    if (animal.paddock_id !== null && animal.paddock_id !== undefined) {
      db.prepare(
        'UPDATE paddocks SET animal_count = animal_count - 1 WHERE id = ?'
      ).run(animal.paddock_id)
    }
    db.prepare('DELETE FROM animals WHERE id = ?').run(req.params.id)
  })
  updateAnimalDataDelete()

  res.json({ message: 'deleted' })
})

router.get('/:id/health-events', (req, res) => {
  const animal = db
    .prepare('SELECT * FROM animals WHERE id = ?')
    .get(req.params.id)
  if (!animal) return res.status(404).json({ error: 'Animal not found' })

  const events = db
    .prepare(
      'SELECT * FROM health_events WHERE animal_id = ? ORDER BY date DESC'
    )
    .all(req.params.id)
  res.json(events)
})

router.post('/:id/health-events', (req, res) => {
  const animal = db
    .prepare('SELECT * FROM animals WHERE id = ?')
    .get(req.params.id)
  if (!animal) return res.status(404).json({ error: 'Animal not found' })

  const { event_type, notes, date, vet_name } = req.body
  if (!event_type || !date) {
    return res.status(400).json({ error: 'event_type and date are required' })
  }

  const result = db
    .prepare(
      'INSERT INTO health_events (animal_id, event_type, notes, date, vet_name) VALUES (?, ?, ?, ?, ?)'
    )
    .run(req.params.id, event_type, notes ?? null, date, vet_name ?? null)

  const event = db
    .prepare('SELECT * FROM health_events WHERE id = ?')
    .get(result.lastInsertRowid)
  res.status(201).json(event)
})

/**
 * Description: Log a weight measurement for an animal.
 * @author Brian Louis Salinas
 */
router.post('/:id/weights', (req, res) => {
  // - [ ] `POST /animals/{id}/weights` creates a weight record and returns 201
  // So we create a new router for this event
  const animal = db
    .prepare('SELECT * FROM animals WHERE id = ?')
    .get(req.params.id)
  // If animal is not on the database then return error 404

  if (!animal) {
    return res.status(404).json({ error: 'Animal not found' })
  }
  // Request body
  const { weight_kg, date, notes } = req.body
  const weight = Number(weight_kg)

  // returns 422 if `weight_kg` is missing or non-positive
  if (
    weight_kg === undefined ||
    weight_kg === null ||
    !Number.isFinite(weight) ||
    weight <= 0
  ) {
    return res.status(422).json({
      error: 'weight_kg is required and must be positive'
    })
  }

  if (!date) {
    return res.status(400).json({ error: 'date is required' })
  }

  const result = db
    .prepare(
      `
      INSERT INTO weights (animal_id, weight_kg, date, notes)
      VALUES (?, ?, ?, ?)
    `
    )
    .run(req.params.id, weight, date, notes ?? null)

  const weightRecord = db
    .prepare('SELECT * FROM weights WHERE id = ?')
    .get(result.lastInsertRowid)

  return res.status(201).json(weightRecord)
})

/**
 * Description: Grabs the weight history for animals
 * @author Brian Louis Salinas
 */
router.get('/:id/weights', (req, res) => {
  const animal = db
    .prepare('SELECT * FROM animals WHERE id = ?')
    .get(req.params.id)

  // If Animal does not exist, then return error code 404

  if (!animal) {
    return res.status(404).json({ error: 'Animal not found' })
  }

  const weights = db
    .prepare(
      `
      SELECT *
      FROM weights
      WHERE animal_id = ?
      ORDER BY date DESC, id DESC
    `
    )
    .all(req.params.id)

  return res.json(weights)
})

module.exports = router

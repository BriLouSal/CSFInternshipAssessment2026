const express = require('express')
const router = express.Router()
const { db } = require('../db')

router.get('/', (req, res) => {
  // First BUG, I would create the variable to handle offset
  // and then we replace .all(limit,page) -> .all(limit, offset)
  const page = Math.max(parseInt(req.query.page) || 0, 0)
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100)
  const offset = page * limit

  // Avoid the N+1 query pattern by fetching animals and their latest
  // health event in one query instead of running one extra query per animal.
  //
  // WEIGHT FEATURE CHANGE:
  // Also fetch the latest weight record in the same query.
  // This lets animals.html display the "Latest Weight" column.
  const rows = db
    .prepare(
      `
      SELECT
        animals.*,

        health_events.id AS latest_health_event_id,
        health_events.event_type AS latest_health_event_type,
        health_events.notes AS latest_health_event_notes,
        health_events.date AS latest_health_event_date,
        health_events.vet_name AS latest_health_event_vet_name,

        -- WEIGHT FEATURE CHANGE:
        -- Select latest weight fields for each animal.
        weights.id AS latest_weight_id,
        weights.weight_kg AS latest_weight_kg,
        weights.date AS latest_weight_date,
        weights.notes AS latest_weight_notes

      FROM animals

      LEFT JOIN health_events
        ON health_events.id = (
          SELECT id
          FROM health_events
          WHERE health_events.animal_id = animals.id
          ORDER BY date DESC, id DESC
          LIMIT 1
        )

      -- WEIGHT FEATURE CHANGE:
      -- Join the newest weight record for each animal.
      -- date DESC gets the newest measurement date.
      -- id DESC breaks ties when multiple weights exist on the same date.
      LEFT JOIN weights
        ON weights.id = (
          SELECT id
          FROM weights
          WHERE weights.animal_id = animals.id
          ORDER BY date DESC, id DESC
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

    // WEIGHT FEATURE CHANGE:
    // Add latest_weight to the API response.
    // animals.html checks this field to display:
    // "45.2 kg (2024-11-15)" or "—" if no weight exists.
    latest_weight: row.latest_weight_id
      ? {
          id: row.latest_weight_id,
          animal_id: row.id,
          weight_kg: row.latest_weight_kg,
          date: row.latest_weight_date,
          notes: row.latest_weight_notes
        }
      : null,

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

  // For this one we'd want to have our data inserted and the paddock count
  // updated as one logical operation.
  // Full atomicity is enforced using manual SQLite transactions, and this
  // helps reduce the risk of inconsistent database state.

  // We'll add error handling by preventing duplicate tag_number.
  try {
    db.exec('BEGIN')

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

    // Now we replace the if-statement, we want to check if it's not null
    // and not undefined. This avoids relying on JavaScript truthy/falsy checks.
    if (paddock_id !== null && paddock_id !== undefined) {
      db.prepare(
        'UPDATE paddocks SET animal_count = animal_count + 1 WHERE id = ?'
      ).run(paddock_id)
    }

    db.exec('COMMIT')

    const animal = db
      .prepare('SELECT * FROM animals WHERE id = ?')
      .get(result.lastInsertRowid)

    return res.status(201).json(animal)
  } catch (error) {
    db.exec('ROLLBACK')

    // Return API response when unique constraint is violated for tag_number.
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({
        error: 'tag_number already exists'
      })
    }

    return res.status(500).json({
      error: 'Failed to create animal'
    })
  }
})
router.get('/:id', (req, res) => {
  const animal = db
    .prepare('SELECT * FROM animals WHERE id = ?')
    .get(req.params.id)
  if (!animal) return res.status(404).json({ error: 'Animal not found' })
  return res.json(animal)
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

  try {
    db.exec('BEGIN')
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

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')

    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({
        error: 'tag_number already exists'
      })
    }

    return res.status(500).json({
      error: 'Failed to update animal'
    })
  }

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
  try {
    db.exec('BEGIN')

    if (animal.paddock_id !== null && animal.paddock_id !== undefined) {
      db.prepare(
        'UPDATE paddocks SET animal_count = animal_count - 1 WHERE id = ?'
      ).run(animal.paddock_id)
    }

    db.prepare('DELETE FROM animals WHERE id = ?').run(req.params.id)

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')

    return res.status(500).json({
      error: 'Failed to delete animal'
    })
  }

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
  // Add a defensive style programming here, this constant is meant to fix any sneak through the Number(weight_kg)
  // which could pose a threat as we don't want [45] as the number
  const isInvalidWeight =
    weight_kg === undefined ||
    weight_kg === null ||
    Array.isArray(weight_kg) ||
    typeof weight_kg === 'object' ||
    (typeof weight_kg === 'string' && weight_kg.trim() === '')
  const weight = isInvalidWeight ? NaN : Number(weight_kg)
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

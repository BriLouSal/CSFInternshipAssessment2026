const express = require('express')
const router = express.Router()
const { db } = require('../db')

router.get('/', (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 0, 0)
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100)

  // First BUG, I would create the variable to handle offset
  // and then we replace .all(limit,page) -> .all(limit, offset)
  const offset = page * limit

  const animals = db
    .prepare('SELECT * FROM animals LIMIT ? OFFSET ?')
    .all(limit, offset)

  const result = animals.map(animal => {
    const latestEvent = db
      .prepare(
        `
      SELECT * FROM health_events
      WHERE animal_id = ?
      ORDER BY date DESC
      LIMIT 1
    `
      )
      .get(animal.id)
    return { ...animal, latest_health_event: latestEvent ?? null }
  })

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

  if (animal.paddock_id !== null && animal.paddock_id !== undefined) {
    db.prepare(
      'UPDATE paddocks SET animal_count = animal_count - 1 WHERE id = ?'
    ).run(animal.paddock_id)
  }

  db.prepare('DELETE FROM animals WHERE id = ?').run(req.params.id)
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

module.exports = router

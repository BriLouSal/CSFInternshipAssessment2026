# Architectural Improvement 

## Issue
Throughout the project, I've identified issues that has the codebase very vulnerable to harmful attacks such as SQL injection. Another issue I would like to bring up is SQLite, in the scope of this project it'd be appropriate, but if we were to put this in production, I purpose that we'd add PostgreSQL for multi-user production use and  with much more better handling on huge databses.
Another issue that was prominent was the lack of transaction handling that I witnessed. The database updates were not consistently treated as a atomic operations which would help maintain transaction integrity, and keeping the database consistent. An example of this situation was an animal moving from their paddock to a new paddock; which will affect both "animal"
and "paddock.animal_count" values, such as that if one failed and one succeded, it would catalyze in an inconsistent database
## Changes that was made
I updated the animal create/update/delete flows so that we can make sure atomic operations via related database operations are being wrapped in SQLite transactions with error handling so that paddock count and animal changes  succeed or fail together; an "all or nothing" method that atomicity uses.


I also added database-level constraints where appropriate, including:

- `capacity > 0` for paddocks
- `animal_count >= 0` for paddocks
- `weight_kg > 0` for weight records
- foreign key relationships with cascade delete for animal-related records


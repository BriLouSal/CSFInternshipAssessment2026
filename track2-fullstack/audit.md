### Breakdown of the Backend System



# The Audit:
* What issues do you find: The issue that creates the highest risk is the bugs which is in the animals.js. I've assessed the risk per each JavaScript  file and I say that animal.js contains the highest risk. Compared to the other JavaScript file, animal.js is one of the most important files that causes the full-stack website to what it is; functional, so its responsibility of CRUD operation, counters, etc. I argue that there needs to be some transaction handling in the database. 

* Bugs: In the animal.js file, I've detected an error that could prove problematic: The very first router GET method; the error would be using offset as page, rather than creating a variable that calculates the offset via page * limit so that each page skips the correct number of rows.

* Another issue I would like to bring up is the if-statement for paddock_id, and the problem is relying on if paddock_id is True instead of explicitly checking if the value is null or undefined; which will cause it to be unreliable, so I propose that we recalibrate that. 

*Another bug I'd also like to point out is within the PUT /:id route. When an animal moves to another paddock, the new paddock count increases, but the old paddock count is never decreased. Over time, this would result in inaccurate and inconsistent paddock data.

Additional:
* Going back to the point for the introduction of transaction handling, I would like to add atomicity to ensure that data will be consistent, as it will have a safe handling for the system during a mid-transaction following the "all or nothing" principle that will allow it to roll-back safely. 

# Retrospective



## Trade-offs
I mainly focused on the weight-tracking feature that allowed for more user-friendly experience while keeping the original tech-stack. The biggest tradeoff in this endeavour was the recalibration of replacing SQLite with PostgreSQL. For this situation SQLite would be great for this situation, but if we're getting this product like AgroLedger, I would conisder recalibrating it towards PostgreSQL or any relational database.

## What would you do differently with more time?
With more time, I'd add authentication and authorization as the it would be bad for farm management to have unrestricted access to animals, paddock, health, and weight records. I would add longer pagination to handle long weight histories, add edit/delete support for the records in case of a misinput, and I would have those system under a user and their specific animal records

I intentionally left the larger architectural  changes such as PostgreSQL migration,  Redis caching; which could also help with Celery as it has Javascript support, and multi-tenant farm support, and many more features that would assist in improving the production system. However the complexity would be deviating from the project's purpose and scope.
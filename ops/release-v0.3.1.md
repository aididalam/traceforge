# v0.3.1: fresh database startup

This patch retains the owner-approved receipt implementation and contract ABI
from [v0.3.0](release-v0.3.0.md). Existing approval contracts, stock and accounts
remain compatible.

The first MySQL initialization on the Pi took about 322 seconds. The previous
health grace period declared it unhealthy before initialization completed, so
the first `make up` failed even though the database later became healthy.

Managed MySQL now has a five-minute initialization grace period. Successful
authenticated probes still make it healthy immediately. Application startup,
migration and restore commands have a bounded ten-minute startup window. Stock,
authorization, transaction confirmation and browser test deadlines are unchanged.

The application images retain the tested API, indexer, UI and contract code;
their release labels use `v0.3.1`. The deployment helper's source revision includes
this installer correction.

An additional disposable Pi database passed fresh initialization and all eight
indexer and sixteen API migrations with the corrected settings. Its authenticated
health check became healthy, and Docker reported the configured 300-second grace
period. Configuration/joining-node checks passed seven tests. The existing Pi
deployment then passed `make up` and `make check`; all seven application/database
services and the four original validators were healthy.

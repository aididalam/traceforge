# v0.3.0: owner-approved receipts

Scanning now creates a receipt request. Stock moves only after the current
holder approves an owner-signed transfer. The dashboard and ERP expose the
requesting business's Organization ID and wallet address, and support up to 100
requests or decisions per call. Pending requests do not reserve stock.

The contract checks source ownership, recipient registration, available quantity,
stock version, expiry and request replay. The durable worker recovers approved
transfers using the original signed operation. Decline, cancellation and expiry
leave ownership unchanged. An ERP receipt awaiting approval does not block later
checkout jobs.

## Upgrade

This release changes the contract ABI. Deploy a new contract and use a separate
database, wallet directory and application project. Keep the old contract,
history, genesis and validator data. Do not apply the compatible-update shortcut
to a v0.2 installation. Follow the [upgrade instructions](README.md#upgrade-to-owner-approved-receipts).

Indexer migration `008_receipt_approvals.sql` records both wallets and the
approved movement. API migration `015_receipt_approval.sql` adds the durable
request queue and ERP `WAITING_APPROVAL` state. Readiness rejects the previous
receipt interface; bootstrap refuses to reuse a different compiled contract.
Migration `016_receipt_expiry_index.sql` separates expiry maintenance from live
approval locks, preventing the concurrent expiry/approval deadlock found during
real browser verification.

## Verification

Checks run against disposable contracts and databases, preserving the existing
Pi validator network and historical installations:

| Check | Result |
| --- | --- |
| Solidity authorization, lifecycle, quantity and replay tests | 104 passed |
| Real private bootstrap with matching and incompatible cached bytecode | Passed; incompatible deployment retained without a write |
| Configuration and joining-node checks | 7 passed |
| Receipt / ERP input boundaries | 2 / 6 passed |
| Public-network finality checks | 2 passed |
| UI unit tests / desktop and mobile regression tests | 51 / 110 passed |
| Full Pi Besu API/indexer/approval/ERP integration | 33 checks; 62 confirmed business transactions; zero failed concurrent transactions |
| Concurrent expiry maintenance with an owner approval lock | Passed on actual MySQL; live request unchanged, expired request processed |
| Real desktop and mobile browsers against Pi Besu | 2 profiles passed; 103 confirmed transactions, 39 stock checkpoints and 6 rebuilt projection tables |
| Pi Docker Compose application acceptance | Passed: independent signup, single/batch approvals, session restart, decoded QR and ERP restart recovery |
| Runtime domain changes using the same UI image | 3 origins passed; QR URLs changed without rebuilding; unapproved login origins rejected |
| Encrypted Pi backup and isolated restore | 44 tables matched; wallet/configuration files restored and authenticated; live data retained |

The Pi integration covered competing approvals for insufficient stock, bulk
receipts and decisions, requester-wallet projections, decline/cancel/expiry,
lease and API restart recovery, queue backpressure, key revocation, interrupted
RPC simulation, mixed checkout results and repeatable projection rebuilds. No
failed concurrent blockchain transactions were produced. Raw chain logs remain
available while public histories consolidate companion events into one movement.

The Pi has approximately 4 GB RAM and its kernel currently disables memory
cgroups. Integration used the server configuration; enforced Pi-profile memory
limits are not established by these checks. Enable working memory cgroups before
using the documented Pi profile.

These checks validate software behavior. They do not establish physical product
authenticity, collected customer feedback or a real mainnet deployment.

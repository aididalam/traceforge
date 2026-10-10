# TraceForge

**TraceForge** is an open-source, multi-tenant blockchain traceability platform for dynamic product supply chains.

It is designed to support different companies, products, organizations, workflows, metadata schemas, lifecycle states, and trace events while sharing a common blockchain infrastructure.

## Components

| Purpose | Repository |
| --- | --- |
| Besu blockchain, validator nodes and peer connectivity | [traceforge-chain](https://github.com/aididalam/traceforge-chain) |
| Business registration, product ownership and batch quantities | [traceforge-contracts](https://github.com/aididalam/traceforge-contracts) |
| Blockchain events projected into MySQL for searches and history | [traceforge-indexer](https://github.com/aididalam/traceforge-indexer) |
| Business operations, public tracking and queued ERP integration | [traceforge-api](https://github.com/aididalam/traceforge-api) |
| Next.js business dashboard and public product tracking | [traceforge-ui](https://github.com/aididalam/traceforge-ui) |

The parent repository pins all five submodules in [.gitmodules](.gitmodules).
The [API reference](https://github.com/aididalam/traceforge-api/blob/main/API.md) contains endpoint methods, requests and response examples.

## Repository Structure

```text
traceforge/
├── api/           API submodule and endpoint reference
├── chain/         Blockchain infrastructure submodule
├── contracts/     Solidity contracts submodule
├── indexer/       Blockchain indexing submodule
├── ui/            Next.js interface submodule
├── deploy/        Dockerfiles, Compose files and configuration examples
├── ops/           Deployment, monitoring and backup tools
├── .github/       CI and Docker release workflows
├── .gitmodules    Component repository URLs
└── Makefile       Setup and deployment commands
```

## Installation

Install Git, Make, Docker Engine and the Compose plugin on a Docker-supported
64-bit Linux host (AMD64 or ARM64), then:

```bash
git clone --recurse-submodules https://github.com/aididalam/traceforge.git
cd traceforge
mkdir -m 700 .traceforge-deploy
```

Both installations use an absolute `TRACEFORGE_DATA_DIR` owned by the deployment
user, the local Docker context (`default` on Linux), and `TRACEFORGE_SITE_ORIGIN`
for your domain or localhost. Match the bind address/ports to that origin.
UID/GID default to the runner. Domains require HTTPS; open ports 80/443 when
using the standard proxy ports. Host Node.js is optional: commands can run
through the Docker helper.

### Private blockchain

Create the private installation config, edit its paths/origin, and set
`TRACEFORGE_CHAIN_DATA_DIR` to the data directory's `chain` subdirectory:

```bash
cp deploy/deployment.env.example .traceforge-deploy/deployment.env
chmod 600 .traceforge-deploy/deployment.env
# Edit .traceforge-deploy/deployment.env before continuing.
make setup
make chain-init
make chain-up
make contract-init
make up
make check
```

This starts a new four-validator Besu chain, deploys the contract and starts the
application/database. The default pulls published `v0.3.0` images from
[Docker Hub](https://hub.docker.com/u/aididalam). Pi deployments require working
Docker memory limits. Register at `http://127.0.0.1:3101/operator/sign-in`;
`/` provides public tracking. Later startup and domain changes use `make up`.

For an **existing private chain**, start with
[deployment.external.env.example](deploy/deployment.external.env.example), set
its exact RPC, chain/contract identity and persistent paths, then run `make setup`,
`make up` and `make check`. Keep its original genesis, validator keys and data.

### Public EVM network

Use a separate installation for Ethereum, Polygon or BNB Smart Chain. It runs
the same application/database against the public network's RPC; it does not
create validators or move products from your private chain.
Public-chain transaction history and quantities are visible on that network;
the publication setting controls details exposed by the TraceForge API/UI.

```bash
cp deploy/deployment.public.env.example .traceforge-deploy/public.env
chmod 600 .traceforge-deploy/public.env
# Edit .traceforge-deploy/public.env before continuing.
make public-setup
make public-wallet
# Send this network's native currency to the displayed deployer address.
make public-deploy
# If pending, repeat public-deploy until the finalized contract identity is saved.
make public-up
make public-check
```

Set `TRACEFORGE_RPC_URL`, `TRACEFORGE_CHAIN_ID` and `TRACEFORGE_NATIVE_SYMBOL`:

| Network | Mainnet ID / currency | Testnet ID / currency |
| --- | --- | --- |
| [Ethereum](https://ethereum.org/developers/docs/networks/) | `1` / `ETH` | Sepolia `11155111` / `ETH` |
| [Polygon PoS](https://docs.polygon.technology/pos/reference/rpc-endpoints/) | `137` / `POL` | Amoy `80002` / `POL` |
| [BNB Smart Chain](https://docs.bnbchain.org/bnb-smart-chain/developers/wallet-configuration/) | `56` / `BNB` | `97` / `tBNB` |

The example uses Amoy and pulls the same `v0.3.0` release images as the private
installation. Choose an RPC supporting `eth_getLogs`,
`finalized` blocks and raw transaction submission. Provider API keys may appear
in its URL path. Fee mode defaults to automatic; gas price and total gas fee
caps are configurable. Transactions/indexing wait for finality, so confirmation
can take several minutes on some networks.

For an existing public deployment, fill in its contract address, deployment
block and runtime bytecode hash, then use `public-setup`, `public-up` and
`public-check`; skip `public-deploy`.

Each business has a server-managed wallet that must also hold native currency.
Signup displays its funding address; send funds to it directly, or use the
deployer's balance explicitly:

```bash
make public-wallets
make public-fund ADDRESS=0x... AMOUNT=0.01 FUNDING_ID=business-funding-0001
```

Choose the amount for that network's fees. Retry pending funding with the same
ID/address/amount; a new funding payment needs a new ID. Then submit the same
signup details again until registration completes. Register at
`http://127.0.0.1:3102/operator/sign-in`. No automatic mainnet funding occurs.

Public commands select `.traceforge-deploy/public.env`; override it with
`TRACEFORGE_ENV_FILE` when needed. For backups/logs, use e.g.
`TRACEFORGE_ENV_FILE=.traceforge-deploy/public.env make backup` or `make logs`.
Use different project names, data directories and host ports for parallel
private/public installations. Keep deployer/business keys backed up.

See the [operations guide](ops/README.md) for backup/recovery, updates and
[private nodes/validators](ops/README.md#connect-another-node-or-validator).

## Product receipt approval

Scan a product, select its current holder and quantity, then send a receipt
request. The holder sees the requesting business's Organization ID and wallet
address in **Receipt requests**, and can approve or decline up to 100 requests
at once. Receivers can also build a request list of up to 100 products.

Requests expire after 72 hours. Pending requests do not change ownership or
reserve stock. Approval queues an owner-signed blockchain transfer; stock appears
in the receiver's inventory after confirmation. Available quantities are checked
again when approving and when executing each transfer. Bulk results are per item.
Only the current holder can remove its stock from the supply chain.

## ERP integration

Keep the ERP's inventory and payment workflow. Register the business and create a
scoped key with `POST /operator/v1/integration-keys`; keep that key on the ERP
server and send it as `Authorization: Bearer <ERP key>`.

1. Find an existing barcode with `GET /integration/v1/products/search?id=...`,
   or scan a TraceForge short code. Select the product and source stock route.
2. Submit 1–100 `create`, `receive` or `remove` operations to
   `POST /integration/v1/jobs`. Receipt produces `WAITING_APPROVAL`, without
   changing stock. Checkout uses `remove` with quantity and reason `Sold`.
3. The current holder lists `GET /integration/v1/receipt-requests?direction=incoming`
   and sends request IDs to `POST /integration/v1/receipt-requests/decisions` with
   `action: "approve"` or `"decline"`. Approval requires `products:approve`.
4. Poll `GET /integration/v1/jobs/{jobId}` for confirmed results. Pending approval
   does not block later ERP jobs. Retry identical requests with the same keys.

Docker Compose runs the approval/ERP worker automatically. See
[request and response examples](https://github.com/aididalam/traceforge-api/blob/main/API.md#erp-and-pos-integration) and the
[contract upgrade instructions](ops/README.md#upgrade-to-owner-approved-receipts).

## License

Licensed under the [MIT License](LICENSE). Component repositories use the same
license; dependencies retain their own licenses.

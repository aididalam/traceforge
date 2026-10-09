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
The [API reference](api/API.md) contains endpoint methods, requests and response examples.

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
application/database. The default pulls published `v0.2.0` images from
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

The example uses Amoy and pulls the same `v0.2.0` release images as the private
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

## ERP integration

Keep the ERP's existing inventory and payment workflow. Add TraceForge requests
after physical receipt or a successful checkout:

1. Register the business, then create a scoped ERP key with
   `POST /operator/v1/integration-keys` on the private API using a business session.
   Store the key in the ERP server and send it as `Authorization: Bearer <ERP key>`.
2. Match an existing product/batch barcode through
   `GET /integration/v1/products/search?id=...`; save the selected Tracking ID
   and stock route. TraceForge short codes can also be scanned directly.
3. Submit `POST /integration/v1/jobs` with an array of 1–100 `create`, `receive`
   or `remove` operations. Checkout uses `remove` with quantity and reason `Sold`;
   batches also identify the stock route.
4. Save the returned job ID and poll `GET /integration/v1/jobs/{jobId}` for each
   blockchain result. `202` means queued. Retry identical requests with the same
   job/item idempotency keys; use new keys for new operations.

Docker Compose starts the durable ERP worker automatically. See
[ERP authentication and request/response examples](api/API.md#erp-and-pos-integration).

## License

TraceForge and all five component repositories are licensed under the
[MIT License](LICENSE). Each component includes its own `LICENSE` file.
Third-party dependencies and container base images retain their own licenses.

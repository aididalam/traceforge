# TraceForge

**TraceForge** is an open-source, multi-tenant blockchain traceability platform for dynamic product supply chains.

It is designed to support different companies, products, organizations, workflows, metadata schemas, lifecycle states, and trace events while sharing a common blockchain infrastructure.

## Components

| Submodule | Purpose | Repository |
| --- | --- | --- |
| [chain/](chain/) | Besu blockchain, validator nodes and peer connectivity | [traceforge-chain](https://github.com/aididalam/traceforge-chain) |
| [contracts/](contracts/) | Business registration, product ownership and batch quantities | [traceforge-contracts](https://github.com/aididalam/traceforge-contracts) |
| [indexer/](indexer/) | Blockchain events projected into MySQL for searches and history | [traceforge-indexer](https://github.com/aididalam/traceforge-indexer) |
| [api/](api/) | Business operations, public tracking and queued ERP integration | [traceforge-api](https://github.com/aididalam/traceforge-api) |
| [ui/](ui/) | Next.js business dashboard and public product tracking | [traceforge-ui](https://github.com/aididalam/traceforge-ui) |

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

## Run with Docker

Install Git, Make, Docker Engine and the Compose plugin on a Docker-supported
64-bit Linux host (AMD64 or ARM64), then:

```bash
git clone --recurse-submodules https://github.com/aididalam/traceforge.git
cd traceforge
mkdir -m 700 .traceforge-deploy
cp deploy/deployment.env.example .traceforge-deploy/deployment.env
chmod 600 .traceforge-deploy/deployment.env
```

Edit that file: choose an absolute `TRACEFORGE_DATA_DIR` owned by your deployment
user and set `TRACEFORGE_CHAIN_DATA_DIR` to its `chain` subdirectory. Use the local
Docker context (`default` on Linux), your domain in `TRACEFORGE_SITE_ORIGIN` or
`http://127.0.0.1:3101`, and the matching bind address/ports. UID/GID default to
the runner. A domain requires HTTPS; open ports 80/443 for the proxy when using
the standard HTTPS ports. Pi deployments need working Docker memory limits.

For the published release, use `TRACEFORGE_IMAGE_MODE=pull` and
`TRACEFORGE_VERSION=v0.1.0`. To build from this checkout, use `build` and `local`.
Images are published under [aididalam on Docker Hub](https://hub.docker.com/u/aididalam).

For a **new** blockchain and database:

```bash
make setup
make chain-init
make chain-up
make contract-init
make up
make check
```

`setup` prepares images, creates private storage/secrets and checks configuration.
Open `http://127.0.0.1:3101/operator/sign-in` to register your business; `/` provides
public tracking. After initial setup, use `make up` to start the application.
Domain changes require updating the configuration and running `make up`.

For an **existing blockchain**, start with
[deployment.external.env.example](deploy/deployment.external.env.example), set
its exact RPC, chain/contract identity and persistent paths, then run `make setup`,
`make up` and `make check`. Keep its original genesis, validator keys and data.

<details>
<summary>Connect another node or validator</summary>

On the managed network host, configure `TRACEFORGE_P2P_ENABLED=true`,
`TRACEFORGE_P2P_BIND` and `TRACEFORGE_P2P_ADVERTISE_HOST` with its reachable LAN/VPN
IP. Run `make chain-up` and `make chain-export`. Allow peer TCP/UDP ports
30303–30306 between the machines.

On the joining machine, recursively clone this repository, create the private
configuration directory above, then:

```bash
cp chain/config/node.env.example .traceforge-deploy/node.env
chmod 600 .traceforge-deploy/node.env
```

Set its own absolute data path, reachable LAN/VPN IP, matching chain ID and image
version. Allow the joining node's TCP/UDP P2P port (default 30307) between hosts.
Securely copy the network host's `TRACEFORGE_DATA_DIR/join-network.json`
to `.traceforge-deploy/join-network.json`. Alternatively enable
`TRACEFORGE_NETWORK_BOOTSTRAP_ENABLED=true` on the network host, run `make init`,
`make chain-export` and `make up`, then give the joining operator only the separate
bootstrap token. Configure its HTTPS `TRACEFORGE_JOIN_BUNDLE_URL` and private
`TRACEFORGE_JOIN_TOKEN_FILE`; run `make node-fetch` before initialization.

```bash
make node-init
make node-up
make node-check
make node-info
```

Retry the check while initial synchronization completes. The node generates its
own persistent key and can follow the chain immediately after synchronization.
To elect it as a validator, each current validator operator votes through their
private RPC:

```bash
make validator-vote ADDRESS=0x_NEW_NODE_ADDRESS ADD=true RPC=http://validator1:8545
make validator-status
```

More than half of the current validators must vote; a four-validator network
needs three matching votes. Confirm election in `validator-status`. Removal uses
`ADD=false` and the same majority rule. Keep RPC private and retain node storage.

</details>

Use `make status`, `make logs`, `make check`, `make backup` and
`make restore-check` for operations; `make help` lists commands.
Keep deployment files, wallets and backup keys outside Git. Four validators on
one machine share that machine's availability. See [operations](ops/README.md).

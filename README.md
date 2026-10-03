# TraceForge

**TraceForge** is an open-source, multi-tenant blockchain traceability platform for dynamic product supply chains.

It is designed to support different companies, products, organizations, workflows, metadata schemas, lifecycle states, and trace events while sharing a common blockchain infrastructure.

## Components

### TraceForge Chain

Blockchain infrastructure layer based on Hyperledger Besu and QBFT.

Repository:
https://github.com/aididalam/traceforge-chain

Local submodule:

```text
chain/
```

### TraceForge Contracts

Generic smart contract layer for multi-tenant product traceability.

Repository:
https://github.com/aididalam/traceforge-contracts

Local submodule:

```text
contracts/
```

## Repository Structure

```text
traceforge/
├── chain/       → TraceForge Chain
├── contracts/   → TraceForge Contracts
└── README.md
```

## Clone

Clone TraceForge together with all submodules:

```bash
git clone --recurse-submodules https://github.com/aididalam/traceforge.git
```

If the repository has already been cloned:

```bash
git submodule update --init --recursive
```

## Component Repositories

- TraceForge Chain: https://github.com/aididalam/traceforge-chain
- TraceForge Contracts: https://github.com/aididalam/traceforge-contracts

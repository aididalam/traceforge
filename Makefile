NODE ?= node
NPM ?= npm
DEPLOY = ./ops/deploy/traceforge.sh
export VERSION BACKUP ADDRESS ADD RPC AMOUNT FUNDING_ID TRACEFORGE_SCHEMA_COMPATIBLE TRACEFORGE_RESTORE_EMPTY
.PHONY: help setup images init doctor build pull up down status logs check migrate backup restore-check restore deploy rollback test-config chain-init chain-up chain-check chain-backup chain-upgrade chain-export validator-vote validator-status contract-init node-fetch node-init node-up node-check node-info node-status node-down
.PHONY: public-setup public-wallet public-deploy public-up public-check public-down public-status public-wallets public-fund
help setup images init doctor build pull up down status logs check migrate backup restore-check restore deploy rollback chain-init chain-up chain-check chain-backup chain-upgrade chain-export validator-vote validator-status contract-init node-fetch node-init node-up node-check node-info node-status node-down public-setup public-wallet public-deploy public-up public-check public-down public-status public-wallets public-fund:
	@$(DEPLOY) $@ $(SERVICE)
test-config:
	@$(NODE) --test ops/deploy/config.test.mjs ops/deploy/node.test.mjs
.PHONY: test-approval test-integration
test-approval: test-config
	@cd contracts && $(NPM) test
	@cd contracts && $(NPM) run test:bootstrap
	@python3 ops/refresh-contract-abi.py --check
	@cd api && $(NPM) run build && $(NPM) run test:receipt-input && $(NPM) run verify:product-input && $(NPM) run test:erp-input
	@cd indexer && $(NPM) run test:finality
	@cd ui && $(NPM) run typecheck && $(NPM) test
test-integration:
	@cd api && $(NPM) run test:receipt-approval

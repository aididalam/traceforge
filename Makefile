NODE ?= node
DEPLOY = ./ops/deploy/traceforge.sh
export VERSION BACKUP TRACEFORGE_SCHEMA_COMPATIBLE TRACEFORGE_RESTORE_EMPTY
.PHONY: help init doctor build up down status logs check migrate backup restore-check restore deploy rollback test-config chain-init chain-up chain-check chain-backup chain-upgrade contract-init
help init doctor build up down status logs check migrate backup restore-check restore deploy rollback chain-init chain-up chain-check chain-backup chain-upgrade contract-init:
	@$(DEPLOY) $@ $(SERVICE)
test-config:
	@$(NODE) --test ops/deploy/config.test.mjs

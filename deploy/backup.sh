#!/bin/sh
set -eu
umask 077
out="/var/lib/ai-work-company/backups/company-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
cd /opt/ai-work-company/current
exec /opt/ai-work-company/runtime/node scripts/backup.mjs /var/lib/ai-work-company/company.sqlite "$out"

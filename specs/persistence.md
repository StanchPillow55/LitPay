
# Persistence

**Stores**
- `uploads` (object store)
- `embeddings` (Redis/Vector DB, TTL 30 days)
- `sql` (Postgres): sessions, policy_reservations, spend_ledger, artifacts, invoices, meter_events

**Retention**
- Uploads: 90 days (configurable)
- Embeddings: 30 days TTL
- Spend ledger & invoices: 7 years (finance/compliance)

**Backups**
- Daily logical dump + weekly full snapshot; tested restores.

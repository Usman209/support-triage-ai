# Step 13 (Task 4.2): Load tickets without personal data

## 1. Goal

Fill the `tickets` table from `customer_support_tickets.csv` so the agent has real tickets to
triage, **without** storing personal data, with clean text, and safely re-runnable.

## 2. What we built

| File                                              | What                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `data/sample/customer_support_tickets.sample.csv` | 12 hand-written test tickets (fake people, edge cases). Safe to commit |
| `packages/db/src/seed/tickets.ts`                 | `seedTickets()`: parse CSV → map columns → clean text → batched upsert |
| `packages/db/scripts/seed-tickets.ts`             | `pnpm seed:tickets` / `seed:tickets:sample` (`--file`, `--limit`)      |
| `packages/db/scripts/seed-check.ts`               | `pnpm seed:tickets:check`: 8 privacy/quality checks                    |
| `TICKETS_CSV_PATH` (`.env`)                       | Where the dataset lives (`data/raw/…`, gitignored)                     |

Results:

| Run           | Read  | Inserted | Updated | Filled | Unknown → […] | Emails | Phones | Time  |
| ------------- | ----- | -------- | ------- | ------ | ------------- | ------ | ------ | ----- |
| Sample, run 1 | 12    | 12       | 0       | 12     | 1             | 1      | 1      | 0.3 s |
| Sample, run 2 | 12    | 0        | 12      | –      | –             | –      | –      | –     |
| Full dataset  | 8,469 | 8,469    | 0       | 14,392 | 281           | 80     | 188    | 1.8 s |

## 3. Why this way

- **Map only the columns you need** (allow-list): ticket id, product, subject, description,
  status, channel. Name, email, age, gender, purchase date are never read into the database. A
  deny-list ("drop these columns") would silently keep any new personal column that appears later.
- **Free text contains PII too**: descriptions had emails (80) and phone-like numbers (188).
  Dropping columns is not enough; we redact `[email]` / `[phone]`. (Task 8 adds full redaction.)
- **Fill template placeholders**: `{product_purchased}` → the ticket's product, so the agent reads
  normal sentences. Unknown placeholders become `[…]` instead of confusing `{tiddlers_id}`.
- **Real CSV parser (`csv-parse`)**: 6,150 descriptions contain line breaks and 925 contain quotes;
  splitting on commas/newlines would corrupt them.
- **Upsert on `external_id`** with Postgres `ON CONFLICT … DO UPDATE`: re-running updates
  instead of duplicating (idempotent).
- **Never overwrite triage fields**: the update list contains source fields only. `category` and
  `priority` belong to approved agent actions. Tested: a set priority survives a re-load.
- **`(xmax = 0)` trick**: one query tells inserted vs updated for each row.
- **Batches of 500 rows**: one statement per batch instead of 8,469 round trips (1.8 s total).
- **Dataset labels kept in `metadata.datasetLabels`** for reference only (they are random).
- **A committed sample file**: anyone can test the loader without the private dataset.

## 4. How it works

```
pnpm seed:tickets [--file f] [--limit n]
  read file -> csv-parse (columns: true, bom)
  check required columns exist
  for each row:
     status: "Pending Customer Response" -> pending_customer (unknown -> skip with reason)
     description: {product_purchased} -> product · {error_message} -> "an error message"
                  other {x} -> […] · emails -> [email] · phones -> [phone]
  insert 500 rows at a time
     ON CONFLICT (external_id) DO UPDATE source fields only
     RETURNING (xmax = 0) -> inserted / updated
pnpm seed:tickets:check -> 8 checks + 2 example tickets
```

Example (sample ticket SAMPLE-008):

```
CSV:   My {product_purchased} makes a loud grinding noise. Please call me back on
       +1 555 0100 2222 or email me at jane.doe@example.org.
Table: My Roomba Robot Vacuum makes a loud grinding noise. Please call me back on
       [phone] or email me at [email]
```

## 5. Try it yourself

```bash
pnpm seed:tickets:sample      # 12 sample tickets
pnpm seed:tickets:sample      # again: 0 inserted, 12 updated
pnpm seed:tickets:check       # 8 checks
pnpm seed:tickets -- --limit 100   # first 100 real tickets
pnpm seed:tickets             # all 8,469
```

Experiments:

1. Add a 13th row to the sample CSV with your own (fake) phone number in the description, run
   `seed:tickets:sample` and `seed:tickets:check`.
2. In SQL: `select external_id, product, left(description, 100) from tickets where external_id like 'SAMPLE-%';`
3. Remove the sample tickets if you don't want them: `delete from tickets where external_id like 'SAMPLE-%';`

## 6. Problems we faced

| Problem                                                    | Cause                                       | Fix                                                                        | Lesson                                         |
| ---------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------- |
| PII inside free text (80 emails, 188 phones)               | Customers write contact details in messages | Regex redaction in the loader                                              | Dropping PII columns is not enough             |
| ~150 kinds of placeholders, not just `{product_purchased}` | Template-generated data                     | Known ones mapped, unknown → `[…]`; check: 0 left                          | Profile the data before writing cleaning rules |
| Line breaks and quotes inside descriptions                 | Normal CSV quoting                          | `csv-parse` library                                                        | Don't hand-roll CSV parsing for real data      |
| Re-loading could erase approved triage                     | A naive upsert overwrites all columns       | Update source fields only; tested with a set priority                      | Decide which system owns each field            |
| Phone regex may also hit long numbers that aren't phones   | Regex errs on the safe side                 | Accepted for now (over-redaction is safer); proper PII detection in task 8 | Trade-off: recall vs precision in redaction    |

## 7. Interview questions

**Q: How do you load customer data for an AI system responsibly?**
Allow-list the fields you need, drop the rest, redact PII in free text, keep raw files out of git,
document what was removed, and verify with automated checks.

**Q: Allow-list or deny-list for columns?**
Allow-list. New columns in the source are excluded by default; a deny-list leaks anything you
forgot to list.

**Q: How do you make a data load idempotent?**
A stable natural key (`external_id`) with upsert; re-running converges to the same state; report
inserted vs updated.

**Q: Why not overwrite all fields on re-load?**
Some fields are owned by another process (approved agent actions). Overwriting them would silently
undo human decisions.

**Q: Regex PII redaction: good enough?**
A first line of defence: fast and predictable but misses names/addresses and has false positives.
Production uses a PII detector (e.g. Presidio or a model), plus redaction before LLM calls and logs.

## 8. Key takeaways

- Only bring in the data you need.
- Clean and redact at the boundary, then verify with checks.
- Re-runnable loads must respect fields owned by other processes.

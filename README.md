# sanctions-list

Hourly job that converts the OFAC SDN advanced list into a flat, gateway-friendly
JSON file of lower-case EVM addresses. Public, no product branding — this repo
is infrastructure, not a "Safe" product surface.

## Consumers

```
https://raw.githubusercontent.com/protofire/sanctions-list/main/sanctioned-evm/latest.json
```

Schema:

```json
{
  "schema": 1,
  "sourceSha256": "hex sha256 of the raw SDN XML",
  "sourcePublishDate": "the SDN file's Last-Modified header, verbatim",
  "generatedAt": "ISO datetime the address list last changed",
  "checkedAt": "ISO datetime of the last successful check, changed or not",
  "count": "positive integer, equals addresses.length",
  "addresses": ["0x-prefixed lower-case addresses, ^0x[0-9a-f]{40}$"]
}
```

`checkedAt` is a heartbeat: a consumer that has not seen it move in ~48h should
treat the list as stale and fail closed. The builder refreshes it at least
every ~13h even when the source list has not changed.

## Behaviour

- Runs on a schedule (`.github/workflows/build.yml`, hourly) against the OFAC
  Sanctions List Service (SLS).
- Source unchanged, less than ~12h since last check: does nothing.
- Source unchanged, ~12h+ since last check: commits a heartbeat-only update
  (same addresses, refreshed `checkedAt`).
- Source changed, address count did not drop by more than 10% or more than 20
  addresses: commits the new list directly to `main`.
- Source changed and the address count dropped by more than that (a bulk
  OFAC delisting): does **not** publish the shrink to `main`. It opens a PR
  from a `shrink/<sha>` branch instead, so a person can spot-check the removed
  addresses before the list gets smaller. `main` keeps serving the previous
  (larger, over-blocking-safe) list with its `checkedAt` refreshed until that
  PR is reviewed and merged.
- A failed step (download, empty extract, push) fails the workflow run, and
  GitHub notifies the maintainers.

## Source

SDN advanced XML, from the OFAC Sanctions List Service:

```
https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN_ENHANCED.XML
```

(Confirmed 2026-09-25: HTTP 200 after a redirect, `Last-Modified` header
present, ~104 MB body. The download step uses `curl -L` to follow that
redirect.)

## Required repo settings

- Public repo.
- Actions → Workflow permissions: read and write, and allow GitHub Actions to
  create pull requests.
- Ruleset on `main`: block force-push and deletion. Direct pushes stay
  allowed — the bot commits straight to `main`.
- Write access for the maintainers who need to merge shrink PRs.

## Limitations

- Does not implement OFAC's 50% ownership rule (aggregating sanctioned-party
  ownership stakes across entities) — this list is a flat SDN address extract
  only.

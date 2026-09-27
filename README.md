# Recall Check

<!-- badges:start -->
[![CI](https://github.com/arhancanli/recall-check-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/arhancanli/recall-check-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/recall-check-mcp)](https://www.npmjs.com/package/recall-check-mcp)
[![downloads](https://img.shields.io/npm/dw/recall-check-mcp)](https://www.npmjs.com/package/recall-check-mcp)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/arhancanli/recall-check-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/arhancanli/recall-check-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!-- badges:end -->

Is this product recalled? One question, every US agency that answers it: CPSC for consumer products,
FDA for food, drugs and medical devices, NHTSA for vehicles. Search by product name, brand, model
number or UPC, or give a VIN.

Recall data is split across agencies that each publish it differently, and the existing servers each
cover one of them. Recall Check asks CPSC and all three FDA report streams in one call, scores every
record against the whole query, and says how sure each match is:

| Confidence | Meaning |
| --- | --- |
| `exact` | The UPC matched, or every term matched including a model number of 5+ characters |
| `high` | Every term matched in the recall's title, product name or firm |
| `medium` | Every term matched, some only in the description or reason |
| `low` | All but one term matched; shown only when nothing matched fully, and flagged as near matches |

Barcodes are compared in every form agencies print them (12 digits, the 10-digit core FDA often
lists, 11 digits without the check digit, UPC-E), and a VIN's check digit is verified, so a mistyped
VIN is reported instead of silently looked up.

No match is not proof a product is safe: the answer says which agencies were searched, when more
reports exist than were read, and that FDA publishes enforcement reports weekly and a week or two
behind. USDA meat and poultry recalls (FSIS) are not included, because FSIS's API refuses automated
requests.

No account or key needed. Built and maintained by [Arhan Canli](https://github.com/arhancanli).

## Install

<!-- install:start -->
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=recall-check&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsInJlY2FsbC1jaGVjay1tY3AiXX0%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=recall-check&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22recall-check-mcp%22%5D%7D)
[![Install in Goose](https://block.github.io/goose/img/extension-install-dark.svg)](https://block.github.io/goose/extension?cmd=npx&arg=-y&arg=recall-check-mcp&id=recall-check&name=Recall%20Check&description=Checks%20US%20product%20recalls%20across%20agencies%20in%20one%20call%3A%20CPSC%20consumer%20products%20and%20FDA%20food%2C%20drugs%20and%20devices%20matched%20by%20name%2C%20brand%2C%20model%20number%20or%20UPC%2C%20and%20NHTSA%20vehicle%20recalls%20by%20VIN%20or%20make%2C%20model%20and%20year.)

Needs Node.js 20 or newer. No account or key.

**Claude Code**

```sh
claude mcp add recall-check -- npx -y recall-check-mcp
```

**Claude Desktop**: download `recall-check-mcp-<version>.mcpb` from the [latest release](https://github.com/arhancanli/recall-check-mcp/releases/latest) and open it. The bundle is signed; verify it with `gh attestation verify <file> --repo arhancanli/recall-check-mcp`.

**Any other client** (Windsurf, Zed, Cline, Continue and others), in its MCP config file:

```json
{
  "mcpServers": {
    "recall-check": {
      "command": "npx",
      "args": [
        "-y",
        "recall-check-mcp"
      ]
    }
  }
}
```

**Docker**

```sh
docker build -t recall-check-mcp https://github.com/arhancanli/recall-check-mcp.git && docker run -i --rm recall-check-mcp
```

**Hosted (Streamable HTTP)**: `node src/server.mjs --http` serves stateless MCP at `POST /mcp` (port from `PORT`, default 3000).
<!-- install:end -->

## Example

<!-- example:start -->
An agent calls `check_recalls` with:

```json
{
  "query": "Fisher-Price Rock n Play sleeper"
}
```

and gets back (recorded from the live server on 2026-09-26):

```json
{
  "searched": [
    "CPSC (consumer products)",
    "FDA (food)",
    "FDA (drugs)",
    "FDA (medical devices)"
  ],
  "total": 3,
  "results": [
    {
      "agency": "CPSC (consumer products)",
      "id": "23088",
      "date": "2023-01-09",
      "title": "Fisher-Price Reannounces Recall of 4.7 Million Rock 'n Play Sleepers; At Least Eight Deaths Occurred After Recall",
      "product": "All models of Rock 'n Play Sleepers",
      "firm": "Fisher-Price, of East Aurora, New York",
      "hazard": "Infant fatalities have occurred in the Rock 'n Play Sleepers, after the infants rolled from their back to their stomach or side while unrestrained, or under other circumstances.",
      "remedy": "Consumers should stop using the Rock 'n Play immediately and contact Fisher-Price for a refund or voucher. It is illegal to sell or distribute the recalled sleepers.",
      "units": "About 4.7 million (The original recall was announced on April 12, 2019)",
      "injuries": "On April 12, 2019, at the time the original recall was announced, over 30 fatalities were reported to have occurred in the Rock 'n Play Sleepers after the infants rolled from their back to their stomach or side while unrestrained, or under other circ [clipped: 446 more characters]",
      "sold_at": "Major stores nationwide including Walmart, Target, and online at Amazon from September 2009 through April 2019 for between $40 and $149.",
      "url": "https://www.cpsc.gov/Recalls/2023/Fisher-Price-Reannounces-Recall-of-4-7-Million-Rock-n-Play-Sleepers-At-Least-Eight-Deaths-Occurred-After-Recall",
      "confidence": "high",
      "matched": [
        "fisher",
        "price",
        "rock",
        "play",
        "sleeper"
      ]
    },
    {
      "agency": "CPSC (consumer products)",
      "id": "19105",
      "date": "2019-04-12",
      "title": "Fisher-Price Recalls Rock 'n Play Sleepers Due to Reports of Deaths",
      "product": "All Models of Rock 'n Play Sleeper",
      "firm": "Fisher-Price, of East Aurora, N.Y.",
      "hazard": "Infant fatalities have occurred in Rock 'n Play Sleepers, after the infants rolled from their back to their stomach or side while unrestrained, or under other circumstances.",
      "remedy": "Consumers should immediately stop using the product and contact Fisher-Price for a refund or voucher.",
      "units": "About 4.7 million products",
      "injuries": "Since the 2009 product introduction, over 30 infant fatalities have occurred in Rock 'n Play Sleepers, after the infants rolled over while unrestrained, or under other circumstances.",
      "sold_at": "Major retailers for approximately $40 to $149.",
      "url": "https://www.cpsc.gov/Recalls/2019/Fisher-Price-Recalls-Rock-n-Play-Sleepers-Due-to-Reports-of-Deaths",
      "confidence": "high",
      "matched": [
        "fisher",
        "price",
        "rock",
        "play",
        "sleeper"
      ]
    },
    {
      "agency": "CPSC (consumer products)",
      "id": "13087",
      "date": "2013-01-08",
      "title": "Fisher-Price Recalls to Inspect Rock 'N Play Infant Sleepers Due to Risk of Exposure to Mold",
      "product": "Newborn Rock 'n Play Sleeper™",
      "firm": "Fisher-Price Inc., of East Aurora, N.Y.",
... (18 more lines)
```
<!-- example:end -->

## Tools

<!-- tools:start -->
| Tool | What it does |
| --- | --- |
| `check_recalls` | Searches US recalls for a product by name, brand, model number or UPC across CPSC consumer products and FDA food, drugs and devices in one call. Each match has a confidence (exact, high, medium, low), the hazard or reason, remedy and date. No match is not proof of safety. |
| `recent_recalls` | The newest US recalls from CPSC and FDA (food, drugs, devices) over the last N days (up to 90), newest first, optionally one agency only. |
| `vehicle_recalls` | NHTSA safety recalls for a vehicle by VIN (decoded, with its check digit verified) or by make, model and year: campaign number, date, component, summary, consequence, remedy, and whether to park it or park outside. Recall campaigns apply to the model, not proof a given VIN is still unrepaired. |
<!-- tools:end -->

## How it behaves

- Read-only: no tool changes anything outside this process.
- Network: HTTPS only, to the hosts listed in `package.json` under `factory.allowHosts`, with a
  deadline, a size cap and bounded retries; a stalled read is retried. Nothing else is contacted, and
  nothing is logged except unexpected failures (to stderr, without your inputs).
- Agencies are asked in parallel, each within its limits (openFDA allows 240 requests per minute
  without a key); answers are cached for an hour.
- FDA device reports can list thousands of serial numbers; only the first 20,000 characters of those
  lists are read, and fewer device reports are fetched per query, so an answer stays fast and small.
- Results are compact JSON with a matching output schema.

## Benchmark

<!-- bench:start -->
Measured 2026-09-26 with gpt-5.4-mini, 10 fixed tasks graded by fixed checks (`bench/tasks.json`, raw results in `bench/results/`).

| Server | Correct | Input tokens | Output tokens | Tool calls | Median time |
| --- | --- | --- | --- | --- | --- |
| This server | 10/10 | 37571 | 550 | 13 | 4.7 s |
| @cyanheads/cpsc-recalls-mcp-server, the most downloaded recall server | 6/10 | 99067 | 750 | 15 | 2.3 s |
<!-- bench:end -->

## Performance

<!-- perf:start -->
Measured 2026-09-26 from Dubai, home connection against the live upstream, Node 24.19.0 (`bench/perf.json`, `scripts/perf.mjs` in the factory).

| Call | First call | Repeat | Result size |
| --- | --- | --- | --- |
| check_recalls: Fisher-Price Rock n Play sleeper | 2753 ms | 2.2 ms | 4,254 chars |
| check_recalls: insulin pump (FDA devices) | 3083 ms | 3.5 ms | 7,563 chars |
| check_recalls: peanut butter, FDA food only | 2695 ms | 3.9 ms | 5,713 chars |
| vehicle_recalls: 2018 Honda Accord | 300 ms | 0.5 ms | 6,617 chars |
| vehicle_recalls: a VIN with a wrong check digit | 988 ms | 0.3 ms | 6,764 chars |
| recent_recalls: last 7 days | 2695 ms | 0.5 ms | 12,776 chars |

First call: a fresh server process, including the TLS connection and the upstream's own time. Repeat: the same call again, answered from the in-process cache, so it shows this server's own overhead.

Tool definitions the model reads on every turn (name, description, input schema): 1,765 characters, against 10,121 for @cyanheads/cpsc-recalls-mcp-server, the most downloaded recall server. The full tool list, with the output schemas and annotations clients use to validate results, is 3,187 characters (28,479 for the alternative).
<!-- perf:end -->

## Data sources

- [CPSC](https://www.cpsc.gov/Recalls) recalls through the SaferProducts.gov REST service.
- [openFDA](https://open.fda.gov) food, drug and device enforcement reports.
- [NHTSA](https://www.nhtsa.gov/recalls) recalls by vehicle, and VIN decoding through NHTSA vPIC.

All are US government services. They do not endorse this server.

## More MCP servers by Arhan Canli

<!-- family:start -->
- [Actions Check](https://github.com/arhancanli/actions-check-mcp): Checks GitHub Actions workflows: outdated actions, old Node runtimes, retired runners, injection.
- [Citation Check](https://github.com/arhancanli/citation-check-mcp): Verifies citations: finds fabricated or mismatched references and retractions, returns clean BibTeX.
- [Config Check](https://github.com/arhancanli/config-check-mcp): Validates config files against their official schemas: tsconfig, compose, workflows, 1,400+ more.
- [Contact Check](https://github.com/arhancanli/contact-check-mcp): Validates and formats phone numbers, email addresses and postal addresses for any country.
- [Cron Check](https://github.com/arhancanli/cron-check-mcp): Explains cron expressions, lists next run times in any time zone, converts between cron dialects.
- [Domain Health](https://github.com/arhancanli/domain-health-mcp): Email and domain checks: SPF lookup limits, DKIM keys, DMARC, DNS records, registration expiry.
- [Drug Label](https://github.com/arhancanli/drug-label-mcp): FDA drug label answers with section citations, RxNorm name resolution, recalls and shortages.
- [End of Life](https://github.com/arhancanli/end-of-life-mcp): Is this version still supported? EOL dates, latest patch and upgrade target for 470+ products.
- [The whole collection](https://github.com/arhancanli/mcp-factory#servers), 9 more
<!-- family:end -->

## License

MIT, Copyright (c) 2026 Arhan Canli.

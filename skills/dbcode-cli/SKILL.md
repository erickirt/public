---
name: dbcode-cli
description: 'Run SQL against connections saved in DBCode using the dbcode command line. Use when a task needs to query, check, or export data from a database the user has set up in DBCode (VS Code, Cursor, Windsurf, or another VS Code fork), run a .sql file, get results as JSON or CSV, or script a database check. Covers finding connections, output formats, non-interactive approvals, and exit codes.'
license: 'Proprietary. See LICENSE at the repository root.'
compatibility: 'Requires the DBCode extension with its CLI installed (run "DBCode: Install CLI" from the command palette) and Node.js 22.14 or newer on PATH.'
metadata:
  author: dbcode
  docs: https://dbcode.io/docs/cli
---

# DBCode CLI

`dbcode` runs SQL against the connections the user already saved in DBCode. It reads the same settings as the editor, so there is nothing to configure.

## Find the connection first

```sh
dbcode connections
```

The `cli` column says `ok` or why a connection cannot be opened; some connection types are not available from the CLI yet. Use the connection name with `-c`, or its id if two connections share a name.

## Run a query

```sh
dbcode query -c "My Postgres" "select now()"
dbcode query -c warehouse --file report.sql
cat report.sql | dbcode query -c warehouse --format csv > report.csv
```

SQL comes from the argument, `--file`, or stdin. If the SQL starts with a `--` comment, put a literal `--` before it so the parser does not read it as a flag:

```sh
dbcode query -c prod -- "-- daily count
select count(*) from orders"
```

## Output

- When stdout is not a terminal, output is JSON (one array of row objects per result set) and the CLI never prompts.
- `--format table|json|jsonl|csv|tsv|markdown`. CSV and TSV are byte-identical to the grid's Export.
- Only data goes to stdout. Status lines, the row-limit notice, and errors go to stderr, so piping into `jq` or a file is safe.

## Approvals and safety

The user's environment roles apply exactly as in the editor.

- A statement the role marks "ask" is refused with exit code 4 unless you pass `--yes`.
- A statement the role denies is refused either way.
- A `DELETE` or `UPDATE` without a `WHERE` clause follows the role's missing-WHERE rule.

Do not pass `--yes` unless the user asked for that write. Prefer read-only statements for checks.

## Other flags

`--database` and `--schema` override the connection's defaults. `--limit N` and `--no-limit` control the row cap (default: the `dbcode.queryRowLimit` setting). `--timeout S` sets the request timeout in seconds.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success, including truncated results |
| 1 | The database returned an error |
| 2 | Usage error, unknown or unsupported connection |
| 3 | Could not connect or authenticate |
| 4 | Refused by the environment role, or the user answered no |
| 130 | Interrupted |

## Limits

- No AI data masking applies on the CLI: you see real data, the same as `psql` would. If the task needs masking or AI access roles, use DBCode's MCP server instead.
- Passwords follow each connection's "Save password" setting. Prompts go to the terminal, never stdin. Without a terminal, a connection that needs a prompt fails with exit code 3.

Full docs: https://dbcode.io/docs/cli

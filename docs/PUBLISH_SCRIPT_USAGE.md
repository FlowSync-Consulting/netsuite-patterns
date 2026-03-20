# NetSuite Patterns Publishing Script

## Overview

The `scripts/publish.sh` script automates the safe publication of NetSuite patterns from the private `saralegui-solutions/netsuite-patterns-private` repository to the public `FlowSync-Consulting/netsuite-patterns` repository.

It implements a **7-layer defense system** to prevent client data leakage:

1. **Pre-Publish Private Repo Scan** - Validates source files before copying
2. **String Replacement Engine** - Replaces internal domains and infrastructure references
3. **.publishignore Support** - Excludes sensitive files from publication
4. **Git History Scrubbing** - Cleans commit messages (optional)
5. **Pre-Push Output Scan** - Final validation before pushing
6. **Push to Public Repo** - Publishes to GitHub
7. **Post-Push Verification** - Verifies public repo contains no secrets

## Usage

```bash
cd /path/to/netsuite-patterns-private
./scripts/publish.sh [options] [pattern-name]
```

### Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview what would be published without making changes |
| `--pattern <name>` | Publish only a specific pattern directory |
| `--force` | Skip confirmation prompts (use with caution) |
| `--skip-verify` | Skip post-push verification (NOT recommended) |
| `--help` | Show help message |

### Examples

**Preview all changes (recommended first step):**
```bash
./scripts/publish.sh --dry-run
```

**Publish a single pattern:**
```bash
./scripts/publish.sh --pattern csv-import
```

**Publish all patterns with confirmation:**
```bash
./scripts/publish.sh
```

**Publish without prompts (for CI/CD):**
```bash
./scripts/publish.sh --force
```

## How It Works

### Layer 1: Pre-Publish Private Repo Scan

- Runs `gitleaks` on the private repository
- Fetches blocked terms from Infisical `flowsync-blocked-terms` project
- Scans all files (respecting `.publishignore`) for client names, account IDs, and internal identifiers
- **Fails immediately** if any violations found

### Layer 2: String Replacement Engine

Replaces sensitive infrastructure references with generic placeholders:

| Pattern | Replacement | Description |
|---------|-------------|-------------|
| `https://*.internal` | `https://example.com` | Internal domain URLs |
| `https://*.lan` | `https://example.com` | Deprecated .lan domains |
| `secrets.example.com` | `secrets.example.com` | Secrets service |
| `server.example.com` | `server.example.com` | Tower server |
| `server.example.com` | `server.example.com` | Atlas server |

### Layer 3: .publishignore Support

Reads `.publishignore` file and excludes:
- Anonymization tooling (scripts/, .gitleaks.toml, ANONYMIZATION.md)
- GitHub workflows (.github/)
- Development files (node_modules/, .venv/, .env)
- IDE files (.vscode/, .idea/)

### Layer 4: Git History Scrubbing (Optional)

Uses `git-filter-repo` to clean commit messages of client names. Currently disabled (commented out in main() function) but available if needed.

### Layer 5: Pre-Push Output Scan

- Runs `gitleaks` on the staging area (files ready to push)
- Scans for blocked terms from Infisical
- **Fails immediately** if any violations found

### Layer 6: Push to Public Repo

- Initializes staging directory with git
- Copies cleaned files
- Creates commit with timestamp
- Pushes to `git@github.com:FlowSync-Consulting/netsuite-patterns.git`
- Uses force push to ensure public repo matches staging area

### Layer 7: Post-Push Verification

- Clones fresh copy of public repo
- Runs `gitleaks` scan
- Scans for blocked terms
- **Alerts if violations found in published code** (emergency response needed)

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Blocked terms found (security violation) |
| 2 | Git error |
| 3 | API error (Infisical, GitHub) |
| 4 | User aborted publish |

## Logs

All publish operations are logged to:
```
~/.local/share/flowsync-publish/publish-YYYY-MM-DD-HHMMSS.log
```

Logs include:
- Timestamp for each operation
- Gitleaks scan results
- Blocked terms checked
- Files copied
- String replacements made
- Push results
- Verification results

## Dependencies

The script requires these tools:

| Tool | Purpose | Installation |
|------|---------|-------------|
| `git` | Version control | Pre-installed on most systems |
| `gitleaks` | Secret scanning | https://github.com/gitleaks/gitleaks |
| `git-filter-repo` | History rewriting | `pip install git-filter-repo` |
| `jq` | JSON parsing | `apt install jq` or `brew install jq` |
| `rsync` | File synchronization | Pre-installed on most Linux/macOS |
| `infisical-cli.py` | Secrets management | `~/.claude/skills/Secrets/tools/infisical-cli.py` |

The script checks for all dependencies at startup and exits with an error if any are missing.

## Configuration

### Blocked Terms (Infisical)

Blocked terms are stored in the `flowsync-blocked-terms` Infisical project:

- `CLIENT_NAME_*` - Client company names
- `ACCOUNT_ID_*` - NetSuite account IDs
- `PREFIX_*` - Internal ID prefixes
- `FLOWSYNC_GITHUB_TOKEN` - GitHub authentication token

### .publishignore File

Located at `/path/to/netsuite-patterns-private/.publishignore`:

```
# Anonymization tooling
.github/
scripts/install-hooks.sh
scripts/publish.sh
.gitleaks.toml
.publishignore
ANONYMIZATION.md

# Development dependencies
node_modules/
.venv/
*.log
.env
.env.*

# IDE files
.vscode/
.idea/
*.swp
```

## Security Best Practices

1. **Always dry-run first**: `./scripts/publish.sh --dry-run`
2. **Review the file list**: Check what will be published
3. **Monitor logs**: Check `~/.local/share/flowsync-publish/` after each publish
4. **Emergency response**: If Layer 7 alerts, immediately:
   - Contact GitHub to request repo deletion
   - Rotate all secrets in Infisical
   - Review what was leaked
5. **Keep blocked terms updated**: Add new client names/IDs to Infisical immediately

## Troubleshooting

### "LAYER 1 FAILED: Blocked terms found in files to be published"

- **Cause**: Client-specific data in files that would be published
- **Fix**: Either:
  1. Add the file to `.publishignore`
  2. Remove the client-specific data from the file
  3. Add the file path to gitleaks allowlist if it's a false positive

### "LAYER 5 FAILED: Gitleaks found secrets in staging area"

- **Cause**: Secrets detected after string replacement
- **Fix**: Review gitleaks output, add to `.gitleaks.toml` allowlist or fix the leak

### "Git push failed"

- **Cause**: Network error, authentication error, or git conflict
- **Fix**:
  - Check GitHub token in Infisical
  - Verify SSH key has access to FlowSync-Consulting/netsuite-patterns
  - Check network connectivity

### "Failed to retrieve GitHub token from Infisical"

- **Cause**: Infisical authentication issue
- **Fix**:
  - Verify `INFISICAL_CLIENT_SECRET` environment variable
  - Check `~/.claude/skills/Secrets/tools/infisical-cli.py` configuration
  - Test: `~/.claude/skills/Secrets/tools/infisical-cli.py get FLOWSYNC_GITHUB_TOKEN --project flowsync-blocked-terms`

## CI/CD Integration

For automated publishing (e.g., GitHub Actions, cron jobs):

```bash
#!/bin/bash
# Automated publish script

cd /path/to/netsuite-patterns-private

# Always use dry-run first
if ! ./scripts/publish.sh --dry-run; then
    echo "Dry run failed, aborting"
    exit 1
fi

# If dry-run passes, publish with force
./scripts/publish.sh --force

# Check exit code
if [ $? -eq 0 ]; then
    echo "Publish successful"
else
    echo "Publish failed with exit code $?"
    exit 1
fi
```

## Future Enhancements

- [ ] Add notification on successful publish (Telegram, email)
- [ ] Add rollback mechanism if Layer 7 fails
- [ ] Track publish history in database
- [ ] Support for incremental publishes (only changed files)
- [ ] Integration with GitHub Actions for automated publishing
- [ ] Publish report generation (HTML summary of what was published)

## Support

For issues or questions:
- Check logs in `~/.local/share/flowsync-publish/`
- Review this documentation
- Contact: ben@flowsync.consulting

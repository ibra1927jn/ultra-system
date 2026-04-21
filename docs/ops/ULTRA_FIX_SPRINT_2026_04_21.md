# Ultra Fix Sprint — 2026-04-21 (lab branch, NOT applied)

**Branch:** `lab/ultra-autonomous-2026-04-21`
**Addresses:** `AUDIT-ultra-2026-04.md` round-1 CRITICAL/HIGH items that are fixable
without restarts or credential rotation (both forbidden this session).

## Changes in this branch

### 1. `infra/systemd/dashboard.service` — US-SEC-01 fix

**Finding:** port 9988 bound to `0.0.0.0`. Currently blocked by UFW; one rule
misconfiguration away from public exposure.

**Diff vs currently-installed `/etc/systemd/system/dashboard.service`:**
```diff
-ExecStart=/usr/bin/python3 -m http.server 9988
+ExecStart=/usr/bin/python3 -m http.server 9988 --bind 127.0.0.1
+NoNewPrivileges=true
+ProtectSystem=strict
+ProtectHome=true
+PrivateTmp=true
+ReadOnlyPaths=/var/www/dashboard
+RestartSec=5
```

**Apply (human only — involves service restart):**
```bash
sudo cp infra/systemd/dashboard.service /etc/systemd/system/dashboard.service
sudo systemctl daemon-reload
sudo systemctl restart dashboard
sudo systemctl status dashboard --no-pager
# Verify binding:
ss -tlnp | grep 9988
# Expected: LISTEN ... 127.0.0.1:9988  (not 0.0.0.0:9988)
# External access from Windows:
#   ssh -L 9988:127.0.0.1:9988 ct4-bot
```

**Rollback:** `git checkout HEAD^ infra/systemd/dashboard.service && reapply`, or
just change `--bind 127.0.0.1` back to absent.

**Risk:** LOW. The dashboard is a monitoring UI, not a production user path.
Brief unavailability (<5s) during restart. Existing tunnels will need reconnection.

---

### 2. `infra/logrotate/heartbeat` — US-QUAL-02 fix

**Finding:** `/opt/heartbeat/cron.log` and `/opt/heartbeat/logs/*.log` grow unbounded.
Currently ~MB-scale but projected to GB over months.

**Apply (human only — writes to /etc/logrotate.d/):**
```bash
sudo cp infra/logrotate/heartbeat /etc/logrotate.d/heartbeat
sudo logrotate -d /etc/logrotate.d/heartbeat  # dry-run
sudo logrotate /etc/logrotate.d/heartbeat     # real run
# After first run, check:
ls -la /opt/heartbeat/cron.log*
# Expected: cron.log (new, empty-ish) + cron.log.1 (rotated copy)
```

**Rollback:** `sudo rm /etc/logrotate.d/heartbeat`

**Risk:** VERY LOW. logrotate config is declarative; `copytruncate` avoids
interrupting the heartbeat scripts even if they keep file handles.

---

## Items NOT fixed in this sprint (require human decision)

| Finding | Reason not fixed |
|---|---|
| US-SEC-02 Binance API scope | Requires login to Binance dashboard. Human only. |
| US-INFRA-01 30 GB Docker reclaimable | Plan forbids deletion. Document + skip per rules. |
| US-INFRA-02 16 sidecars stopped | Each needs a decision (restart? tune mem? deprecate?). Human only. |
| US-INFRA-03 swap pressure | Same as above. |
| US-QUAL-01 `ultra_db` superuser name | Requires running `docker exec ultra_db env` + updating docs. 5 min human task. |

---

## Verification done in lab

- `dashboard.service` syntax: checked `Unit/Service/Install` sections, all keys
  valid per systemd.unit(5). `NoNewPrivileges` and `ProtectSystem` are standard
  hardening directives.
- `logrotate` config: checked syntax manually. `copytruncate` is the correct
  directive when the logger keeps the file handle open (heartbeat does).
- **No live systemd/logrotate operations performed.** All apply steps documented
  for human.

---

*Commit this to lab branch. Do NOT merge. Human reviews at 3pm.*

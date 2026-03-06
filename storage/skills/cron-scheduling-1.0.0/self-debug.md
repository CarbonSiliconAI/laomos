# Cron-Scheduling Self-Debug Guide

## Common Failure Modes

### Category 1: Job Never Runs
- **Cron daemon not running** → Service stopped or disabled
- **Crontab syntax error** → Invalid cron expression silently ignored
- **PATH not set** → Script executable locally but fails in cron's minimal environment
- **Missing script file** → Path is relative or file was deleted
- **Permission denied** → Script not executable or user lacks permissions
- **Cron service disabled** → `cron`/`crond` disabled in systemd

### Category 2: Job Runs at Wrong Time
- **Timezone mismatch** → System TZ differs from expected, no TZ set in crontab
- **DST transition** → Job skipped or ran twice during clock changes
- **Calendar expression error** → Systemd timer OnCalendar syntax incorrect
- **Incorrect field order** → Minute/hour/day misaligned in cron expression
- **Day-of-week/day-of-month conflict** → Both specified, OR logic applied unexpectedly

### Category 3: Job Runs But Fails Silently
- **Output not captured** → No logging, mail not configured, output discarded
- **Environment variables missing** → Script relies on vars not in cron's env
- **Working directory wrong** → Script uses relative paths, cwd is /
- **Dependencies not available** → Database, network, or file mounts not ready
- **Insufficient resources** → Job killed by OOM or timeout

### Category 4: Job Runs Multiple Times
- **Overlapping executions** → Long-running job scheduled more frequently than duration
- **DST "fall back"** → 2:30 AM scheduled job runs twice during fall-back hour
- **Manual trigger + cron** → User ran job while cron was also running it
- **Timer restart loop** → Systemd timer constantly restarting failed service

### Category 5: Systemd Timer Issues
- **Timer not enabled** → Created but not `systemctl enable`d
- **Service unit missing** → Timer references non-existent `.service` file
- **Daemon-reload not run** → Changes to timer files not loaded
- **Service type wrong** → Using `Type=simple` instead of `Type=oneshot`
- **StandardOutput/StandardError misconfigured** → Logs not captured in journald

---

## Step-by-Step Debugging Checklist

### Phase 1: Verify Service is Running

```bash
# [ ] Check cron daemon status
systemctl status cron        # Debian/Ubuntu
systemctl status crond       # CentOS/RHEL/Amazon Linux
systemctl is-enabled cron    # Verify enabled

# [ ] If not running, start it
sudo systemctl start cron
sudo systemctl enable cron

# [ ] For systemd timers, verify timer target is active
systemctl list-timers --all
```

**Diagnostic output to capture:**
```
systemctl status cron
systemctl is-active cron
```

### Phase 2: Validate Crontab/Timer Configuration

```bash
# [ ] List current crontab (cron users)
crontab -l

# [ ] Check for syntax errors (cron silently ignores them)
# Manually inspect each line for:
#   - Exactly 5 fields (or special string like @daily)
#   - Numeric ranges: minute 0-59, hour 0-23, day 1-31, month 1-12, dow 0-7
#   - Valid operators: * , - /
#   - No extra spaces within fields

# [ ] For systemd timers, list all timers
systemctl list-timers --all

# [ ] Validate timer's OnCalendar expression
systemd-analyze calendar "Mon *-*-* 09:00:00"
systemd-analyze calendar --iterations=5 "*:0/15"

# [ ] Check timer file exists and is readable
ls -la /etc/systemd/system/myservice.timer
cat /etc/systemd/system/myservice.timer

# [ ] Verify associated .service file exists
ls -la /etc/systemd/system/myservice.service
```

**Diagnostic output to capture:**
```
crontab -l
systemctl list-timers --all
systemd-analyze calendar "YOUR_
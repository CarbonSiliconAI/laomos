---
name: cron-scheduling
description: Schedule and manage recurring tasks with cron and systemd timers. Use when setting up cron jobs, writing systemd timer units, handling timezone-aware scheduling, monitoring failed jobs, implementing retry patterns, or debugging why a scheduled task didn't run.
metadata: {"clawdbot":{"emoji":"⏰","requires":{"anyBins":["crontab","systemctl","at"]},"os":["linux","darwin"]}}
---

# Cron & Scheduling

Schedule and manage recurring tasks. Covers cron syntax, crontab management, systemd timers, one-off scheduling, timezone handling, monitoring, and common failure patterns.

## When to Use

- Running scripts on a schedule (backups, reports, cleanup)
- Setting up systemd timers (modern cron alternative)
- Debugging why a scheduled job didn't run
- Handling timezones in scheduled tasks
- Monitoring and alerting on job failures
- Running one-off delayed commands
- Preventing overlapping job executions

## Cron Syntax

### The five fields

┌───────── minute (0-59)
│ ┌─────── hour (0-23)
│ │ ┌───── day of month (1-31)
│ │ │ ┌─── month (1-12 or JAN-DEC)
│ │ │ │ ┌─ day of week (0-6, 0=Sunday or SUN-SAT)
│ │ │ │ │
* * * * * command

### Common schedules

```bash
# Every minute
* * * * * /path/to/script.sh

# Every 5 minutes
*/5 * * * * /path/to/script.sh

# Every hour at :00
0 * * * * /path/to/script.sh

# Every day at 2:30 AM
30 2 * * * /path/to/script.sh

# Every Monday at 9:00 AM
0 9 * * 1 /path/to/script.sh

# Every weekday at 8:00 AM
0 8 * * 1-5 /path/to/script.sh

# First day of every month at midnight
0 0 1 * * /path/to/script.sh

# Every 15 minutes during business hours (Mon-Fri 9 AM-5 PM)
*/15 9-16 * * 1-5 /path/to/script.sh

# Twice a day (9 AM and 5 PM)
0 9,17 * * * /path/to/script.sh

# Every quarter (Jan, Apr, Jul, Oct) on the 1st at midnight
0 0 1 1,4,7,10 * /path/to/script.sh

# Every Sunday at 3 AM
0 3 * * 0 /path/to/script.sh
```

**Note on day-of-week:** Use 0-6 where 0=Sunday and 6=Saturday, or use 1-5 for Monday-Friday. Avoid mixing day-of-month and day-of-week in the same cron expression (cron uses OR logic).

### Special strings (shorthand)

```bash
@reboot    /path/to/script.sh   # Run once at startup
@yearly    /path/to/script.sh   # 0 0 1 1 *
@monthly   /path/to/script.sh   # 0 0 1 * *
@weekly    /path/to/script.sh   # 0 0 * * 0
@daily     /path/to/script.sh   # 0 0 * * *
@hourly    /path/to/script.sh   # 0 * * * *
```

## Crontab Management

### Edit and install crontab

```bash
# Edit current user's crontab (opens in $EDITOR)
crontab -e

# List current crontab
crontab -l

# Edit another user's crontab (requires root)
sudo crontab -u www-data -e

# Install crontab from file
crontab /path/to/crontab.txt

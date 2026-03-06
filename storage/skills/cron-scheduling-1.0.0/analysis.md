# Cron-Scheduling Skill Analysis Criteria

## 1. Performance Metrics to Track

### Execution Metrics
- **Schedule Accuracy**: Deviation between intended run time and actual run time (target: ±1 minute)
- **Job Completion Rate**: Percentage of scheduled jobs that execute successfully (target: 99.5%)
- **Mean Time to Resolution**: Average time to diagnose and fix scheduling failures (target: <30 minutes)
- **Configuration Deployment Time**: Time from identifying scheduling need to job running (target: <10 minutes)

### Reliability Metrics
- **Mean Time Between Failures (MTBF)**: Average uptime of scheduled jobs (target: >720 hours)
- **Mean Time to Recovery (MTTR)**: Time to restore failed jobs (target: <15 minutes)
- **Silent Failure Detection Rate**: Percentage of failed jobs caught by monitoring (target: 100%)
- **Missed Run Recovery**: Percentage of jobs recovered after system downtime (target: 100% with systemd timers)

### Resource Metrics
- **CPU Overhead**: Cron daemon resource usage (<1% idle system CPU)
- **Memory Footprint**: Cron/systemd timer memory consumption (<50MB)
- **Disk I/O**: Log file growth rate and cleanup efficiency
- **Network Impact**: Alert/email delivery success rate (target: 99%)

## 2. Quality Criteria for Outputs

### Cron Job Configuration Quality
- **Syntax Correctness**: All cron expressions must be valid and unambiguous
- **Path Completeness**: All referenced scripts/binaries must use absolute paths
- **Environment Variables**: Required PATH, SHELL, and MAILTO properly defined
- **Error Handling**: Output redirection specified (>> /var/log/... 2>&1)
- **Documentation**: Each job includes comments explaining purpose and schedule

### Systemd Timer Configuration Quality
- **Service Unit Completeness**: Includes Description, Type, ExecStart, User, StandardOutput/Error
- **Timer Unit Correctness**: Valid OnCalendar syntax, Persistent flag set appropriately
- **Dependency Declaration**: Network, filesystem, or service dependencies explicitly stated
- **Resource Limits**: CPUQuota, MemoryMax, or other limits defined for production jobs
- **Logging Configuration**: Output directed to journald with appropriate log levels

### Debugging Output Quality
- **Root Cause Identification**: Correctly identifies whether issue is timing, environment, permissions, or logic
- **Diagnostic Completeness**: Includes relevant logs, timestamps, and system state
- **Actionable Recommendations**: Provides specific remediation steps with commands
- **False Positive Rate**: <5% of diagnosed issues should be incorrect

### Documentation Quality
- **Clarity**: Explanations understandable to intermediate Linux users (not just experts)
- **Completeness**: Covers all relevant aspects (syntax, management, monitoring, troubleshooting)
- **Accuracy**: No contradictions between examples and explanations
- **Practical Relevance**: Examples match real-world use cases

## 3. Success/Failure Indicators

### Success Indicators
✅ Job executes at scheduled time within acceptable window  
✅ Output/logs captured correctly with timestamps  
✅ Failed jobs trigger appropriate alerts/notifications  
✅ Timezone handling produces correct local time execution  
✅ Jobs survive system reboot (Persistent=true for systemd)  
✅ Overlapping runs prevented when job duration > interval  
✅ DST transitions handled without missed/duplicate runs  
✅ User reports no unexpected job behavior after 30 days  
✅ Monitoring dashboard shows 100% job execution rate  
✅ Logs contain complete audit trail (start, end, exit code)  

### Failure Indicators
❌ Job silently fails to run with no error indication  
❌ Job runs at wrong time (>5 minute deviation)  
❌ Output lost because MAILTO misconfigured  
❌ Job fails due to missing PATH or environment variables  
❌ Concurrent runs overlap causing data corruption  
❌ DST transition causes missed or duplicate execution  
❌ Cron daemon crashes without recovery  
❌ Permission errors prevent script execution  
❌ Timezone-aware job executes in wrong timezone  
❌ No record of job execution attempt in logs  
❌ Job runs twice during DST "fall back" transition  
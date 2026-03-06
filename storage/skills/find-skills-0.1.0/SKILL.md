---
name: find-skills
description: Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill.
---

# Find Skills

Discover and install skills from the open agent skills ecosystem using the Skills CLI.

## Quick Start

**Check installed skills:**
npx skills check

**Search for skills:**
```bash
npx skills find [query]
```

**Install a skill:**
```bash
npx skills add <owner/repo@skill>
```

**Browse all skills:** https://skills.sh/

## When to Use This Skill

Use this skill when you're looking to:

- Add new capabilities to your AI agent
- Find a specialized tool for a specific task ("is there a skill that can...")
- Check what agent skills you have installed
- Discover solutions in domains like testing, deployment, or documentation

*Note: This tool helps with agent capabilities, not personal skill assessment. If you're looking to identify your own strengths, I'd recommend a career assessment tool instead!*

## How to Find and Install Skills

### Step 1: Search for a Skill

```bash
npx skills find [query]
```

Examples:
- `npx skills find react performance`
- `npx skills find testing`
- `npx skills find changelog`

Results show the skill name and install command:
```
vercel-labs/agent-skills@vercel-react-best-practices
└ https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices
```

### Step 2: Install a Skill

```bash
npx skills add <owner/repo@skill>
```

Or install globally without prompts:
```bash
npx skills add <owner/repo@skill> -g -y
```

## Common Skill Categories

| Category        | Search Terms                             |
| --------------- | ---------------------------------------- |
| Web Development | react, nextjs, typescript, css, tailwind |
| Testing         | testing, jest, playwright, e2e           |
| DevOps          | deploy, docker, kubernetes, ci-cd        |
| Documentation   | docs, readme, changelog, api-docs        |
| Code Quality    | review, lint, refactor, best-practices   |
| Design          | ui, ux, design-system, accessibility     |
| Productivity    | workflow, automation, git                |

## Search Tips

- Use specific keywords: "react testing" vs just "testing"
- Try alternative terms: "deploy", "deployment", "ci-cd"
- Check popular sources: `vercel-labs/agent-skills`, `ComposioHQ/awesome-claude-skills`

## No Skills Found?

If no matching skill exists, I can help you directly with the task. You can also create your own skill:

```bash
npx skills init my-skill-name
```

## Learn More

- **Skills CLI Docs:** https://skills.sh/
- **Create Your Own Skill:** https://skills.sh/docs/create

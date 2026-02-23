# Agent OS (AOS)

Agent OS is a simulated AI-powered Operating System running as a Node.js application. It provides a web-based "desktop" environment where users can manage files, interact with local and cloud-based Large Language Models (LLMs), dynamically install Agent Apps, and build visual agent workflows.

## Features

- **Web-Based Desktop Environment:** A fully interactive UI resembling a traditional OS desktop with windows, dragging, a taskbar, and icons.
- **AI App Store:** Browse and install simulated "Agent Apps" (such as Smart Search, AI Draw, AI Video, and system utilities) dynamically to your desktop.
- **API Key Manager:** Securely store and verify API keys for multiple providers (OpenAI, Anthropic, Google, Grok) within the OS simulated local storage.
- **Smart Search App:** A web search interface that features a real-time Execution Trace visualization panel, showing how the Kernel routes the request, decides between RAG and Web Search, and synthesizes the answer.
- **AI Flow App:** A visual, node-based graph editor (similar to ComfyUI/n8n) allowing users to chain different AI tasks. For example, piping an Ollama Chat output directly into an AI Draw node, with real-time job execution traces and inline image rendering.
- **Local Model First:** Built-in integration with Ollama to pull, manage, and chat with local models (llama3.1, etc.) without leaving the OS.
- **Agent Inspector:** A built-in security layer that intercepts the launch of any unverified external Agent App. It performs a simulated diagnostic scan (verifying memory bounds, system hooks, and network ports) to evaluate running risk before granting execution privileges, ensuring user safety.

## System Architecture

The "Kernel" of Agent OS handles complex background tasks and state management:

- **Model Router:** Intelligently evaluates prompt complexity and routes requests to the most appropriate model (e.g., Local Ollama for simple tasks, Claude 3.5 Sonnet or GPT-4o for complex tasks), with automatic fallback mechanisms.
- **Context Manager:** Manages conversation history using a hierarchical caching system (L1 memory cache, L2 summarization) and a Disk layer powered by vector databases (`vectordb`).
- **Agent Scheduler:** An asynchronous job queue that handles the execution of AI Flow graphs. It manages task dependencies, yields execution to prevent blocking, and saves JSON checkpoints to `.aos_state` to allow recovery.
- **Tool Registry:** Standardizes tools across the OS, providing an interface for apps to declare parameters and requirements for LLM function calling.
- **File System Manager:** Simulates an OS file system (`storage/system`, `storage/personal`) for reading/writing configurations, images, and user data.

### Security Model & Agent Inspector

Because Agent OS allows third-party (or LLM-generated) agents to run on your simulated desktop, it employs a strict **Launch Interception** loop:
1. **Universal Invocation Hook:** When an app is triggered from the Dock, Desktop, Search Palette, or Widgets, its execution is routed through `requestAppLaunch()`.
2. **Session Verification:** The OS checks `sessionStorage` to see if the agent has already been verified in the current runtime session.
3. **Risk Evaluation Dialog:** If unverified, the **Agent Inspector** interrupts the launch, displaying a deep diagnostic scan UI. It evaluates the app against its configured authorization tier (Tier 1 vs. Tier 3 restricted).
4. **Execution Gateway:** Once the scan clears, the user is presented with the underlying risk profile (e.g. green valid notice vs red strict warning). The user must explicitly click `Execute` to allow the agent to launch, successfully protecting the system from rogue agent execution.

## Getting Started

### Prerequisites

- **Node.js** (v18+ recommended)
- **Ollama** (optional, but highly recommended if you want to use local models)

### Installation

1. Clone the repository and navigate to the project directory.
2. Install the dependencies:
   ```bash
   npm install
   ```

### Running the OS

To start the Agent OS simulation, run:

```bash
npx ts-node src/index.ts
```

Then, open your web browser and navigate to:
```
```
http://localhost:3123
```

## Built With
- **Backend:** Node.js, Express, TypeScript, fs-extra
- **Frontend:** Vanilla HTML/CSS/JS, DOM-based Window Manager
- **AI Integration:** OpenAI, Anthropic, Google Generative AI, Ollama
- **Database:** LanceDB (`vectordb` package) for dense vector search

---

*Note: This is a simulation project demonstrating how an AI-native operational environment could be designed at the application layer.*

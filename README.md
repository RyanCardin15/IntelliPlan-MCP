# ✨ IntelliPlan MCP

<p align="center">
  <em>Your AI-powered Epic Planning Assistant for Cursor AI</em>
</p>

![IntelliPlan MCP Demo](IntelliPlanMCP_Demo.gif)

---

## 🚀 Transform Your Development Workflow

IntelliPlan is an intelligent task management system that seamlessly integrates with the Model Context Protocol (MCP) in Cursor AI and other compatible editors. It empowers you to organize your development process with a structured Epic → Task → Subtask hierarchy, all without leaving your coding environment.

## ✅ What Can IntelliPlan Do For You?

### Organize Complex Projects with Ease
- **Epic Creation & Management** - Break down complex projects into manageable high-level goals
- **Task & Subtask Organization** - Structure your work with clear parent-child relationships
- **Smart Dependencies** - Define and track relationships between work items

### Supercharge Development Planning
- **AI-Assisted Breakdown** - Automatically split complex tasks into manageable pieces
- **Smart Implementation Suggestions** - Get guidance on how to approach challenges
- **Complexity Analysis** - Understand the effort required before diving in

### Keep Your Team on Track
- **Progress Tracking** - Monitor completion status across all levels
- **Next Action Recommendations** - Always know what to work on next
- **Contextual Understanding** - Get summaries that capture the full scope of work

### Seamless Editor Integration
- **Natural Language Interface** - Interact with IntelliPlan using conversational commands
- **Stay in Your Workflow** - No need to switch context between tools
- **MCP Protocol Support** - Works with any editor that implements the Model Context Protocol

## 📋 Available Tools

IntelliPlan provides a suite of powerful tools to manage your development process:

| Tool | Description |
|------|-------------|
| `batchEpic` | Creates a complete Epic with multiple tasks, each potentially having multiple subtasks, in a single operation. |
| `createEpic` | Creates a new Epic (top-level task) with planning details and optional initial Task creation. |
| `executeItem` | Executes or provides guidance for executing an Epic or Task. |
| `expandTask` | Breaks down a task or epic into smaller, actionable sub-items. |
| `generatePlan` | Generates prompts/guidance for planning, analysis, or handling implementation changes. |
| `getEpicOverview` | Provides a detailed, easy-to-read overview of an Epic, its tasks, and related information. |
| `manageItems` | Manages Epics, Tasks, and Subtasks with various operations (create, update, delete, etc.). |
| `manageTaskStorage` | Manages the storage configuration and exports for Epics and Tasks. |
| `planEpic` | Interactively creates a detailed implementation plan with hierarchical tasks and subtasks through sequential thinking, guiding the agent through multiple steps of refinement. |

## 🎮 Usage Examples

```
# Set up your project storage
@IntelliPlanMCP manageItems action=configure basePath="/path/to/your/project"

# Create a new epic
@IntelliPlanMCP createEpic description="Build user authentication system with JWT"

# Add a task to your epic
@IntelliPlanMCP manageItems action=createTask epicId=your-epic-id description="Implement login endpoint"

# Get an overview of all your epics
@IntelliPlanMCP manageItems action=listEpics

# Generate an implementation plan for a task
@IntelliPlanMCP generatePlan planType=implementation taskId=your-task-id

# Create a complete epic with nested tasks in a single operation
@IntelliPlanMCP batchEpic description="Multi-tenant user authentication" basePath="/path/to/project" tasks=[...]
```

## 🛠️ Getting Started

1. **Install IntelliPlan**: 
   ```
   npm install
   npm run build
   ```

2. **Configure in Cursor**: Add to your `.cursor-settings.json`:
   ```json
   {
     "mcpServers": {
       "IntelliPlanMCP": {
         "command": "node",
         "args": ["path/to/dist/index.js"]
       }
     }
   }
   ```

3. **Enable & Start Planning**: Activate MCP in your editor settings and start organizing your development process!

## 🔍 Why IntelliPlan?

Unlike traditional task managers that live outside your development environment, IntelliPlan works right where you code. This integration eliminates context switching and keeps your planning tightly coupled with implementation.

IntelliPlan's AI capabilities go beyond simple task tracking - it understands the structure of your project and provides intelligent suggestions for implementation, testing strategies, and complexity analysis.

## 📄 License

MIT 
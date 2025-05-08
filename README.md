# ✨ IntelliPlan MCP

[![smithery badge](https://smithery.ai/badge/@RyanCardin15/intelliplan-mcp)](https://smithery.ai/server/@RyanCardin15/intelliplan-mcp)

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
| `createPlanningConfig` | Creates a JSON configuration file for the planEpic tool, allowing customization of planning steps and process. |
| `executeItem` | Executes or provides guidance for executing an Epic or Task. |
| `expandTask` | Breaks down a task or epic into smaller, actionable sub-items. |
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

# Create a complete epic with nested tasks in a single operation
@IntelliPlanMCP batchEpic description="Multi-tenant user authentication" basePath="/path/to/project" tasks=[...]

# Get an epic overview with specific diagram types
@IntelliPlanMCP getEpicOverview epicId=your-epic-id basePath="/path/to/project" diagramTypes=["progressPie", "dependencyGraph", "userJourney"]
```

## Available Diagrams 🚧

> **Note:** The diagram functionality is currently a Work In Progress (WIP) 🚧

The `getEpicOverview` tool supports various Mermaid diagram types to visualize your epic's structure and progress:

| Diagram Type | Description |
|-------------|-------------|
| `progressPie` | Circle chart showing completed vs remaining tasks |
| `dependencyGraph` | Network diagram of epic and task dependencies |
| `taskFlow` | Flow diagram organizing tasks by status with dependencies |
| `timeline` | Gantt chart showing task timeline and durations |
| `userJourney` | Progressive journey through task completion states |
| `blockDiagram` | Block diagram showing epic structure and task counts |
| `radarChart` | Bar chart showing task distribution by status |
| `kanbanBoard` | Kanban-style board visualization of task status |
| `sequenceDiagram` | Sequence diagram showing task interactions over time |
| `classDiagram` | UML-style class diagram showing epic structure relationships |

You can specify which diagrams to include using the `diagramTypes` parameter array. If not specified, all diagram types will be included when `includeDiagrams` is set to `true`.

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

## 📝 Customizing Planning Process

IntelliPlan supports customizable planning processes through JSON configuration files:

1. **Create Configuration Files**:
   You can place JSON configuration files anywhere in your project. The `config/planning/` directory is suggested for organization, but not required. See `config/sample-planning-config.json` for an example.

2. **Using the Configuration Builder**:
   IntelliPlan provides an interactive tool to create planning configurations:
   ```
   @IntelliPlanMCP createPlanningConfig currentStep=0
   ```
   
   This will guide you through a step-by-step process to define your custom planning steps.

3. **Direct Configuration Creation**:
   For more advanced users, you can create a configuration directly:
   ```
   @IntelliPlanMCP createDirectPlanningConfig name="Custom Plan" description="Your custom planning process" outputPath="config/your-config.json" steps=[...]
   ```

4. **Configuration Structure**:
   ```json
   {
     "id": "your-plan-id",
     "name": "Your Plan Name",
     "description": "Description of your planning process",
     "version": "1.0",
     "defaultMaxDepth": 3,
     "includeTestStrategy": true,
     "steps": [
       {
         "id": "step-id",
         "name": "Step Name",
         "description": "Step description",
         "order": 0,
         "instructions": ["Instruction 1", "Instruction 2"],
         "thinkingPrompts": ["Thinking prompt 1", "Thinking prompt 2"],
         "nextStepPrompt": "Guidance for the next step",
         "requiresPreviousStepData": false
       }
       // Additional steps...
     ]
   }
   ```

5. **Use Custom Configuration**:
   ```
   @IntelliPlanMCP planEpic description="Your project" configPath="full/path/to/your/config.json"
   ```

6. **LLM-Generated Configurations**:
   The configuration path doesn't have to point to an existing file. The language model can generate custom planning configurations on-the-fly based on your requirements. Simply ask the LLM to create a planning configuration for your specific needs, and it will generate the appropriate JSON configuration for your use case.

## 🔍 Why IntelliPlan?

Unlike traditional task managers that live outside your development environment, IntelliPlan works right where you code. This integration eliminates context switching and keeps your planning tightly coupled with implementation.

IntelliPlan's AI capabilities go beyond simple task tracking - it understands the structure of your project and provides intelligent suggestions for implementation, testing strategies, and complexity analysis.

## 📄 License

MIT

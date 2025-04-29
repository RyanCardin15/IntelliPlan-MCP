# IntelliPlan MCP

An AI-powered task management system integrated into the Model Context Protocol (MCP) for use with Cursor AI and other compatible editors.

## Key Features

- **Task Management**: Create, update, list, and delete tasks.
- **Task Breakdown**: Manage subtasks and dependencies.
- **Planning & Execution**: Set priorities, define steps/criteria, get execution guidance.
- **Contextual Information**: Get task overviews, suggestions for the next task, and verification status.
- **Storage**: Manage task data persistence (hidden/visible location).

## Setup & Usage (MCP)

1.  **Clone the Repository**: Get the project code onto your local machine.
2.  **Install Dependencies**: Navigate to the project directory in your terminal and run:
    ```bash
    npm install
    ```
3.  **Build the Project**: Compile the TypeScript code:
    ```bash
    npm run build
    ```
4.  **Configure MCP in your Editor** (e.g., Cursor):
    Add the following to your editor's MCP server configuration (e.g., in `.cursor-settings.json` or global settings):
    ```json
    {
      "mcpServers": {
        "IntelliPlanMCP": {
          "command": "node",
          "args": ["dist/index.js"]
        }
      }
    }
    ```

5.  **Enable MCP** in your editor's settings.
6.  **Use IntelliPlan**: Interact with the server using natural language within your editor (e.g., using `@IntelliPlanMCP` in Cursor chat):

    ```
    @IntelliPlanMCP Create a task: Implement user authentication using JWT.

    @IntelliPlanMCP What's the next task I should work on?

    @IntelliPlanMCP Show me the overview for task [task-id].
    ```

## Available Tools (Functionality Summary)

- `createTask`: Creates new tasks.
- `manageTask`: Handles updates, deletion, listing, subtasks, dependencies, and associated files.
- `executeTask`: Guides task execution.
- `generatePlan`: Helps plan tasks (implementation, complexity).
- `getTaskOverview`: Provides task details, suggests next steps, verifies completion.
- `expandTask`: Assists in breaking down tasks.
- `manageTaskStorage`: Configures where task data is saved.

## Task Storage System

IntelliPlan uses a structured storage approach:

```
intelliplan/              # Main folder (in the specified basePath)
└── tasks/                # Tasks subfolder
    ├── tasks.json        # Main tasks store with all tasks
    └── [task-id]/        # Individual task folder for each task
        └── task.json     # Individual task data
```

### Storage Configuration

The storage system requires explicit configuration before using any task-related operations. You must always specify the base path where tasks should be stored.

To configure storage, use the `manageTaskStorage` tool with the `basePath` parameter:

```javascript
// Set the storage location explicitly - REQUIRED
await mcpServer.invokeForModel({
  name: "mcp_task-orchestrator_manageTaskStorage",
  params: {
    action: "configure",
    basePath: "/path/to/storage/location" // MUST be specified explicitly
  }
});

// Check current storage info (also requires basePath)
await mcpServer.invokeForModel({
  name: "mcp_task-orchestrator_manageTaskStorage",
  params: {
    action: "getInfo",
    basePath: "/path/to/storage/location" // MUST be the same location used previously
  }
});
```

All task tools will automatically use the configured storage system. To export task information to markdown files:

```javascript
await mcpServer.invokeForModel({
  name: "mcp_task-orchestrator_manageTaskStorage",
  params: {
    action: "generateFiles",
    basePath: "/path/to/storage/location", // REQUIRED
    outputDirectory: "task-exports" // Optional, defaults to "task-exports"
  }
});
```

Note that the `basePath` parameter is required for all operations and must be consistent across calls to maintain access to the same tasks.

## Task Operations

(Document your other task operations here)

## License
MIT 
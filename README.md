# IntelliPlan MCP

An AI-powered task management system integrated into the Model Context Protocol (MCP) for use with Cursor AI and other compatible editors.

It uses an Epic -> Task -> Subtask hierarchy.

## Key Features

- **Epic Management**: Create, update, list, and delete Epics (high-level goals).
- **Task & Subtask Management**: Manage Tasks within Epics and Subtasks within Tasks.
- **Dependencies**: Define dependencies between Epics or Tasks.
- **Planning & Execution**: Set priorities, define details, get execution guidance.
- **Contextual Information**: Get overviews, suggestions for the next item, and verification status.
- **Storage**: Manage Epic/Task/Subtask data persistence.

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
6.  **Use IntelliPlan**: Interact with the server using natural language within your editor (e.g., using `@IntelliPlanMCP` in Cursor chat). You'll need to configure the storage location first.

    ```
    @IntelliPlanMCP manageItems action=configure basePath="/Users/yourname/projects/myproject"

    @IntelliPlanMCP createEpic description="Implement user authentication using JWT" basePath="/Users/yourname/projects/myproject"

    @IntelliPlanMCP manageItems action=createTask epicId=[epic-id] description="Implement Login Endpoint" basePath="/Users/yourname/projects/myproject"

    @IntelliPlanMCP manageItems action=listEpics basePath="/Users/yourname/projects/myproject"
    ```

## Available Tools (Functionality Summary)

- `createEpic`: Creates new Epics (top-level tasks).
- `manageItems`: Handles updates, deletion, listing of Epics, Tasks, and Subtasks, manages dependencies, and associated files.
- `executeItem`: Guides execution of Epics or Tasks.
- `generatePlan`: Helps plan Epics/Tasks (implementation, complexity). (Note: May need updates for new hierarchy)
- `getTaskOverview`: Provides Epic/Task details, suggests next steps. (Note: Needs significant updates for new hierarchy)
- `expandTask`: Assists in breaking down Epics/Tasks. (Note: Needs significant updates for new hierarchy)
- `manageTaskStorage`: Configures where Epic data is saved.

## Epic Storage System

IntelliPlan uses a structured storage approach:

```
[basePath]/                # User-specified base directory
└── intelliplan/          # Main folder
    └── epics/            # Epics subfolder
        ├── epics.json    # Index of all Epics
        └── [epic-id]/    # Individual folder for each Epic
            └── epic.json # Data for the Epic (including its Tasks and Subtasks)
```

### Storage Configuration

The storage system requires explicit configuration using the `manageTaskStorage` tool. You must always specify the `basePath` where Epics should be stored.

```javascript
// Configure the storage location - REQUIRED before other operations
await mcpServer.invokeForModel({
  name: "mcp_task-orchestrator_manageTaskStorage", // Tool name might change if file renamed
  params: {
    action: "configure",
    basePath: "/path/to/your/project" // MUST be specified explicitly
  }
});

// Check current storage info (also requires basePath)
await mcpServer.invokeForModel({
  name: "mcp_task-orchestrator_manageTaskStorage", // Tool name might change
  params: {
    action: "getInfo",
    basePath: "/path/to/your/project" // MUST be the same location
  }
});
```

All item-related tools (`createEpic`, `manageItems`, `executeItem`, etc.) now also require the `basePath` parameter to ensure they operate on the correct storage location.

```javascript
// Example: Listing Epics
await mcpServer.invokeForModel({
  name: "mcp_task-orchestrator_manageItems",
  params: {
    action: "listEpics",
    basePath: "/path/to/your/project" // REQUIRED
  }
});

// Example: Generating Markdown files (exports Epics)
await mcpServer.invokeForModel({
  name: "mcp_task-orchestrator_manageTaskStorage", // Tool name might change
  params: {
    action: "generateFiles",
    basePath: "/path/to/your/project", // REQUIRED
    outputDirectory: "epic-exports" // Optional, defaults to "task-exports" currently
  }
});
```

Note that the `basePath` parameter must be consistent across calls to maintain access to the same data.

## License
MIT 
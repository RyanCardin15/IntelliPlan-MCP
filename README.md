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

## License
MIT 
# IntelliPlan Source Reorganization Map

## Current Project Structure

### Tools
- `src/application/tools/*.ts` - Tool implementation files
  - batchEpicTool.ts
  - createEpicTool.ts
  - executeItemTool.ts
  - executeTaskTool.ts
  - expandTaskTool.ts
  - getEpicOverviewTool.ts
  - manageItemsTool.ts
  - manageTaskStorageTool.ts
  - planEpicTool.ts
  - planImplementationTool.ts
  - index.ts (exports)

### Interfaces/Types
- `src/domain/task/entities/Task.ts` - Core domain entities
  - Status, Priority types
  - AssociatedFile, Subtask, Task, Epic interfaces
  - EpicStore, TaskStore interfaces
- `src/domain/task/dtos/TaskDto.ts` - Data transfer objects
- `src/types/TaskTypes.ts` - General type definitions
- `src/application/schemas/commonSchemas.ts` - Zod schemas for validation

### Services
- `src/domain/task/services/EpicService.ts` - Epic management service
- `src/domain/task/repositories/EpicRepository.ts` - Repository interface
- `src/domain/task/repositories/TaskRepository.ts` - Repository interface
- `src/infrastructure/storage/TaskStorageService.ts` - Storage service
- `src/infrastructure/persistence/FileEpicRepository.ts` - Repository implementation
- `src/core/app.ts` - Application initialization

## Import Dependencies
- Most tools import from:
  - MCP SDK (`@modelcontextprotocol/sdk/server/mcp.js`)
  - Zod for validation (`zod`)
  - Common schemas (`../schemas/commonSchemas.js`)
  - Task entity types (`../../domain/task/entities/Task.js`)
  - Storage service (`../../infrastructure/storage/TaskStorageService.js`)
  - Epic service (`../../domain/task/services/EpicService.js`)

## Target File Categorization

### Tools/
- All current tool implementation files from `src/application/tools/`

### Interfaces/
- Task entity types from `src/domain/task/entities/Task.ts`
- DTOs from `src/domain/task/dtos/`
- General types from `src/types/`
- Schema definitions from `src/application/schemas/`

### Services/
- Epic service from `src/domain/task/services/`
- Storage service from `src/infrastructure/storage/`
- Repository implementations from `src/infrastructure/persistence/`

### Utils/
- Any utility functions found throughout the code

### Config
- Create a central configuration file to manage settings

## Tool Naming
- PascalCase for tool names
- Descriptive, action-based naming
- No "Tool" suffix (unlike current implementation)
- Examples: `BatchEpic.ts`, `CreateEpic.ts`, `ExecuteItem.ts`

## Interface Naming
- PascalCase for interface names
- `I` prefix for interfaces (common in some TypeScript projects)
- Clear purpose-based naming
- Examples: `IEpic.ts`, `ITask.ts`, `ISubtask.ts`

## Service Naming
- PascalCase for service class names
- `Service` suffix for service classes
- Descriptive of functionality
- Examples: `EpicService.ts`, `StorageService.ts`

## Utility Naming
- camelCase for utility functions
- Grouped by related functionality
- Examples: `fileUtils.ts`, `formatUtils.ts`

## Implementation Details

### Directory Structure
The following directories have been created:

```
src/
  Tools/       - For all tool implementation files
  Interfaces/  - For all interface and type definitions
  Services/    - For all service implementations
  utils/       - For utility functions
  config.ts    - Central configuration file
```

### File Naming Patterns

1. **Tools/** directory:
   - PascalCase filenames
   - Verb+Noun naming (action-based)
   - No suffix
   - Examples: `CreateEpic.ts`, `ExecuteTask.ts`, `ManageItems.ts`

2. **Interfaces/** directory:
   - PascalCase with 'I' prefix
   - Noun-based names reflecting the entity
   - Examples: `IEpic.ts`, `ITask.ts`, `ISubtask.ts`

3. **Services/** directory:
   - PascalCase
   - 'Service' or 'Repository' suffix based on responsibility
   - Examples: `EpicService.ts`, `TaskStorageService.ts`

4. **Utils/** directory:
   - camelCase
   - Functionality grouping with 'Utils' suffix
   - Examples: `fileUtils.ts`, `formatUtils.ts`

5. **Config file**:
   - Simple, lowercase: `config.ts`
   - Exports a default configuration object
   - Includes getter/setter functions

### Export Pattern
Each directory contains an `index.ts` file that re-exports all items from the directory to simplify imports.

## Target Structure (AzureDevOps pattern)

```
/src
  /Tools
    - BatchEpic.ts
    - CreateEpic.ts
    - ExecuteItem.ts
    - ExecuteTask.ts
    - ExpandTask.ts
    - GetEpicOverview.ts
    - ManageItems.ts
    - ManageTaskStorage.ts
    - PlanEpic.ts
    - PlanImplementation.ts
    - index.ts
  /Interfaces
    - IEpic.ts
    - ITask.ts
    - ISubtask.ts
    - ITaskDto.ts
    - ICommonSchemas.ts
    - ITaskTypes.ts
    - index.ts
  /Services
    - EpicService.ts
    - FileEpicRepository.ts
    - TaskRepository.ts
    - TaskStorageService.ts
    - index.ts
  /utils
    - fileUtils.ts
    - index.ts
  - config.ts
  - app.ts
  - index.ts
```

## File Migration Mappings

### Tools Directory

| Current File | New File |
|-------------|----------|
| src/application/tools/batchEpicTool.ts | src/Tools/BatchEpic.ts |
| src/application/tools/createEpicTool.ts | src/Tools/CreateEpic.ts |
| src/application/tools/executeItemTool.ts | src/Tools/ExecuteItem.ts |
| src/application/tools/executeTaskTool.ts | src/Tools/ExecuteTask.ts |
| src/application/tools/expandTaskTool.ts | src/Tools/ExpandTask.ts |
| src/application/tools/getEpicOverviewTool.ts | src/Tools/GetEpicOverview.ts |
| src/application/tools/manageItemsTool.ts | src/Tools/ManageItems.ts |
| src/application/tools/manageTaskStorageTool.ts | src/Tools/ManageTaskStorage.ts |
| src/application/tools/planEpicTool.ts | src/Tools/PlanEpic.ts |
| src/application/tools/planImplementationTool.ts | src/Tools/PlanImplementation.ts |
| src/application/tools/index.ts | src/Tools/index.ts |

### Interfaces Directory

| Current File | New File |
|-------------|----------|
| src/types/TaskTypes.ts | src/Interfaces/ITaskTypes.ts |
| src/domain/task/dtos/TaskDto.ts | src/Interfaces/ITaskDto.ts |
| src/domain/task/entities/Task.ts | src/Interfaces/IEpic.ts & src/Interfaces/ITask.ts |
| src/application/schemas/commonSchemas.ts | src/Interfaces/ICommonSchemas.ts |
| N/A | src/Interfaces/ISubtask.ts (new file for storage interfaces) |

### Services Directory

| Current File | New File |
|-------------|----------|
| src/core/app.ts | src/Services/app.ts |
| src/domain/task/services/EpicService.ts | src/Services/EpicService.ts |
| src/domain/task/repositories/EpicRepository.ts | src/Services/EpicService.ts (merged) |
| src/domain/task/repositories/TaskRepository.ts | src/Services/TaskRepository.ts |
| src/infrastructure/persistence/FileEpicRepository.ts | src/Services/FileEpicRepository.ts |
| src/infrastructure/storage/TaskStorageService.ts | src/Services/TaskStorageService.ts |

### Config File

A new config.ts file will be created with configuration settings extracted from various files.

### Main Index

The main src/index.ts file will be updated to use the new imports.

## Next Steps

1. Create the directory structure
2. Migrate files according to this mapping
3. Update import paths
4. Create config.ts
5. Test build and functionality 
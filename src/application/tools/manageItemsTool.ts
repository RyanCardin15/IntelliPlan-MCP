import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { 
    descriptionSchema, 
    prioritySchema,
    taskIdSchema,
    subtaskIdSchema,
    taskStatusSchema,
    subtaskStatusSchema,
    complexitySchema
} from "../schemas/commonSchemas.js";
// Import necessary functions/types...
import { 
    getEpics, 
    getEpicById, 
    getTaskById, 
    getSubtaskById,
    updateEpicStore, 
    deleteEpicFromStore,
    addEpic, // Used by EpicService, maybe not directly needed here?
    saveEpics,
    configureStorage,
    loadEpics
    // Removed imports for functions not directly in TaskStorageService 
    // addTaskToEpic, updateTaskInEpic, deleteTaskFromEpic, addSubtaskToTask, 
    // updateSubtaskInTask, deleteSubtaskFromTask, addFileToEpic, removeFileFromEpic,
    // addEpicDependency, removeEpicDependency
} from "../../infrastructure/storage/TaskStorageService.js";
import type { Epic, Task, Subtask, AssociatedFile, Status, Priority } from "../../domain/task/entities/Task.js";
import { v4 as uuidv4 } from 'uuid';

// Define IDs more clearly
const epicIdSchema = z.string().uuid().describe("ID of the target Epic");
const taskIdSchemaRevised = z.string().uuid().describe("ID of the target Task within an Epic");
const subtaskIdSchemaRevised = z.string().uuid().describe("ID of the target Subtask within a Task");

// Refined Action Schema
const manageItemActionSchema = z.enum([
    // Epic Level
    'listEpics', 
    'updateEpic', 
    'deleteEpic', 
    'addEpicDependency', 
    'removeEpicDependency',
    'addFileToEpic',
    'removeFileFromEpic',
    // Task Level
    'createTask',       // Creates a Task within an Epic
    'updateTask', 
    'deleteTask', 
    'addTaskDependency',  // Task dependency (might depend on Task or Epic)
    'removeTaskDependency',
    'addFileToTask',
    'removeFileFromTask',
    // Subtask Level
    'createSubtask',    // Creates a Subtask within a Task
    'updateSubtask', 
    'deleteSubtask'
]);

// Refined Parameter Schema
const manageItemSchema = z.object({
    action: manageItemActionSchema.describe("Management action to perform (required)"),
    basePath: z.string().describe("FULL directory path for storage (required, e.g., '/path/to/storage')"),
    
    // Identifiers (conditionally required based on action)
    epicId: epicIdSchema.optional(),
    taskId: taskIdSchemaRevised.optional(),
    subtaskId: subtaskIdSchemaRevised.optional(),
    
    // Data Payloads (conditionally required)
    description: descriptionSchema.optional(),
    status: taskStatusSchema.optional().describe("Status (for updateEpic, updateTask)"), // Use existing schema, maps to Status type
    subtaskStatus: subtaskStatusSchema.optional().describe("Status (for updateSubtask)"), // Use existing schema
    priority: prioritySchema.optional(),
    complexity: complexitySchema.optional(),
    details: z.string().optional().describe("Detailed implementation notes (for updateEpic, updateTask)"),
    dependsOn: z.string().uuid().optional().describe("Dependency ID (Epic ID or Task ID)"),
    filePath: z.string().optional().describe("File path (for addFile.../removeFile... actions)"),
    fileDescription: descriptionSchema.optional().describe("File description (for addFile... actions)"),
    requireFileAssociation: z.boolean().optional().default(true).describe("Whether to require file associations for completed items"),
    
    // Filters
    statusFilter: taskStatusSchema.optional().describe("Filter by status (for listEpics action)"),
});

type ManageItemParams = z.infer<typeof manageItemSchema>;

// Helper to create the standard response structure
function createTextResponse(text: string, isError: boolean = false) {
    return {
        content: [{ type: "text" as const, text }],
        isError: isError
    };
}

export function registerManageItemsTool(server: McpServer): void {
    server.tool(
        "manageItems",
        "Manages Epics, Tasks, and Subtasks.",
        {
            action: manageItemActionSchema,
            basePath: z.string().describe("FULL directory path for storage (required, e.g., '/path/to/storage')"),
            epicId: epicIdSchema.optional(),
            taskId: taskIdSchemaRevised.optional(),
            subtaskId: subtaskIdSchemaRevised.optional(),
            description: descriptionSchema.optional(),
            status: taskStatusSchema.optional(),
            subtaskStatus: subtaskStatusSchema.optional(),
            priority: prioritySchema.optional(),
            complexity: complexitySchema.optional(),
            details: z.string().optional(),
            dependsOn: z.string().uuid().optional(),
            filePath: z.string().optional(),
            fileDescription: descriptionSchema.optional(),
            requireFileAssociation: z.boolean().optional().default(true),
            statusFilter: taskStatusSchema.optional(),
        },
        async (params: ManageItemParams) => {
            const { 
                action, 
                basePath, 
                epicId, 
                taskId, 
                subtaskId,
                description, status, subtaskStatus, priority, complexity, details, dependsOn, filePath, fileDescription, 
                requireFileAssociation = true,
                statusFilter
            } = params;

            if (!basePath) {
                 return { content: [{ type: "text", text: "Error: 'basePath' parameter is required." }], isError: true };
            }

            // Configure storage and load data for every action
            try {
                configureStorage(basePath);
                await loadEpics();
            } catch (error: any) {
                return { content: [{ type: "text", text: `Error accessing storage: ${error.message}` }], isError: true };
            }

            try {
                let result: any = { success: false, message: "Action not fully implemented or failed." }; // Default result

                switch (action) {
                    // --- Epic Actions --- 
                    case 'listEpics': {
                        let epics = getEpics();
                        if (statusFilter) {
                            epics = epics.filter(e => e.status === statusFilter);
                        }
                        if (epics.length === 0) {
                            result = { success: true, message: "No Epics found" + (statusFilter ? ` with status '${statusFilter}'.` : ".") };
                        } else {
                            const epicList = epics.map(e => 
                                `- ${e.id.substring(0,8)} [${e.status}] (${e.tasks.length} tasks): ${e.description.split('\n')[0]}`
                            ).join('\n');
                            result = { success: true, message: "Epics:\n" + epicList };
                        }
                        break;
                    }
                    case 'updateEpic': {
                        if (!epicId) throw new Error("epicId is required for updateEpic");
                        // Construct updates object carefully
                        const updates: Partial<Epic> = {};
                        if (description) updates.description = description;
                        if (status) updates.status = status as Status;
                        if (priority) updates.priority = priority;
                        if (complexity) updates.complexity = complexity;
                        // ... add other updatable fields ...
                        
                        if (Object.keys(updates).length === 0) {
                             result = { success: true, message: `No update parameters provided for Epic ${epicId}.` };
                             break;
                        }
                        
                        const epic = getEpicById(epicId);
                        if (!epic) throw new Error(`Epic ${epicId} not found.`);
                        
                        // Check if completing without files
                        if (requireFileAssociation && status === 'done' && 
                            epic.status !== 'done' && (!epic.files || epic.files.length === 0)) {
                            throw new Error(`Cannot mark Epic ${epicId} as complete without associated files. Add files first using addFileToEpic.`);
                        }
                        
                        const updatedEpic = { ...epic, ...updates, updatedAt: new Date().toISOString() };
                        const success = updateEpicStore(epicId, updatedEpic);
                        if (success) {
                            await saveEpics();
                            result = { success: true, message: `Epic ${epicId} updated.` };
                        } else {
                             throw new Error(`Failed to update Epic ${epicId} in store.`);
                        }
                        break;
                    }
                     case 'deleteEpic': {
                        if (!epicId) throw new Error("epicId is required for deleteEpic");
                        const success = deleteEpicFromStore(epicId);
                         if (success) {
                            await saveEpics();
                            result = { success: true, message: `Epic ${epicId} deleted.` };
                        } else {
                             throw new Error(`Epic ${epicId} not found or could not be deleted.`);
                        }
                        break;
                    }
                    case 'addEpicDependency': {
                        if (!epicId || !dependsOn) throw new Error("epicId and dependsOn (Epic ID) are required.");
                        // Basic implementation - needs TaskService equivalent
                        const epic = getEpicById(epicId);
                        const depEpic = getEpicById(dependsOn);
                        if (!epic || !depEpic) throw new Error("One or both Epics not found.");
                        if (!epic.dependencies) epic.dependencies = [];
                        if (!epic.dependencies.includes(dependsOn)) {
                            epic.dependencies.push(dependsOn);
                            updateEpicStore(epicId, epic);
                            await saveEpics();
                            result = { success: true, message: `Added dependency ${dependsOn} to Epic ${epicId}.` };
                        } else {
                            result = { success: true, message: `Dependency already exists.` };
                        }
                        break;
                    }
                    case 'addFileToEpic': {
                        if (!epicId || !filePath) throw new Error("epicId and filePath are required for addFileToEpic");
                        const epic = getEpicById(epicId);
                        if (!epic) throw new Error(`Epic ${epicId} not found.`);
                        
                        // Check if file already exists
                        if (epic.files.some(f => f.filePath === filePath)) {
                            result = { success: true, message: `File ${filePath} already associated with Epic ${epicId}.` };
                            break;
                        }
                        
                        const newFile: AssociatedFile = {
                            filePath,
                            description: fileDescription,
                            addedAt: new Date().toISOString()
                        };
                        
                        epic.files.push(newFile);
                        const success = updateEpicStore(epicId, epic);
                        if (success) {
                            await saveEpics();
                            result = { success: true, message: `File ${filePath} added to Epic ${epicId}.` };
                        } else {
                            throw new Error(`Failed to add file to Epic ${epicId}.`);
                        }
                        break;
                    }
                    
                    case 'removeFileFromEpic': {
                        if (!epicId || !filePath) throw new Error("epicId and filePath are required for removeFileFromEpic");
                        const epic = getEpicById(epicId);
                        if (!epic) throw new Error(`Epic ${epicId} not found.`);
                        
                        const initialLength = epic.files.length;
                        epic.files = epic.files.filter(f => f.filePath !== filePath);
                        
                        if (epic.files.length < initialLength) {
                            const success = updateEpicStore(epicId, epic);
                            if (success) {
                                await saveEpics();
                                result = { success: true, message: `File ${filePath} removed from Epic ${epicId}.` };
                            } else {
                                throw new Error(`Failed to update Epic ${epicId}.`);
                            }
                        } else {
                            result = { success: true, message: `File ${filePath} not found in Epic ${epicId}.` };
                        }
                        break;
                    }
                    
                    case 'addFileToTask': {
                        if (!epicId || !taskId || !filePath) throw new Error("epicId, taskId, and filePath are required for addFileToTask");
                        const epic = getEpicById(epicId);
                        if (!epic) throw new Error(`Epic ${epicId} not found.`);
                        const taskIndex = epic.tasks.findIndex(t => t.id === taskId);
                        if (taskIndex === -1) throw new Error(`Task ${taskId} not found in Epic ${epicId}.`);
                        
                        // Check if file already exists
                        if (epic.tasks[taskIndex].files.some(f => f.filePath === filePath)) {
                            result = { success: true, message: `File ${filePath} already associated with Task ${taskId}.` };
                            break;
                        }
                        
                        const newFile: AssociatedFile = {
                            filePath,
                            description: fileDescription,
                            addedAt: new Date().toISOString()
                        };
                        
                        epic.tasks[taskIndex].files.push(newFile);
                        const success = updateEpicStore(epicId, epic);
                        if (success) {
                            await saveEpics();
                            result = { success: true, message: `File ${filePath} added to Task ${taskId}.` };
                        } else {
                            throw new Error(`Failed to add file to Task ${taskId}.`);
                        }
                        break;
                    }
                    
                    case 'removeFileFromTask': {
                        if (!epicId || !taskId || !filePath) throw new Error("epicId, taskId, and filePath are required for removeFileFromTask");
                        const epic = getEpicById(epicId);
                        if (!epic) throw new Error(`Epic ${epicId} not found.`);
                        const taskIndex = epic.tasks.findIndex(t => t.id === taskId);
                        if (taskIndex === -1) throw new Error(`Task ${taskId} not found in Epic ${epicId}.`);
                        
                        const initialLength = epic.tasks[taskIndex].files.length;
                        epic.tasks[taskIndex].files = epic.tasks[taskIndex].files.filter(f => f.filePath !== filePath);
                        
                        if (epic.tasks[taskIndex].files.length < initialLength) {
                            const success = updateEpicStore(epicId, epic);
                            if (success) {
                                await saveEpics();
                                result = { success: true, message: `File ${filePath} removed from Task ${taskId}.` };
                            } else {
                                throw new Error(`Failed to update Task ${taskId}.`);
                            }
                        } else {
                            result = { success: true, message: `File ${filePath} not found in Task ${taskId}.` };
                        }
                        break;
                    }

                    // --- Task Actions --- 
                    case 'createTask': {
                        if (!epicId || !description) throw new Error("epicId and description are required for createTask");
                        const epic = getEpicById(epicId);
                        if (!epic) throw new Error(`Epic ${epicId} not found.`);
                        
                        const now = new Date().toISOString();
                        const newTask: Task = {
                            id: uuidv4(),
                            description,
                            status: 'todo',
                            priority: priority || undefined,
                            createdAt: now,
                            updatedAt: now,
                            files: [],
                            subtasks: [],
                            complexity: complexity || undefined,
                            // ... other fields
                        };
                        epic.tasks.push(newTask);
                        const success = updateEpicStore(epicId, epic);
                        if (success) {
                             await saveEpics();
                             result = { success: true, message: `Task added to Epic ${epicId} with ID ${newTask.id}.` };
                        } else {
                             throw new Error(`Failed to add Task to Epic ${epicId}.`);
                        }
                        break;
                    }
                    case 'updateTask': { 
                        if (!epicId || !taskId) throw new Error("epicId and taskId are required for updateTask");
                        const epic = getEpicById(epicId);
                        if (!epic) throw new Error(`Epic ${epicId} not found.`);
                        const taskIndex = epic.tasks.findIndex(t => t.id === taskId);
                        if (taskIndex === -1) throw new Error(`Task ${taskId} not found in Epic ${epicId}.`);
                        
                        const updates: Partial<Task> = {};
                        if (description) updates.description = description;
                        if (status) updates.status = status as Status;
                        if (priority) updates.priority = priority;
                        if (complexity) updates.complexity = complexity;
                        // ... other updatable fields ...

                        if (Object.keys(updates).length === 0) {
                             result = { success: true, message: `No update parameters provided for Task ${taskId}.` };
                             break;
                        }
                        
                        // Check if completing without files
                        if (requireFileAssociation && status === 'done' && 
                            epic.tasks[taskIndex].status !== 'done' && 
                            (!epic.tasks[taskIndex].files || epic.tasks[taskIndex].files.length === 0)) {
                            throw new Error(`Cannot mark Task ${taskId} as complete without associated files. Add files first using addFileToTask.`);
                        }

                        const updatedTask = { ...epic.tasks[taskIndex], ...updates, updatedAt: new Date().toISOString() };
                        epic.tasks[taskIndex] = updatedTask;
                        const success = updateEpicStore(epicId, epic);
                         if (success) {
                             await saveEpics();
                             result = { success: true, message: `Task ${taskId} updated.` };
                        } else {
                             throw new Error(`Failed to update Task ${taskId}.`);
                        }
                        break;
                    }
                     case 'deleteTask': {
                        if (!epicId || !taskId) throw new Error("epicId and taskId are required for deleteTask");
                        const epic = getEpicById(epicId);
                        if (!epic) throw new Error(`Epic ${epicId} not found.`);
                        const initialLength = epic.tasks.length;
                        epic.tasks = epic.tasks.filter(t => t.id !== taskId);
                         if (epic.tasks.length < initialLength) {
                             updateEpicStore(epicId, epic);
                             await saveEpics();
                             result = { success: true, message: `Task ${taskId} deleted from Epic ${epicId}.` };
                        } else {
                             throw new Error(`Task ${taskId} not found in Epic ${epicId}.`);
                        }
                        break;
                    }
                    // ... Implement addTaskDependency, removeTaskDependency, addFileToTask, removeFileFromTask ...

                    // --- Subtask Actions --- 
                    case 'createSubtask': {
                        if (!epicId || !taskId || !description) throw new Error("epicId, taskId, and description are required for createSubtask");
                        const epic = getEpicById(epicId);
                        if (!epic) throw new Error(`Epic ${epicId} not found.`);
                        const task = epic.tasks.find(t => t.id === taskId);
                        if (!task) throw new Error(`Task ${taskId} not found in Epic ${epicId}.`);
                        
                        const now = new Date().toISOString();
                        const newSubtask: Subtask = {
                            id: uuidv4(),
                            description,
                            status: 'todo', // Subtasks start as todo
                            createdAt: now
                        };
                        task.subtasks.push(newSubtask);
                        const success = updateEpicStore(epicId, epic);
                         if (success) {
                             await saveEpics();
                             result = { success: true, message: `Subtask added to Task ${taskId} with ID ${newSubtask.id}.` };
                        } else {
                             throw new Error(`Failed to add Subtask to Task ${taskId}.`);
                        }
                        break;
                    }
                    case 'updateSubtask': { 
                        if (!epicId || !taskId || !subtaskId) throw new Error("epicId, taskId, and subtaskId are required for updateSubtask");
                        const epic = getEpicById(epicId);
                        if (!epic) throw new Error(`Epic ${epicId} not found.`);
                        const task = epic.tasks.find(t => t.id === taskId);
                        if (!task) throw new Error(`Task ${taskId} not found in Epic ${epicId}.`);
                        const subtaskIndex = task.subtasks.findIndex(s => s.id === subtaskId);
                        if (subtaskIndex === -1) throw new Error(`Subtask ${subtaskId} not found in Task ${taskId}.`);
                        
                        const updates: Partial<Subtask> = {};
                        if (description) updates.description = description;
                        if (subtaskStatus) updates.status = subtaskStatus; 

                        if (Object.keys(updates).length === 0) {
                             result = { success: true, message: `No update parameters provided for Subtask ${subtaskId}.` };
                             break;
                        }

                        const updatedSubtask = { ...task.subtasks[subtaskIndex], ...updates };
                        task.subtasks[subtaskIndex] = updatedSubtask;
                        const success = updateEpicStore(epicId, epic);
                         if (success) {
                             await saveEpics();
                             result = { success: true, message: `Subtask ${subtaskId} updated.` };
                        } else {
                             throw new Error(`Failed to update Subtask ${subtaskId}.`);
                        }
                        break;
                    }
                     case 'deleteSubtask': {
                        if (!epicId || !taskId || !subtaskId) throw new Error("epicId, taskId, and subtaskId are required for deleteSubtask");
                         const epic = getEpicById(epicId);
                        if (!epic) throw new Error(`Epic ${epicId} not found.`);
                        const task = epic.tasks.find(t => t.id === taskId);
                        if (!task) throw new Error(`Task ${taskId} not found in Epic ${epicId}.`);
                        const initialLength = task.subtasks.length;
                        task.subtasks = task.subtasks.filter(s => s.id !== subtaskId);
                         if (task.subtasks.length < initialLength) {
                             updateEpicStore(epicId, epic);
                             await saveEpics();
                             result = { success: true, message: `Subtask ${subtaskId} deleted from Task ${taskId}.` };
                        } else {
                             throw new Error(`Subtask ${subtaskId} not found in Task ${taskId}.`);
                        }
                        break;
                    }
                }

                return createTextResponse(result.message, !result.success);
            } catch (error: any) {
                return createTextResponse(`Error: ${error.message}`, true);
            }
        }
    );
}
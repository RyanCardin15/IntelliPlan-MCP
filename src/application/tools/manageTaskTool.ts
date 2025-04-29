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
    getTasks, 
    getTaskById, 
    updateTaskStore, 
    deleteTaskFromStore, 
    saveTasks 
} from "../../infrastructure/storage/TaskStorageService.js";
import type { Task, Subtask, TaskFile } from "../../types/TaskTypes.js";
import { v4 as uuidv4 } from 'uuid';

const manageTaskActionSchema = z.enum([
    // Task level
    'list', 
    'update', 
    'delete', 
    'addDependency', 
    'removeDependency', // New
    // Subtask level
    'createSubtask', 
    'updateSubtask', 
    'deleteSubtask', 
    // File level
    'addFile', 
    'removeFile', // New
    'listFiles'
]);

const manageTaskSchema = z.object({
    action: manageTaskActionSchema.describe("Management action to perform (required)"),
    // Identifiers (conditionally required)
    taskId: taskIdSchema.optional().describe("Task ID (for update, delete, dependency, subtask, file actions)"),
    parentTaskId: taskIdSchema.optional().describe("Parent Task ID (for subtask actions)"), // Note: Redundant if taskId implies parent?
    subtaskId: subtaskIdSchema.optional().describe("Subtask ID (for updateSubtask, deleteSubtask)"),
    // Data Payloads (conditionally required)
    description: descriptionSchema.optional().describe("Description text (for update, createSubtask, updateSubtask)"),
    status: taskStatusSchema.optional().describe("Task status (for update, list filter)"),
    subtaskStatus: subtaskStatusSchema.optional().describe("Subtask status (for updateSubtask)"),
    priority: prioritySchema.optional().describe("Priority level (for update)"),
    complexity: complexitySchema.optional().describe("Complexity score (for update)"),
    dependsOn: taskIdSchema.optional().describe("Dependency Task ID (for addDependency, removeDependency)"),
    filePath: z.string().optional().describe("File path (for addFile, removeFile)"),
    fileDescription: descriptionSchema.optional().describe("File description (for addFile)"),
    // Filters
    statusFilter: taskStatusSchema.optional().describe("Filter by status (for list action)"),
    // Note: For createSubtask with multiple, maybe add 'subtasks: z.array(descriptionSchema)'?
    // Explicitly add subtasks array for batch creation
    subtasks: z.array(z.string()).optional().describe("Array of subtask descriptions (for createSubtask action if creating multiple)")
});

type ManageTaskParams = z.infer<typeof manageTaskSchema>;

// Helper to create the standard response structure
function createTextResponse(text: string, isError: boolean = false) {
    return {
        content: [{ type: "text", text }],
        isError: isError
    };
}

export function registerManageTaskTool(server: McpServer): void {
    server.tool(
        "manageTask",
        "Manages tasks: lists, updates, deletes, subtasks, dependencies, files.",
        {
            action: manageTaskActionSchema.describe("Management action to perform (required)"),
            taskId: taskIdSchema.optional().describe("Task ID (for update, delete, dependency, subtask, file actions)"),
            parentTaskId: taskIdSchema.optional().describe("Parent Task ID (for subtask actions)"),
            subtaskId: subtaskIdSchema.optional().describe("Subtask ID (for updateSubtask, deleteSubtask)"),
            description: descriptionSchema.optional().describe("Description text (for update, createSubtask, updateSubtask)"),
            status: taskStatusSchema.optional().describe("Task status (for update, list filter)"),
            subtaskStatus: subtaskStatusSchema.optional().describe("Subtask status (for updateSubtask)"),
            priority: prioritySchema.optional().describe("Priority level (for update)"),
            complexity: complexitySchema.optional().describe("Complexity score (for update)"),
            dependsOn: taskIdSchema.optional().describe("Dependency Task ID (for addDependency, removeDependency)"),
            filePath: z.string().optional().describe("File path (for addFile, removeFile)"),
            fileDescription: descriptionSchema.optional().describe("File description (for addFile)"),
            statusFilter: taskStatusSchema.optional().describe("Filter by status (for list action)"),
            subtasks: z.array(z.string()).optional().describe("Array of subtask descriptions (for createSubtask action if creating multiple)")
        },
        async (params: ManageTaskParams) => {
            // Validate parameters using the schema inference
            const safeParams = manageTaskSchema.parse(params);
            const { 
                action, 
                taskId, 
                parentTaskId, 
                subtaskId, 
                description,
                status,
                subtaskStatus,
                priority,
                complexity,
                dependsOn,
                filePath,
                fileDescription,
                statusFilter,
                subtasks: subtaskDescriptions // Renamed for clarity
            } = safeParams;

            try {
                // Helper function for common task fetching/error handling
                const getTaskOrFail = (id: string | undefined, actionName: string): Task => {
                    if (!id) throw new Error(`taskId is required for action '${actionName}'.`);
                    const task = getTaskById(id);
                    if (!task) throw new Error(`Task ${id} not found.`);
                    return task;
                };
                 // Helper function for saving
                const saveOrFail = async (successMsg: string) => {
                    try {
                        await saveTasks();
                        // Explicitly return the expected structure
                        return { content: [{ type: "text" as const, text: successMsg }] }; 
                    } catch (error: any) {
                         throw new Error(`Operation successful but changes could not be saved permanently: ${error.message}`);
                    }
                };

                switch (action) {
                    // --- Task Level --- 
                    case 'list': {
                        let tasks = getTasks();
                        if (statusFilter) {
                            tasks = tasks.filter(task => task.status === statusFilter);
                        }
                        if (tasks.length === 0) {
                             // Explicit structure
                            return { content: [{ type: "text" as const, text: statusFilter ? `No tasks found with status '${statusFilter}'.` : "No tasks found." }] };
                        }
                        const taskListText = tasks
                            .map(task => `- ${task.id.substring(0, 8)} [${task.status}] (${task.subtasks.length} subtasks): ${task.description.split('\n')[0]}`)
                            .join("\n");
                        // Explicit structure
                        return { content: [{ type: "text" as const, text: `Tasks:\n${taskListText}` }] };
                    } // End 'list'

                    case 'update': {
                        const task = getTaskOrFail(taskId, action);
                        let updated = false;
                        const updatedFields: string[] = [];
                        const updatedTask = { ...task };

                        if (description !== undefined && task.description !== description) { updatedTask.description = description; updatedFields.push('description'); updated = true; }
                        if (status !== undefined && task.status !== status) { updatedTask.status = status; updatedFields.push('status'); updated = true; }
                        if (priority !== undefined && task.priority !== priority) { updatedTask.priority = priority; updatedFields.push('priority'); updated = true; }
                        if (complexity !== undefined && task.complexity !== complexity) { updatedTask.complexity = complexity; updatedFields.push('complexity'); updated = true; }
                        
                        if (updated) {
                            updatedTask.updatedAt = new Date().toISOString();
                            if (!updateTaskStore(taskId!, updatedTask)) throw new Error(`Failed to update task ${taskId} in store.`);
                            return await saveOrFail(`Updated ${updatedFields.join(', ')} for task ${taskId!}.`);
                        } else {
                             // Explicit structure
                            return { content: [{ type: "text" as const, text: `No changes provided for task ${taskId!}.` }] };
                        }
                    } // End 'update'

                    case 'delete': {
                        if (!taskId) throw new Error(`taskId is required for action '${action}'.`);
                        if (!deleteTaskFromStore(taskId)) throw new Error(`Task ${taskId} not found or could not be deleted.`);
                        return await saveOrFail(`Task ${taskId} deleted successfully.`);
                    } // End 'delete'

                    case 'addDependency': {
                        if (!dependsOn) throw new Error(`dependsOn (Task ID) is required for action '${action}'.`);
                        const task = getTaskOrFail(taskId, action);
                        const dependencyTask = getTaskById(dependsOn);
                        if (!dependencyTask) throw new Error(`Dependency task ${dependsOn} not found.`);
                        if (dependsOn === taskId) throw new Error(`Cannot add a task as a dependency to itself.`);
                        
                        const updatedTask = { ...task };
                        if (!updatedTask.dependencies) updatedTask.dependencies = [];
                        if (updatedTask.dependencies.includes(dependsOn)) 
                             // Explicit structure
                            return { content: [{ type: "text" as const, text: `Task ${taskId!} already depends on task ${dependsOn!}.` }] };
                        
                        updatedTask.dependencies.push(dependsOn);
                        updatedTask.updatedAt = new Date().toISOString();
                        if(!updateTaskStore(taskId!, updatedTask)) throw new Error(`Failed to update dependencies for task ${taskId}.`);
                        return await saveOrFail(`Added dependency: Task ${taskId!} now depends on ${dependsOn!}.`);
                    } // End 'addDependency'
                    
                     case 'removeDependency': { // New
                        if (!dependsOn) throw new Error(`dependsOn (Task ID) is required for action '${action}'.`);
                        const task = getTaskOrFail(taskId, action);
                         if (!task.dependencies || !task.dependencies.includes(dependsOn)) {
                              // Explicit structure
                             return { content: [{ type: "text" as const, text: `Task ${taskId!} does not depend on task ${dependsOn!}.` }] };
                         }
                        const updatedTask = { 
                            ...task, 
                            dependencies: task.dependencies.filter(dep => dep !== dependsOn),
                            updatedAt: new Date().toISOString()
                        };
                        if(!updateTaskStore(taskId!, updatedTask)) throw new Error(`Failed to remove dependency for task ${taskId}.`);
                        return await saveOrFail(`Removed dependency: Task ${taskId!} no longer depends on ${dependsOn!}.`);
                    } // End 'removeDependency'

                    // --- Subtask Level --- 
                    case 'createSubtask': {
                        const effectiveParentId = parentTaskId ?? taskId; // Allow using taskId as parent implicitly
                        const task = getTaskOrFail(effectiveParentId, action);
                        const now = new Date().toISOString();
                        let newSubtasks: Subtask[] = [];
                        
                        if (subtaskDescriptions && subtaskDescriptions.length > 0) {
                            // Batch creation
                             newSubtasks = subtaskDescriptions.map(desc => ({
                                id: uuidv4(),
                                description: desc,
                                status: 'todo',
                                createdAt: now,
                            }));
                        } else if (description) {
                            // Single creation
                            newSubtasks.push({
                                id: uuidv4(),
                                description: description,
                                status: 'todo',
                                createdAt: now,
                            });
                        } else {
                             throw new Error(`Either 'description' or 'subtasks' array is required for action '${action}'.`);
                        }
                        
                        const updatedTask = { 
                            ...task, 
                            subtasks: [...task.subtasks, ...newSubtasks], 
                            updatedAt: now 
                        }; 
                        if (!updateTaskStore(effectiveParentId!, updatedTask)) throw new Error(`Failed to add subtasks to task ${effectiveParentId}.`);
                         return await saveOrFail(`${newSubtasks.length} subtask(s) created under task ${effectiveParentId!}.`);
                    } // End 'createSubtask'
                    
                    case 'updateSubtask': {
                        const effectiveParentId = parentTaskId ?? taskId;
                        if (!subtaskId) throw new Error(`subtaskId is required for action '${action}'.`);
                        const task = getTaskOrFail(effectiveParentId, action);
                        
                        const subtaskIndex = task.subtasks.findIndex(st => st.id === subtaskId);
                        if (subtaskIndex === -1) throw new Error(`Subtask ${subtaskId} not found in task ${effectiveParentId}.`);
                        
                        let subtaskUpdated = false;
                        const updatedSubtask = { ...task.subtasks[subtaskIndex] }; 
                        if (description !== undefined && updatedSubtask.description !== description) { updatedSubtask.description = description; subtaskUpdated = true; }
                        if (subtaskStatus !== undefined && updatedSubtask.status !== subtaskStatus) { updatedSubtask.status = subtaskStatus; subtaskUpdated = true; }
                        
                        if (subtaskUpdated) {
                            const updatedSubtasks = [...task.subtasks]; 
                            updatedSubtasks[subtaskIndex] = updatedSubtask; 
                            const updatedTask = { ...task, subtasks: updatedSubtasks, updatedAt: new Date().toISOString() };
                             if (!updateTaskStore(effectiveParentId!, updatedTask)) throw new Error(`Failed to update subtask ${subtaskId}.`);
                            return await saveOrFail(`Subtask ${subtaskId} updated successfully.`);
                        } else {
                             // Explicit structure
                             return { content: [{ type: "text" as const, text: `No changes provided for subtask ${subtaskId!}.` }] };
                        }
                    } // End 'updateSubtask'
                    
                    case 'deleteSubtask': {
                         const effectiveParentId = parentTaskId ?? taskId;
                        if (!subtaskId) throw new Error(`subtaskId is required for action '${action}'.`);
                        const task = getTaskOrFail(effectiveParentId, action);

                        const initialLength = task.subtasks.length;
                        const updatedSubtasks = task.subtasks.filter(st => st.id !== subtaskId);
                        if (updatedSubtasks.length === initialLength) throw new Error(`Subtask ${subtaskId} not found in task ${effectiveParentId}.`);

                        const updatedTask = { ...task, subtasks: updatedSubtasks, updatedAt: new Date().toISOString() };
                        if (!updateTaskStore(effectiveParentId!, updatedTask)) throw new Error(`Failed to delete subtask ${subtaskId}.`);
                        return await saveOrFail(`Subtask ${subtaskId} deleted successfully.`);
                    } // End 'deleteSubtask'

                    // --- File Level --- 
                    case 'addFile': {
                         if (!filePath) throw new Error(`filePath is required for action '${action}'.`);
                        const task = getTaskOrFail(taskId, action);
                        if (task.files.some((f: TaskFile) => f.filePath === filePath)) {
                             // Explicit structure
                             return { content: [{ type: "text" as const, text: `File '${filePath!}' is already associated with task ${taskId!}.` }] };
                        }
                        const newFile: TaskFile = { filePath, description: fileDescription, addedAt: new Date().toISOString() };
                        const updatedTask = { ...task, files: [...task.files, newFile], updatedAt: new Date().toISOString() };
                        if (!updateTaskStore(taskId!, updatedTask)) throw new Error(`Failed to add file to task ${taskId}.`);
                        return await saveOrFail(`File '${filePath!}' added to task ${taskId!}.`);
                    } // End 'addFile'

                    case 'removeFile': { // New
                         if (!filePath) throw new Error(`filePath is required for action '${action}'.`);
                        const task = getTaskOrFail(taskId, action);
                        const initialFileCount = task.files.length;
                        const updatedFiles = task.files.filter(f => f.filePath !== filePath);
                        if (updatedFiles.length === initialFileCount) {
                             // Explicit structure
                            return { content: [{ type: "text" as const, text: `File '${filePath!}' is not associated with task ${taskId!}.` }] };
                        }
                        const updatedTask = { ...task, files: updatedFiles, updatedAt: new Date().toISOString() };
                        if (!updateTaskStore(taskId!, updatedTask)) throw new Error(`Failed to remove file from task ${taskId}.`);
                        return await saveOrFail(`File '${filePath!}' removed from task ${taskId!}.`);
                    } // End 'removeFile'

                    case 'listFiles': {
                        const task = getTaskOrFail(taskId, action);
                        if (task.files.length === 0) {
                             // Explicit structure
                            return { content: [{ type: "text" as const, text: `No files associated with task ${taskId!}.` }] };
                        }
                        const fileListText = task.files
                            .map((file: TaskFile) => `- ${file.filePath}${file.description ? `: ${file.description}` : ''}`)
                            .join("\n");
                        // Explicit structure
                        return { content: [{ type: "text" as const, text: `Files for task ${taskId!}:\n${fileListText}` }] };
                    } // End 'listFiles'

                    default:
                          // Explicit structure
                         return { 
                            content: [{ type: "text" as const, text: `Error: Unknown action '${action}'.` }],
                            isError: true 
                        };
                } // End switch

            } catch (error: any) {
                  // Explicit structure
                 return { 
                    content: [{ type: "text" as const, text: `Error processing action '${action}': ${error.message}` }],
                    isError: true 
                };
            }
        } // End async handler
    ); // End server.tool
} 
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { taskIdSchema } from "../schemas/commonSchemas.js"; // Keep generic ID schema for now
import { 
    getEpics, 
    getEpicById, 
    getTaskById, // This now returns { epic, task }
    updateEpicStore, 
    saveEpics,
    configureStorage,
    loadEpics
} from "../../infrastructure/storage/TaskStorageService.js";
import type { Epic, Task, Subtask, Status, Priority, AssociatedFile } from "../../domain/task/entities/Task.js";
import * as fs from 'fs/promises';
import * as path from 'path';

// Define IDs more clearly
const epicIdSchema = z.string().uuid().describe("ID of the target Epic");
const taskIdSchemaRevised = z.string().uuid().describe("ID of the target Task within an Epic");

const executeItemSchema = z.object({
    epicId: epicIdSchema.optional().describe("ID of the Epic containing the item to execute."),
    taskId: taskIdSchemaRevised.optional().describe("ID of the Task to execute. If omitted with epicId, suggests next Task in Epic. If both omitted, suggests next ready Epic/Task."),
    executionMode: z.enum(['auto', 'manual', 'subtasks']).optional().default('auto').describe("Execution mode (default: auto)"),
    markInProgress: z.boolean().optional().default(true).describe("Mark item in-progress on start (default: true)"),
    additionalContext: z.string().optional().describe("Additional context for execution"),
    documentFindings: z.boolean().optional().default(true).describe("Whether to document findings during execution (default: true)"),
    requireFileAssociation: z.boolean().optional().default(true).describe("Whether to require file associations after implementation (default: true)"),
    basePath: z.string().describe("FULL directory path for storage (required, e.g., '/path/to/storage')")
});

type ExecuteItemParams = z.infer<typeof executeItemSchema>;

// Helper function to get status emoji
function getStatusEmoji(status: Status): string {
    switch (status) {
        case 'done': return '✅';
        case 'in-progress': return '🚧';
        case 'todo': return '⏳';
        default: return '❓';
    }
}

// Helper function to format markdown checkbox for task status
function getStatusCheckbox(status: Status): string {
    return status === 'done' ? '[x]' : '[ ]';
}

// Helper function to find most relevant files for a task
async function findRelevantFiles(basePath: string, item: Epic | Task): Promise<string[]> {
    const relevantFiles: string[] = [];
    
    // First, include all files explicitly associated with the item
    if (item.files && item.files.length > 0) {
        relevantFiles.push(...item.files.map(file => file.filePath));
    }
    
    // Try to infer other relevant files from the description and implementation plan
    const searchTerms: string[] = [];
    
    // Extract potential file references from description and implementation plan
    const combinedText = `${item.description} ${item.implementationPlan || ''}`;
    
    // Look for file paths or extensions in the text
    const fileRegex = /\b[\w-]+\.(js|ts|jsx|tsx|html|css|json|md)\b/g;
    const extractedFiles = combinedText.match(fileRegex) || [];
    searchTerms.push(...extractedFiles);
    
    // Look for component/class names that might indicate file names
    const componentRegex = /\b([A-Z][a-zA-Z0-9]+)\b/g;
    const extractedComponents = combinedText.match(componentRegex) || [];
    searchTerms.push(...extractedComponents);
    
    // Function to search for a term in files
    const searchDirectory = async (dir: string, term: string, maxResults: number = 2): Promise<string[]> => {
        try {
            // Check if directory exists
            await fs.access(dir);
            
            // Get all files in directory
            const files = await fs.readdir(dir, { withFileTypes: true });
            const results: string[] = [];
            
            for (const file of files) {
                const fullPath = path.join(dir, file.name);
                
                if (file.isDirectory()) {
                    // Skip node_modules and other common exclude directories
                    if (['node_modules', '.git', 'dist', 'build'].includes(file.name)) {
                        continue;
                    }
                    // Recursively search subdirectories
                    const subResults = await searchDirectory(fullPath, term, maxResults - results.length);
                    results.push(...subResults);
                    if (results.length >= maxResults) break;
                } else if (file.name.includes(term) || file.name.toLowerCase().includes(term.toLowerCase())) {
                    // If the filename contains the term, add it
                    results.push(fullPath);
                    if (results.length >= maxResults) break;
                }
            }
            
            return results;
        } catch (e) {
            // Directory doesn't exist or can't be accessed
            return [];
        }
    };
    
    // Search for each term in the codebase
    for (const term of searchTerms) {
        if (term.length < 3) continue; // Skip very short terms
        const foundFiles = await searchDirectory(basePath, term);
        relevantFiles.push(...foundFiles);
        
        // Limit to a reasonable number of files
        if (relevantFiles.length >= 10) break;
    }
    
    // Remove duplicates and return
    return [...new Set(relevantFiles)];
}

// Helper function to check if a task is ready (dependencies satisfied)
function isTaskReady(task: Task, allEpics: Epic[]): boolean {
    if (!task.dependencies || task.dependencies.length === 0) return true;
    
    return task.dependencies.every(depId => {
        const depTask = getTaskById(depId);
        const depEpic = getEpicById(depId);
        return (depTask && depTask.task.status === 'done') || (depEpic && depEpic.status === 'done');
    });
}

// Helper function to check if an epic is ready (dependencies satisfied)
function isEpicReady(epic: Epic): boolean {
    if (!epic.dependencies || epic.dependencies.length === 0) return true;
    
    return epic.dependencies.every(depId => {
        const depEpic = getEpicById(depId);
        return depEpic && depEpic.status === 'done';
    });
}

// Helper function to find the next best task to work on
function findNextTask(allEpics: Epic[]): { epic: Epic, task: Task } | null {
    // Priority: in-progress tasks -> ready tasks with no blockers
    
    // 1. Check for in-progress tasks first
    for (const epic of allEpics) {
        if (epic.status !== 'done') {
            const inProgressTasks = epic.tasks.filter(t => t.status === 'in-progress');
            if (inProgressTasks.length > 0) {
                return { epic, task: inProgressTasks[0] };
            }
        }
    }
    
    // 2. Find tasks that are ready to be worked on (unblocked)
    for (const epic of allEpics) {
        if (epic.status !== 'done' && isEpicReady(epic)) {
            const readyTasks = epic.tasks.filter(t => t.status === 'todo' && isTaskReady(t, allEpics));
            if (readyTasks.length > 0) {
                // Sort by priority if available
                const sortedTasks = [...readyTasks].sort((a, b) => {
                    const priorityMap = { high: 0, medium: 1, low: 2 };
                    const priorityA = a.priority ? priorityMap[a.priority] : 3;
                    const priorityB = b.priority ? priorityMap[b.priority] : 3;
                    return priorityA - priorityB;
                });
                return { epic, task: sortedTasks[0] };
            }
        }
    }
    
    return null;
}

// Renamed registration function
export function registerExecuteItemTool(server: McpServer): void {
    server.tool(
        "executeItem", // Renamed tool
        "Executes or provides guidance for executing an Epic or Task.",
        {
             epicId: epicIdSchema.optional(),
             taskId: taskIdSchemaRevised.optional(),
             executionMode: z.enum(['auto', 'manual', 'subtasks']).optional().default('auto'),
             markInProgress: z.boolean().optional().default(true),
             additionalContext: z.string().optional(),
             documentFindings: z.boolean().optional().default(true),
             requireFileAssociation: z.boolean().optional().default(true),
             basePath: z.string().describe("FULL directory path for storage (required, e.g., '/path/to/storage')")
        },
        async (params: ExecuteItemParams) => {
            const { 
                epicId, 
                taskId, 
                executionMode = 'auto', 
                markInProgress = true, 
                additionalContext, 
                documentFindings = true,
                requireFileAssociation = true,
                basePath 
            } = params;
            
            let targetItemDescription = "";
            let suggestionMessage = "";

            if (!basePath) {
                 return { content: [{ type: "text", text: "Error: 'basePath' parameter is required." }], isError: true };
            }

            // Configure storage and load data
            try {
                configureStorage(basePath);
                await loadEpics();
            } catch (error: any) {
                return { content: [{ type: "text", text: `Error accessing storage: ${error.message}` }], isError: true };
            }

            let targetEpic: Epic | undefined;
            let targetTask: Task | undefined;
            let resolvedEpicId = epicId;
            let resolvedTaskId = taskId;
            let relevantFiles: string[] = [];

            // --- Determine Target Item --- 

            if (resolvedEpicId && resolvedTaskId) {
                // Specific Task provided
                const result = getTaskById(resolvedTaskId);
                if (!result || result.epic.id !== resolvedEpicId) {
                     return { content: [{ type: "text", text: `Error: Task ${resolvedTaskId} not found within Epic ${resolvedEpicId}.` }], isError: true };
                }
                targetEpic = result.epic;
                targetTask = result.task;
                targetItemDescription = `Task ${resolvedTaskId}`;
            } else if (resolvedEpicId && !resolvedTaskId) {
                // Epic provided, find next Task
                targetEpic = getEpicById(resolvedEpicId);
                if (!targetEpic) {
                    return { content: [{ type: "text", text: `Error: Epic ${resolvedEpicId} not found.` }], isError: true };
                }
                
                // Find next Task logic (simplified: first in-progress or first todo)
                targetTask = targetEpic.tasks.find(t => t.status === 'in-progress');
                
                if (!targetTask) {
                    // Find a ready task (no blockers)
                    targetTask = targetEpic.tasks.find(t => 
                        t.status === 'todo' && 
                        (!t.dependencies || t.dependencies.every(depId => {
                            const depTask = getTaskById(depId);
                            const depEpic = getEpicById(depId);
                            return (depTask?.task.status === 'done') || (depEpic?.status === 'done');
                        }))
                    );
                }
                
                if (!targetTask) {
                    return { content: [{ type: "text", text: `No executable Tasks found in Epic ${resolvedEpicId}.` }] };
                }
                
                resolvedTaskId = targetTask.id;
                suggestionMessage = `Suggested next Task in Epic ${targetEpic.description.split('\n')[0]}: `; 
                targetItemDescription = `Task: ${targetTask.description.split('\n')[0]}`;
            } else {
                // No IDs provided, find next best task across all epics
                const allEpics = getEpics();
                if (allEpics.length === 0) {
                    return { content: [{ type: "text", text: "No Epics found to suggest or execute." }] };
                }
                
                const nextBestTask = findNextTask(allEpics);
                
                if (nextBestTask) {
                    targetEpic = nextBestTask.epic;
                    targetTask = nextBestTask.task;
                    resolvedEpicId = targetEpic.id;
                    resolvedTaskId = targetTask.id;
                    
                    const statusEmoji = targetTask.status === 'in-progress' ? '🚧' : '🆕';
                    suggestionMessage = `${statusEmoji} Suggested next Task: `;
                    targetItemDescription = `${targetTask.description.split('\n')[0]}`;
                } else {
                    // Find a ready epic if no tasks are ready
                    targetEpic = allEpics.find(e => e.status !== 'done' && isEpicReady(e));
                    
                    if (!targetEpic) {
                        return { content: [{ type: "text", text: "No ready Epics or Tasks found. Try resolving dependencies first." }] };
                    }
                    
                    resolvedEpicId = targetEpic.id;
                    suggestionMessage = `🔍 Suggested Epic (no ready tasks found): `;
                    targetItemDescription = `${targetEpic.description.split('\n')[0]}`;
                }
            }
            
            // --- Execution Logic --- 

            if (!resolvedEpicId) {
                return { content: [{ type: "text", text: `Could not determine target Epic.` }], isError: true };
            }
            
            if (!targetEpic) targetEpic = getEpicById(resolvedEpicId);
            if (!targetEpic) return { content: [{ type: "text", text: `Target Epic ${resolvedEpicId} not found.` }], isError: true };

            let itemToExecute: Epic | Task = targetTask || targetEpic;
            let itemType = targetTask ? "Task" : "Epic";
            
            // Find relevant files for context
            relevantFiles = await findRelevantFiles(basePath, itemToExecute);

            // Mark as in-progress
            let markedInProgress = false;
            if (markInProgress && itemToExecute.status === 'todo') {
                itemToExecute.status = 'in-progress';
                itemToExecute.updatedAt = new Date().toISOString();
                if (targetTask && resolvedEpicId) {
                    // Need to update the Task within the Epic
                    const taskIndex = targetEpic.tasks.findIndex(t => t.id === resolvedTaskId);
                    if (taskIndex !== -1) {
                        targetEpic.tasks[taskIndex] = targetTask; // targetTask already has status updated
                        updateEpicStore(resolvedEpicId, targetEpic);
                        markedInProgress = true;
                    } 
                } else {
                     // Update the Epic directly
                     updateEpicStore(resolvedEpicId, targetEpic);
                     markedInProgress = true;
                }
                 if (markedInProgress) await saveEpics();
            }
            
            // --- Generate comprehensive response ---
            
            // 1. Top-level overview
            let responseText = suggestionMessage ? `${suggestionMessage}${targetItemDescription}\n\n` : "";
            responseText += `# 🚀 Execute: ${itemToExecute.description.split('\n')[0]}\n\n`;
            
            // 2. Item details section
            responseText += `## ℹ️ Item Details\n\n`;
            responseText += `**Type:** ${itemType}\n`;
            responseText += `**ID:** \`${itemToExecute.id}\`\n`;
            responseText += `**Status:** ${getStatusEmoji(itemToExecute.status)} ${itemToExecute.status.toUpperCase()}${markedInProgress ? ' (Just marked as in-progress)' : ''}\n`;
            
            if (itemToExecute.priority) {
                responseText += `**Priority:** ${itemToExecute.priority.toUpperCase()}\n`;
            }
            
            if (itemToExecute.complexity) {
                responseText += `**Complexity:** ${itemToExecute.complexity}/10\n`;
            }
            
            responseText += `**Created:** ${new Date(itemToExecute.createdAt).toLocaleString()}\n`;
            responseText += `**Last Updated:** ${new Date(itemToExecute.updatedAt).toLocaleString()}\n\n`;
            
            // 3. Full description
            responseText += `## 📝 Description\n\n${itemToExecute.description}\n\n`;
            
            // 4. Implementation plan if available
            if (itemToExecute.implementationPlan) {
                responseText += `## 📋 Implementation Plan\n\n${itemToExecute.implementationPlan}\n\n`;
            }
            
            // 5. Test strategy if available
            if (itemToExecute.testStrategy) {
                responseText += `## 🧪 Test Strategy\n\n${itemToExecute.testStrategy}\n\n`;
            }
            
            // 6. Epic context if executing a task
            if (targetTask && targetEpic) {
                responseText += `## 🔄 Epic Context\n\n`;
                responseText += `This task is part of Epic: **${targetEpic.description.split('\n')[0]}**\n\n`;
                
                if (targetEpic.implementationPlan) {
                    responseText += `**Epic Implementation Plan:** ${targetEpic.implementationPlan.split('\n')[0]}...\n\n`;
                }
                
                const completedTasks = targetEpic.tasks.filter(t => t.status === 'done').length;
                const totalTasks = targetEpic.tasks.length;
                responseText += `**Epic Progress:** ${completedTasks}/${totalTasks} tasks completed\n\n`;
                
                // Task dependencies
                if (targetTask.dependencies && targetTask.dependencies.length > 0) {
                    responseText += `**Task Dependencies:**\n\n`;
                    
                    targetTask.dependencies.forEach(depId => {
                        const depTask = getTaskById(depId);
                        const depEpic = getEpicById(depId);
                        
                        if (depTask) {
                            responseText += `- ${getStatusCheckbox(depTask.task.status)} ${getStatusEmoji(depTask.task.status)} Task: ${depTask.task.description.split('\n')[0]}\n`;
                        } else if (depEpic) {
                            responseText += `- ${getStatusCheckbox(depEpic.status)} ${getStatusEmoji(depEpic.status)} Epic: ${depEpic.description.split('\n')[0]}\n`;
                        } else {
                            responseText += `- ❓ Unknown dependency: ${depId}\n`;
                        }
                    });
                    
                    responseText += `\n`;
                }
            }
            
            // 7. Subtasks if available and in subtasks mode
            if (targetTask && targetTask.subtasks && targetTask.subtasks.length > 0) {
                responseText += `## ✅ Subtasks\n\n`;
                
                targetTask.subtasks.forEach(subtask => {
                    responseText += `- ${getStatusCheckbox(subtask.status)} ${subtask.status === 'done' ? '✅' : '⬜'} ${subtask.description}\n`;
                    responseText += `  *ID: ${subtask.id}*\n`;
                });
                
                responseText += `\n`;
            }
            
            // 8. Relevant files section
            if (relevantFiles.length > 0) {
                responseText += `## 📂 Relevant Files\n\n`;
                
                // First list explicitly associated files
                if (itemToExecute.files && itemToExecute.files.length > 0) {
                    responseText += `**Associated Files:**\n\n`;
                    itemToExecute.files.forEach(file => {
                        responseText += `- \`${file.filePath}\`${file.description ? `: ${file.description}` : ''}\n`;
                    });
                    responseText += `\n`;
                }
                
                // Then list inferred relevant files
                const inferredFiles = relevantFiles.filter(file => 
                    !itemToExecute.files || !itemToExecute.files.some(f => f.filePath === file)
                );
                
                if (inferredFiles.length > 0) {
                    if (itemToExecute.files && itemToExecute.files.length > 0) {
                        responseText += `**Other Potentially Relevant Files:**\n\n`;
                    } else {
                        responseText += `**Potentially Relevant Files:**\n\n`;
                    }
                    
                    inferredFiles.forEach(file => {
                        // Convert absolute path to relative path for better readability
                        const relativePath = path.relative(basePath, file);
                        responseText += `- \`${relativePath}\`\n`;
                    });
                    
                    responseText += `\n`;
                }
            }
            
            // 9. Execution instructions based on mode
            responseText += `## 🔧 Execution Instructions\n\n`;
            
            if (executionMode === 'auto') {
                responseText += `**Mode:** Automatic - Review details and proceed with implementation.\n\n`;
                
                if (targetTask && targetTask.subtasks && targetTask.subtasks.length > 0) {
                    responseText += `Focus on completing these subtasks in order:\n\n`;
                    targetTask.subtasks
                        .filter(s => s.status !== 'done')
                        .forEach((s, i) => {
                            responseText += `${i+1}. ${s.description}\n`;
                        });
                    responseText += `\n`;
                }
            } else if (executionMode === 'subtasks') {
                responseText += `**Mode:** Subtasks - Focus on completing the subtasks one by one.\n\n`;
                
                if (targetTask && targetTask.subtasks && targetTask.subtasks.length > 0) {
                    const pendingSubtasks = targetTask.subtasks.filter(s => s.status !== 'done');
                    const completedSubtasks = targetTask.subtasks.filter(s => s.status === 'done');
                    
                    if (pendingSubtasks.length > 0) {
                        responseText += `**Pending Subtasks (${pendingSubtasks.length}):**\n\n`;
                        pendingSubtasks.forEach((s, i) => {
                            responseText += `${i+1}. ${s.description} (ID: ${s.id})\n`;
                        });
                        responseText += `\n`;
                    }
                    
                    if (completedSubtasks.length > 0) {
                        responseText += `**Completed Subtasks (${completedSubtasks.length}):**\n\n`;
                        completedSubtasks.forEach((s, i) => {
                            responseText += `✅ ${s.description}\n`;
                        });
                        responseText += `\n`;
                    }
                } else {
                    responseText += `No subtasks found for this ${itemType}. Consider breaking it down first using the expandTask tool.\n\n`;
                }
            } else { // manual
                responseText += `**Mode:** Manual - Plan and execute the task based on the provided details.\n\n`;
                responseText += `1. Review the ${itemType} description and any related documentation\n`;
                responseText += `2. Analyze relevant files and understand the implementation context\n`;
                responseText += `3. Develop a solution approach based on the implementation plan\n`;
                responseText += `4. Execute the implementation, writing code and creating necessary files\n`;
                responseText += `5. Test your implementation according to the test strategy\n`;
                responseText += `6. Mark the ${itemType} as complete when finished\n\n`;
            }
            
            // 10. Update instructions section
            responseText += `## 📢 After Completion\n\n`;
            
            // Add file association requirement
            if (requireFileAssociation) {
                responseText += `### 📂 Required: Associate Files with this ${itemType}\n\n`;
                responseText += `After implementation, you must associate any modified or created files with this ${itemType}. This is crucial for maintaining traceability and documentation.\n\n`;

                if (itemToExecute.files && itemToExecute.files.length > 0) {
                    responseText += `**Currently Associated Files:**\n`;
                    itemToExecute.files.forEach(file => {
                        responseText += `- \`${file.filePath}\`${file.description ? `: ${file.description}` : ''}\n`;
                    });
                    responseText += `\n`;
                } else {
                    responseText += `**No files are currently associated with this ${itemType}.**\n\n`;
                }

                responseText += `To add a file to this ${itemType}:\n`;
                
                if (itemType === "Task") {
                    responseText += `\`\`\`\nmanageItems action=addFileToTask epicId=${resolvedEpicId} taskId=${resolvedTaskId} filePath="path/to/your/file.ts" fileDescription="Brief description of the file's purpose" basePath="${basePath}"\n\`\`\`\n\n`;
                } else {
                    responseText += `\`\`\`\nmanageItems action=addFileToEpic epicId=${resolvedEpicId} filePath="path/to/your/file.ts" fileDescription="Brief description of the file's purpose" basePath="${basePath}"\n\`\`\`\n\n`;
                }
            }
            
            responseText += `### ✅ Update Status\n\n`;
            responseText += `When you've completed this ${itemType} or one of its subtasks, update its status:\n\n`;
            
            if (targetTask && targetTask.subtasks && targetTask.subtasks.length > 0) {
                const pendingSubtask = targetTask.subtasks.find(s => s.status !== 'done');
                if (pendingSubtask) {
                    responseText += `To mark a subtask as complete:\n\`\`\`\nmanageItems action=updateSubtask epicId=${resolvedEpicId} taskId=${resolvedTaskId} subtaskId=${pendingSubtask.id} subtaskStatus="done" basePath="${basePath}"\n\`\`\`\n\n`;
                }
            }
            
            responseText += `To mark the entire ${itemType} as complete:\n\`\`\`\n`;
            if (itemType === "Task") {
                responseText += `manageItems action=updateTask epicId=${resolvedEpicId} taskId=${resolvedTaskId} status="done" basePath="${basePath}"\n\`\`\`\n\n`;
            } else {
                responseText += `manageItems action=updateEpic epicId=${resolvedEpicId} status="done" basePath="${basePath}"\n\`\`\`\n\n`;
            }
            
            responseText += `To get the next item to work on:\n\`\`\`\nexecuteItem basePath="${basePath}"\n\`\`\`\n\n`;
            
            if (documentFindings) {
                responseText += `Remember to document your findings, approaches, and any issues encountered during implementation. This will be valuable for future reference.\n\n`;
            }
            
            if (additionalContext) {
                responseText += `## 🔍 Additional Context\n\n${additionalContext}\n\n`;
            }
            
            return { 
                content: [{ type: "text", text: responseText }],
                metadata: {
                    epicId: resolvedEpicId,
                    taskId: resolvedTaskId,
                    itemType: itemType
                }
            };
        }
    );
} 
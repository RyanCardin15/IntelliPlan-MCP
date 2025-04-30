import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Import schemas
import { configureStorage, loadEpics, getEpics, getEpicById, getTaskById } from "../../infrastructure/storage/TaskStorageService.js";
import type { Epic, Task, Subtask, AssociatedFile, Status } from "../../domain/task/entities/Task.js";

// Define Epic ID schema
const epicIdSchema = z.string().uuid().describe("ID of the Epic to get overview for");

/**
 * Find tasks that depend on a given task or epic
 */
function findDependentItems(itemId: string, allEpics: Epic[]): { epicDependents: Epic[], taskDependents: { epic: Epic, task: Task }[] } {
    const epicDependents: Epic[] = [];
    const taskDependents: { epic: Epic, task: Task }[] = [];
    
    // Check all epics and tasks for dependencies on the given item
    for (const epic of allEpics) {
        // Check if epic depends on our item
        if (epic.dependencies?.includes(itemId)) {
            epicDependents.push(epic);
        }
        
        // Check if any tasks in this epic depend on our item
        for (const task of epic.tasks) {
            if (task.dependencies?.includes(itemId)) {
                taskDependents.push({ epic, task });
            }
        }
    }
    
    return { epicDependents, taskDependents };
}

/**
 * Calculate completion percentage of an epic based on task completion
 */
function calculateEpicCompletion(epic: Epic): { completedTasks: number, totalTasks: number, completedSubtasks: number, totalSubtasks: number, percentage: number } {
    const totalTasks = epic.tasks.length;
    const completedTasks = epic.tasks.filter(t => t.status === 'done').length;
    
    let totalSubtasks = 0;
    let completedSubtasks = 0;
    
    for (const task of epic.tasks) {
        if (task.subtasks) {
            totalSubtasks += task.subtasks.length;
            completedSubtasks += task.subtasks.filter(st => st.status === 'done').length;
        }
    }
    
    // Calculate overall percentage (weighted more towards tasks than subtasks)
    const taskWeight = 0.7;
    const subtaskWeight = 0.3;
    
    let percentage = 0;
    if (totalTasks > 0) {
        const taskPercentage = (completedTasks / totalTasks) * 100;
        const subtaskPercentage = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 100;
        percentage = (taskPercentage * taskWeight) + (subtaskPercentage * subtaskWeight);
    }
    
    return {
        completedTasks,
        totalTasks,
        completedSubtasks,
        totalSubtasks,
        percentage: Math.round(percentage)
    };
}

/**
 * Get a progress bar string based on percentage
 */
function getProgressBar(percentage: number, length: number = 20): string {
    const filledLength = Math.round((percentage * length) / 100);
    const emptyLength = length - filledLength;
    
    const filled = '█'.repeat(filledLength);
    const empty = '░'.repeat(emptyLength);
    
    return `${filled}${empty} ${percentage}%`;
}

/**
 * Get status emoji for visual representation
 */
function getStatusEmoji(status: Status): string {
    switch (status) {
        case 'done': return '✅';
        case 'in-progress': return '🚧';
        case 'todo': return '⏳';
        default: return '❓';
    }
}

/**
 * Get task status display with checkbox and emoji
 */
function getTaskStatusDisplay(status: Status): string {
    const checkbox = status === 'done' ? '[x]' : '[ ]';
    return `${checkbox} ${getStatusEmoji(status)}`;
}

/**
 * Get priority emoji for visual representation
 */
function getPriorityEmoji(priority?: string): string {
    if (!priority) return '';
    
    switch (priority) {
        case 'high': return '🔴';
        case 'medium': return '🟠';
        case 'low': return '🟢';
        default: return '';
    }
}

const getOverviewModeSchema = z.enum([
    'fullOverview', 
    'suggestNext', 
    'verify'
]);

// Define the schema for the epic overview tool
const getEpicOverviewSchema = z.object({
    mode: getOverviewModeSchema.default('fullOverview').describe("Information mode (required)"),
    epicId: epicIdSchema.optional().describe("Epic ID (required for 'fullOverview', 'verify')"),
    verbosity: z.enum(['summary', 'detailed', 'full']).optional().default('detailed').describe("Level of detail for 'fullOverview'"),
    includeDiagrams: z.boolean().optional().default(true).describe("Include Mermaid diagrams (for 'fullOverview')"),
    basePath: z.string().describe("Base directory path for storage (required)")
});

// Infer the parameter type from the schema
type GetEpicOverviewParams = z.infer<typeof getEpicOverviewSchema>;

export function registerGetEpicOverviewTool(server: McpServer): void {
    server.tool(
        "getEpicOverview",
        "Provides a detailed, easy-to-read overview of an Epic, its tasks, and related information.",
        {
            mode: getOverviewModeSchema.default('fullOverview').describe("Information mode (required)"),
            epicId: epicIdSchema.optional().describe("Epic ID (required for 'fullOverview', 'verify')"),
            verbosity: z.enum(['summary', 'detailed', 'full']).optional().default('detailed').describe("Level of detail for 'fullOverview'"),
            includeDiagrams: z.boolean().optional().default(true).describe("Include Mermaid diagrams (for 'fullOverview')"),
            basePath: z.string().describe("Base directory path for storage (required)")
        },
        async (params: GetEpicOverviewParams) => {
            const { mode, epicId, verbosity = 'detailed', includeDiagrams = true, basePath } = params;

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

            try {
                switch (mode) {
                    case 'fullOverview': {
                        if (!epicId) {
                            return { content: [{ type: "text", text: "epicId is required for fullOverview mode" }], isError: true };
                        }

                        const epic = getEpicById(epicId);
                        if (!epic) {
                            return { content: [{ type: "text", text: `Epic with ID ${epicId} not found` }], isError: true };
                        }

                        // Get all epics for dependency checks
                        const allEpics = getEpics();
                        const completion = calculateEpicCompletion(epic);
                        
                        // Begin building the overview
                        let output = `# 📊 Epic Overview: ${epic.description.split('\n')[0]}\n\n`;
                        
                        // Status and progress section
                        output += `## Status and Progress\n\n`;
                        output += `**Status**: ${getStatusEmoji(epic.status)} ${epic.status}\n`;
                        
                        if (epic.priority) {
                            output += `**Priority**: ${getPriorityEmoji(epic.priority)} ${epic.priority}\n`;
                        }
                        
                        if (epic.complexity) {
                            output += `**Complexity**: ${epic.complexity}/10\n`;
                        }
                        
                        output += `**Progress**: ${getProgressBar(completion.percentage)}\n`;
                        output += `**Tasks**: ${completion.completedTasks}/${completion.totalTasks} completed\n`;
                        output += `**Subtasks**: ${completion.completedSubtasks}/${completion.totalSubtasks} completed\n`;
                        output += `**ID**: \`${epic.id}\`\n`;
                        output += `**Created**: ${new Date(epic.createdAt).toLocaleString()}\n`;
                        output += `**Updated**: ${new Date(epic.updatedAt).toLocaleString()}\n\n`;
                        
                        // Description section
                        if (verbosity !== "summary") {
                            output += `## Description\n\n${epic.description}\n\n`;
                        }
                        
                        // Implementation plan if available
                        if ((verbosity === "full" || verbosity === "detailed") && epic.implementationPlan) {
                            output += `## Implementation Plan\n\n${epic.implementationPlan}\n\n`;
                        }
                        
                        // Test strategy if available
                        if ((verbosity === "full" || verbosity === "detailed") && epic.testStrategy) {
                            output += `## Test Strategy\n\n${epic.testStrategy}\n\n`;
                        }
                        
                        // Tasks section
                        output += `## Tasks (${completion.completedTasks}/${completion.totalTasks})\n\n`;
                        
                        if (epic.tasks.length === 0) {
                            output += "*No tasks defined yet*\n\n";
                        } else {
                            // Group tasks by status for better organization
                            const inProgressTasks = epic.tasks.filter(t => t.status === 'in-progress');
                            const todoTasks = epic.tasks.filter(t => t.status === 'todo');
                            const doneTasks = epic.tasks.filter(t => t.status === 'done');
                            
                            // In-progress tasks first
                            if (inProgressTasks.length > 0) {
                                output += `### In Progress Tasks\n\n`;
                                inProgressTasks.forEach(task => {
                                    const subtaskProgress = task.subtasks?.length > 0 
                                        ? `(${task.subtasks.filter(s => s.status === 'done').length}/${task.subtasks.length} subtasks)` 
                                        : '';
                                    
                                    output += `${getTaskStatusDisplay(task.status)} **${task.id.substring(0, 8)}**: ${task.description.split('\n')[0]} ${subtaskProgress}\n`;
                                    
                                    // Add subtasks for detailed/full verbosity
                                    if ((verbosity === 'detailed' || verbosity === 'full') && task.subtasks?.length > 0) {
                                        task.subtasks.forEach(subtask => {
                                            const subtaskStatus = subtask.status === 'done' ? '[x] ✅' : '[ ] ⬜';
                                            output += `  ${subtaskStatus} ${subtask.description}\n`;
                                        });
                                        output += '\n';
                                    }
                                });
                                output += '\n';
                            }
                            
                            // Todo tasks next
                            if (todoTasks.length > 0) {
                                output += `### To Do Tasks\n\n`;
                                todoTasks.forEach(task => {
                                    const subtaskProgress = task.subtasks?.length > 0 
                                        ? `(${task.subtasks.filter(s => s.status === 'done').length}/${task.subtasks.length} subtasks)` 
                                        : '';
                                    
                                    output += `${getTaskStatusDisplay(task.status)} **${task.id.substring(0, 8)}**: ${task.description.split('\n')[0]} ${subtaskProgress}\n`;
                                    
                                    // Add subtasks for detailed/full verbosity
                                    if ((verbosity === 'detailed' || verbosity === 'full') && task.subtasks?.length > 0) {
                                        task.subtasks.forEach(subtask => {
                                            const subtaskStatus = subtask.status === 'done' ? '[x] ✅' : '[ ] ⬜';
                                            output += `  ${subtaskStatus} ${subtask.description}\n`;
                                        });
                                        output += '\n';
                                    }
                                });
                                output += '\n';
                            }
                            
                            // Done tasks last
                            if (doneTasks.length > 0) {
                                output += `### Completed Tasks\n\n`;
                                doneTasks.forEach(task => {
                                    output += `${getTaskStatusDisplay(task.status)} **${task.id.substring(0, 8)}**: ${task.description.split('\n')[0]}\n`;
                                    
                                    // For completed tasks, only show subtasks in full verbosity
                                    if (verbosity === 'full' && task.subtasks?.length > 0) {
                                        task.subtasks.forEach(subtask => {
                                            const subtaskStatus = subtask.status === 'done' ? '[x] ✅' : '[ ] ⬜';
                                            output += `  ${subtaskStatus} ${subtask.description}\n`;
                                        });
                                        output += '\n';
                                    }
                                });
                                output += '\n';
                            }
                        }
                        
                        // Dependencies section if any
                        if (epic.dependencies && epic.dependencies.length > 0) {
                            output += `## Dependencies (Depends On)\n\n`;
                            
                            for (const depId of epic.dependencies) {
                                const depEpic = getEpicById(depId);
                                if (depEpic) {
                                    const checkmark = depEpic.status === 'done' ? '✅' : depEpic.status === 'in-progress' ? '🚧' : '⬜';
                                    output += `- ${checkmark} EPIC **${depId.substring(0, 8)}**: ${depEpic.description.split('\n')[0]}\n`;
                                } else {
                                    output += `- ❓ UNKNOWN **${depId.substring(0, 8)}**\n`;
                                }
                            }
                            output += '\n';
                        }
                        
                        // Dependents section (epics and tasks that depend on this epic)
                        const { epicDependents, taskDependents } = findDependentItems(epic.id, allEpics);
                        
                        if (epicDependents.length > 0 || taskDependents.length > 0) {
                            output += `## Dependents (Required By)\n\n`;
                            
                            epicDependents.forEach(depEpic => {
                                const checkmark = depEpic.status === 'done' ? '✅' : depEpic.status === 'in-progress' ? '🚧' : '⬜';
                                output += `- ${checkmark} EPIC **${depEpic.id.substring(0, 8)}**: ${depEpic.description.split('\n')[0]}\n`;
                            });
                            
                            taskDependents.forEach(({ epic: parentEpic, task }) => {
                                const checkmark = task.status === 'done' ? '✅' : task.status === 'in-progress' ? '🚧' : '⬜';
                                output += `- ${checkmark} TASK **${task.id.substring(0, 8)}**: ${task.description.split('\n')[0]} (in Epic: ${parentEpic.id.substring(0, 8)})\n`;
                            });
                            
                            output += '\n';
                        }
                        
                        // Files section if any
                        if (verbosity !== 'summary' && epic.files && epic.files.length > 0) {
                            output += `## Associated Files\n\n`;
                            
                            epic.files.forEach(file => {
                                output += `- 📄 \`${file.filePath}\`${file.description ? `: ${file.description}` : ''}\n`;
                            });
                            output += '\n';
                        }
                        
                        // Include dependencies visualization if requested
                        if (includeDiagrams) {
                            output += `## Visualizations\n\n`;
                            
                            // Progress chart
                            output += `### Progress Chart\n\n`;
                            output += "```mermaid\npie\n";
                            output += `    title Epic Progress\n`;
                            output += `    "Completed Tasks" : ${completion.completedTasks}\n`;
                            output += `    "Remaining Tasks" : ${completion.totalTasks - completion.completedTasks}\n`;
                            output += "```\n\n";
                            
                            // Dependency graph
                            output += `### Dependency Graph\n\n`;
                            output += "```mermaid\ngraph TD;\n";
                            
                            // Current epic node
                            output += `    EPIC_${epic.id.substring(0, 8)}["${getStatusEmoji(epic.status)} Epic: ${epic.description.split('\n')[0]}"];\n`;
                            
                            // Epic dependencies
                            if (epic.dependencies) {
                                for (const depId of epic.dependencies) {
                                    const depEpic = getEpicById(depId);
                                    if (depEpic) {
                                        output += `    EPIC_${depId.substring(0, 8)}["${getStatusEmoji(depEpic.status)} Epic: ${depEpic.description.split('\n')[0]}"];\n`;
                                        output += `    EPIC_${depId.substring(0, 8)} --> EPIC_${epic.id.substring(0, 8)};\n`;
                                    }
                                }
                            }
                            
                            // Tasks in the epic
                            for (const task of epic.tasks) {
                                output += `    TASK_${task.id.substring(0, 8)}["${getStatusEmoji(task.status)} Task: ${task.description.split('\n')[0]}"];\n`;
                                output += `    EPIC_${epic.id.substring(0, 8)} --> TASK_${task.id.substring(0, 8)};\n`;
                                
                                // Task dependencies
                                if (task.dependencies) {
                                    for (const depId of task.dependencies) {
                                        const depTaskResult = getTaskById(depId);
                                        const depEpic = getEpicById(depId);
                                        
                                        if (depTaskResult) {
                                            output += `    TASK_${depId.substring(0, 8)}["${getStatusEmoji(depTaskResult.task.status)} Task: ${depTaskResult.task.description.split('\n')[0]}"];\n`;
                                            output += `    TASK_${depId.substring(0, 8)} --> TASK_${task.id.substring(0, 8)};\n`;
                                        } else if (depEpic) {
                                            output += `    EPIC_${depId.substring(0, 8)}["${getStatusEmoji(depEpic.status)} Epic: ${depEpic.description.split('\n')[0]}"];\n`;
                                            output += `    EPIC_${depId.substring(0, 8)} --> TASK_${task.id.substring(0, 8)};\n`;
                                        }
                                    }
                                }
                            }
                            
                            // Dependents
                            for (const depEpic of epicDependents) {
                                output += `    EPIC_${depEpic.id.substring(0, 8)}["${getStatusEmoji(depEpic.status)} Epic: ${depEpic.description.split('\n')[0]}"];\n`;
                                output += `    EPIC_${epic.id.substring(0, 8)} --> EPIC_${depEpic.id.substring(0, 8)};\n`;
                            }
                            
                            for (const { task, epic: parentEpic } of taskDependents) {
                                output += `    TASK_${task.id.substring(0, 8)}["${getStatusEmoji(task.status)} Task: ${task.description.split('\n')[0]}"];\n`;
                                output += `    EPIC_${epic.id.substring(0, 8)} --> TASK_${task.id.substring(0, 8)};\n`;
                            }
                            
                            output += "```\n\n";
                        }
                        
                        return { content: [{ type: "text", text: output }] };
                    }
                    
                    case 'suggestNext': {
                        const allEpics = getEpics();
                        let suggestion = "# 🎯 Next Steps Suggestion\n\n";
                        
                        if (epicId) {
                            // Suggest next task for a specific epic
                            const epic = getEpicById(epicId);
                            if (!epic) {
                                return { content: [{ type: "text", text: `Epic with ID ${epicId} not found` }], isError: true };
                            }
                            
                            suggestion += `## For Epic: ${epic.description.split('\n')[0]}\n\n`;
                            
                            // Check epic status
                            if (epic.status === 'done') {
                                suggestion += "✅ This Epic is marked as **done**. Consider reviewing the completed work or starting a new Epic.\n\n";
                                return { content: [{ type: "text", text: suggestion }] };
                            }
                            
                            // Check for epic blockers
                            if (epic.dependencies && epic.dependencies.length > 0) {
                                const blockers = epic.dependencies
                                    .map(depId => getEpicById(depId))
                                    .filter(dep => dep && dep.status !== 'done')
                                    .map(dep => `${dep?.id.substring(0, 8)}: ${dep?.description.split('\n')[0]}`);
                                
                                if (blockers.length > 0) {
                                    suggestion += "⚠️ This Epic is blocked by:\n\n";
                                    blockers.forEach(blocker => {
                                        suggestion += `- ${blocker}\n`;
                                    });
                                    suggestion += "\nConsider working on these blocking Epics first.\n\n";
                                }
                            }
                            
                            // Find in-progress tasks
                            const inProgressTasks = epic.tasks.filter(t => t.status === 'in-progress');
                            if (inProgressTasks.length > 0) {
                                suggestion += "🚧 **Continue working on these in-progress tasks:**\n\n";
                                inProgressTasks.forEach(task => {
                                    const subtaskProgress = task.subtasks?.length > 0 
                                        ? `(${task.subtasks.filter(s => s.status === 'done').length}/${task.subtasks.length} subtasks)` 
                                        : '';
                                    suggestion += `- ${task.id.substring(0, 8)}: ${task.description.split('\n')[0]} ${subtaskProgress}\n`;
                                });
                                suggestion += "\n";
                            }
                            
                            // Find unblocked todo tasks
                            const todoTasks = epic.tasks.filter(t => t.status === 'todo');
                            if (todoTasks.length > 0) {
                                const unblocked = todoTasks.filter(task => {
                                    if (!task.dependencies || task.dependencies.length === 0) return true;
                                    
                                    return task.dependencies.every(depId => {
                                        const depTask = getTaskById(depId);
                                        const depEpic = getEpicById(depId);
                                        return depTask?.task.status === 'done' || depEpic?.status === 'done';
                                    });
                                });
                                
                                if (unblocked.length > 0) {
                                    suggestion += "✅ **Ready to start tasks:**\n\n";
                                    unblocked.forEach(task => {
                                        suggestion += `- ${task.id.substring(0, 8)}: ${task.description.split('\n')[0]}\n`;
                                    });
                                    suggestion += "\n";
                                }
                                
                                // Find blocked tasks
                                const blocked = todoTasks.filter(task => 
                                    task.dependencies && task.dependencies.some(depId => {
                                        const depTask = getTaskById(depId);
                                        const depEpic = getEpicById(depId);
                                        return (!depTask || depTask.task.status !== 'done') && 
                                               (!depEpic || depEpic.status !== 'done');
                                    })
                                );
                                
                                if (blocked.length > 0) {
                                    suggestion += "⏳ **Blocked tasks (dependencies not satisfied):**\n\n";
                                    blocked.forEach(task => {
                                        suggestion += `- ${task.id.substring(0, 8)}: ${task.description.split('\n')[0]}\n`;
                                    });
                                    suggestion += "\n";
                                }
                            }
                            
                            if (epic.tasks.length === 0) {
                                suggestion += "📝 **This Epic has no tasks yet.** Consider creating initial tasks to break down the work.\n\n";
                            }
                            
                        } else {
                            // Suggest next Epic to work on
                            suggestion += "## Epic Suggestions\n\n";
                            
                            // Find in-progress epics first
                            const inProgressEpics = allEpics.filter(e => e.status === 'in-progress');
                            if (inProgressEpics.length > 0) {
                                suggestion += "🚧 **Continue working on these in-progress Epics:**\n\n";
                                inProgressEpics.forEach(epic => {
                                    const completion = calculateEpicCompletion(epic);
                                    suggestion += `- ${epic.id.substring(0, 8)}: ${epic.description.split('\n')[0]} (${completion.percentage}% complete)\n`;
                                });
                                suggestion += "\n";
                            }
                            
                            // Find unblocked todo epics
                            const todoEpics = allEpics.filter(e => e.status === 'todo');
                            if (todoEpics.length > 0) {
                                const unblocked = todoEpics.filter(epic => {
                                    if (!epic.dependencies || epic.dependencies.length === 0) return true;
                                    
                                    return epic.dependencies.every(depId => {
                                        const depEpic = getEpicById(depId);
                                        return depEpic?.status === 'done';
                                    });
                                });
                                
                                if (unblocked.length > 0) {
                                    suggestion += "✅ **Ready to start Epics:**\n\n";
                                    unblocked.forEach(epic => {
                                        suggestion += `- ${epic.id.substring(0, 8)}: ${epic.description.split('\n')[0]}\n`;
                                    });
                                    suggestion += "\n";
                                }
                                
                                // Find blocked epics
                                const blocked = todoEpics.filter(epic => 
                                    epic.dependencies && epic.dependencies.some(depId => {
                                        const depEpic = getEpicById(depId);
                                        return !depEpic || depEpic.status !== 'done';
                                    })
                                );
                                
                                if (blocked.length > 0) {
                                    suggestion += "⏳ **Blocked Epics (dependencies not satisfied):**\n\n";
                                    blocked.forEach(epic => {
                                        suggestion += `- ${epic.id.substring(0, 8)}: ${epic.description.split('\n')[0]}\n`;
                                        
                                        // List blockers
                                        if (epic.dependencies) {
                                            const blockers = epic.dependencies
                                                .map(depId => getEpicById(depId))
                                                .filter(dep => dep && dep.status !== 'done')
                                                .map(dep => `${dep?.id.substring(0, 8)}: ${dep?.description.split('\n')[0]}`);
                                            
                                            if (blockers.length > 0) {
                                                blockers.forEach(blocker => {
                                                    suggestion += `  - Blocked by: ${blocker}\n`;
                                                });
                                            }
                                        }
                                    });
                                    suggestion += "\n";
                                }
                            }
                            
                            if (allEpics.length === 0) {
                                suggestion += "📝 **No Epics found.** Create a new Epic to get started.\n\n";
                            }
                        }
                        
                        return { content: [{ type: "text", text: suggestion }] };
                    }
                    
                    case 'verify': {
                        if (!epicId) {
                            return { content: [{ type: "text", text: "epicId is required for verify mode" }], isError: true };
                        }

                        const epic = getEpicById(epicId);
                        if (!epic) {
                            return { content: [{ type: "text", text: `Epic with ID ${epicId} not found` }], isError: true };
                        }
                        
                        // Calculate completion metrics
                        const completion = calculateEpicCompletion(epic);
                        
                        // Check dependencies
                        let allDependenciesMet = true;
                        const pendingDependencies: string[] = [];
                        
                        if (epic.dependencies && epic.dependencies.length > 0) {
                            for (const depId of epic.dependencies) {
                                const dependency = getEpicById(depId);
                                if (!dependency || dependency.status !== 'done') {
                                    allDependenciesMet = false;
                                    pendingDependencies.push(depId);
                                }
                            }
                        }
                        
                        // Prepare verification report
                        let report = `# 🔍 Epic Verification Report\n\n`;
                        report += `## Epic: ${epic.description.split('\n')[0]}\n\n`;
                        
                        // Completion status
                        report += `### Completion Status\n\n`;
                        report += `**Overall Progress**: ${getProgressBar(completion.percentage)}\n`;
                        report += `**Tasks**: ${completion.completedTasks}/${completion.totalTasks} completed\n`;
                        report += `**Subtasks**: ${completion.completedSubtasks}/${completion.totalSubtasks} completed\n\n`;
                        
                        // Dependencies status
                        report += `### Dependencies Status\n\n`;
                        if (epic.dependencies && epic.dependencies.length > 0) {
                            if (allDependenciesMet) {
                                report += `✅ All dependencies are satisfied.\n\n`;
                            } else {
                                report += `⚠️ Some dependencies are not yet completed:\n\n`;
                                for (const depId of pendingDependencies) {
                                    const dep = getEpicById(depId);
                                    if (dep) {
                                        report += `- ${dep.id.substring(0, 8)}: ${dep.description.split('\n')[0]} (${dep.status})\n`;
                                    } else {
                                        report += `- ${depId.substring(0, 8)}: Unknown dependency\n`;
                                    }
                                }
                                report += `\n`;
                            }
                        } else {
                            report += `✅ No dependencies defined.\n\n`;
                        }
                        
                        // List incomplete tasks
                        const incompleteTasks = epic.tasks.filter(t => t.status !== 'done');
                        if (incompleteTasks.length > 0) {
                            report += `### Incomplete Tasks\n\n`;
                            incompleteTasks.forEach(task => {
                                report += `- ${getStatusEmoji(task.status)} ${task.id.substring(0, 8)}: ${task.description.split('\n')[0]}\n`;
                            });
                            report += `\n`;
                        }
                        
                        // Verification result
                        report += `### Verification Result\n\n`;
                        
                        if (completion.percentage === 100 && allDependenciesMet) {
                            report += `✅ **PASSED**: All tasks are complete and dependencies are satisfied.\n\n`;
                            report += `Recommendation: Mark this Epic as 'done'.\n`;
                        } else {
                            report += `⚠️ **NOT READY**: ${completion.percentage}% complete. `;
                            
                            if (completion.totalTasks === 0) {
                                report += `No tasks have been defined yet.\n\n`;
                            } else if (incompleteTasks.length > 0) {
                                report += `${incompleteTasks.length} task(s) are not yet complete.\n\n`;
                            }
                            
                            if (!allDependenciesMet) {
                                report += `${pendingDependencies.length} dependency/dependencies need to be completed first.\n\n`;
                            }
                            
                            report += `Recommendation: Keep status as '${epic.status}' until all tasks and dependencies are completed.\n`;
                        }
                        
                        return { content: [{ type: "text", text: report }] };
                    }
                    
                    default:
                        return { content: [{ type: "text", text: `Error: Unknown mode '${mode}'.` }], isError: true };
                }
            } catch (error: any) {
                return { 
                    content: [{ type: "text", text: `Error performing action '${mode}': ${error.message}` }],
                    isError: true 
                };
            }
        }
    );
} 
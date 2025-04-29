import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { taskIdSchema } from "../schemas/commonSchemas.js";
// Import necessary functions/types...
import { getTasks, getTaskById } from "../../infrastructure/storage/TaskStorageService.js";
import type { Task, TaskFile } from "../../types/TaskTypes.js";

// Helper function to find tasks that depend on a given task
function findDependentTasks(taskId: string, allTasks: Task[]): string[] {
    const visited = new Set<string>();
    
    const findDependents = (id: string, visited: Set<string>): string[] => {
        if (visited.has(id)) return [];
        visited.add(id);
        
        const directDependents = allTasks
            .filter(t => t.dependencies && t.dependencies.includes(id))
            .map(t => t.id);
            
        const allDependents = [...directDependents];
        
        for (const depId of directDependents) {
            const indirectDependents = findDependents(depId, visited);
            allDependents.push(...indirectDependents);
        }
        
        return allDependents;
    };
    
    return findDependents(taskId, visited);
}

const getOverviewModeSchema = z.enum([
    'fullOverview', 
    'suggestNext', 
    'verify'
]);

// Define the schema separately for clarity
const getTaskOverviewSchema = z.object({
    mode: getOverviewModeSchema.default('fullOverview'),
    taskId: taskIdSchema.optional(),
    verbosity: z.enum(['summary', 'detailed', 'full']).optional().default('detailed'),
    includeDiagrams: z.boolean().optional().default(false)
});

// Infer the parameter type from the schema
type GetTaskOverviewParams = z.infer<typeof getTaskOverviewSchema>;

export function registerGetTaskOverviewTool(server: McpServer): void {
    server.tool(
        "getTaskOverview",
        "Provides information about tasks: details, suggestions, or verification status.",
        {
            mode: getOverviewModeSchema.default('fullOverview').describe("Information mode (required)"),
            taskId: taskIdSchema.optional().describe("Task ID (required for 'fullOverview', 'verify')"),
            verbosity: z.enum(['summary', 'detailed', 'full']).optional().default('detailed').describe("Level of detail for 'fullOverview'"),
            includeDiagrams: z.boolean().optional().default(false).describe("Include Mermaid diagrams (for 'fullOverview')")
        },
        // Use the inferred type for the parameters
        async (params: GetTaskOverviewParams) => {
            const { mode, taskId, verbosity, includeDiagrams } = params;

            try {
                switch (mode) {
                    case 'suggestNext': {
                        // Logic from old suggestNextTask
                        const tasks = getTasks();
                        if (tasks.length === 0) {
                            return { content: [{ type: "text", text: "No tasks found to suggest." }] };
                        }

                        // Initialize output with header
                        let output = "# 📋 Task Suggestions\n\n";
                        
                        // Get all incomplete tasks
                        const inProgressTasks = tasks.filter(task => task.status === 'in-progress');
                        const todoTasks = tasks.filter(task => task.status === 'todo');
                        
                        // Check if any incomplete tasks exist
                        if (inProgressTasks.length === 0 && todoTasks.length === 0) {
                            output += "✅ All tasks are complete! Great job!\n";
                            return { content: [{ type: "text", text: output }] };
                        }
                        
                        const priorityOrder = { high: 3, medium: 2, low: 1 };
                        const sortTasks = (a: Task, b: Task) => {
                            const aPriority = a.priority ? priorityOrder[a.priority as keyof typeof priorityOrder] : 0;
                            const bPriority = b.priority ? priorityOrder[b.priority as keyof typeof priorityOrder] : 0;
                            if (aPriority !== bPriority) return bPriority - aPriority;
                            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                        };

                        // In-progress tasks section
                        if (inProgressTasks.length > 0) {
                            output += "## 🚧 In Progress\n";
                            const sortedInProgress = [...inProgressTasks].sort(sortTasks);
                            
                            sortedInProgress.forEach(task => {
                                // Check if this task has any pending dependencies
                                const hasPendingDeps = task.dependencies?.some(depId => {
                                    const depTask = tasks.find(t => t.id === depId);
                                    return !depTask || depTask.status !== 'done';
                                }) || false;
                                
                                const subtaskInfo = `(${task.subtasks.filter(s => s.status === 'done').length}/${task.subtasks.length})`;
                                const priorityEmoji = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟠' : '🟢';
                                
                                output += `- ${priorityEmoji} **${task.id.substring(0, 8)}**: ${task.description.split('\n')[0]} ${subtaskInfo}`;
                                if (hasPendingDeps) output += " ⚠️ *Has pending dependencies*";
                                output += "\n";
                            });
                            output += "\n";
                        }

                        // Tasks ready to start
                        const readyTasks = todoTasks.filter(task => {
                            if (!task.dependencies || task.dependencies.length === 0) return true;
                            return task.dependencies.every(depId => {
                                const depTask = tasks.find(t => t.id === depId);
                                return depTask && depTask.status === 'done';
                            });
                        });
                        
                        if (readyTasks.length > 0) {
                            output += "## ✅ Ready to Start\n";
                            const sortedReady = [...readyTasks].sort(sortTasks);
                            
                            sortedReady.forEach(task => {
                                const subtaskInfo = `(${task.subtasks.filter(s => s.status === 'done').length}/${task.subtasks.length})`;
                                const priorityEmoji = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟠' : '🟢';
                                
                                output += `- ${priorityEmoji} **${task.id.substring(0, 8)}**: ${task.description.split('\n')[0]} ${subtaskInfo}\n`;
                            });
                            output += "\n";
                        }

                        // Blocked tasks
                        const blockedTasks = todoTasks.filter(task => {
                            if (!task.dependencies || task.dependencies.length === 0) return false;
                            return task.dependencies.some(depId => {
                                const depTask = tasks.find(t => t.id === depId);
                                return !depTask || depTask.status !== 'done';
                            });
                        });
                        
                        if (blockedTasks.length > 0) {
                            output += "## ⛔ Blocked\n";
                            const sortedBlocked = [...blockedTasks].sort(sortTasks);
                            
                            sortedBlocked.forEach(task => {
                                const subtaskInfo = `(${task.subtasks.filter(s => s.status === 'done').length}/${task.subtasks.length})`;
                                const priorityEmoji = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟠' : '🟢';
                                
                                // Find and list the blocking dependencies
                                const blockingDeps = task.dependencies?.filter(depId => {
                                    const depTask = tasks.find(t => t.id === depId);
                                    return !depTask || depTask.status !== 'done';
                                }).map(depId => {
                                    const depTask = tasks.find(t => t.id === depId);
                                    return depTask ? `${depId.substring(0, 8)} (${depTask.status})` : depId.substring(0, 8);
                                }).join(", ");
                                
                                output += `- ${priorityEmoji} **${task.id.substring(0, 8)}**: ${task.description.split('\n')[0]} ${subtaskInfo}\n`;
                                output += `  ↳ Blocked by: ${blockingDeps}\n`;
                            });
                        }

                        return { content: [{ type: "text", text: output }] };
                    } // End case 'suggestNext'

                    case 'fullOverview': {
                        if (!params.taskId) {
                            return { content: [{ type: "text", text: "taskId is required for fullOverview mode" }], isError: true };
                        }

                        const task = getTaskById(params.taskId);
                        if (!task) {
                            return { content: [{ type: "text", text: `Task with ID ${params.taskId} not found` }], isError: true };
                        }

                        const allTasks = getTasks();
                        const verbosity = params.verbosity || "detailed";
                        
                        let output = `# 📋 Task Overview: ${task.description.split('\n')[0]}\n\n`;
                        
                        // Status emoji
                        const statusEmoji = task.status === 'done' ? '✅' : task.status === 'in-progress' ? '🚧' : '⏳';
                        output += `**Status**: ${statusEmoji} ${task.status}\n`;
                        
                        if (task.priority) {
                            const priorityEmoji = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟠' : '🟢';
                            output += `**Priority**: ${priorityEmoji} ${task.priority}\n`;
                        }
                        
                        output += `**ID**: \`${task.id}\`\n`;
                        output += `**Created**: ${new Date(task.createdAt).toLocaleString()}\n`;
                        
                        // Add full description for detailed/full verbosity
                        if (verbosity !== "summary") {
                            output += `\n## Description\n${task.description}\n`;
                        }
                        
                        // Add subtasks section
                        if (task.subtasks.length > 0) {
                            output += `\n## Subtasks (${task.subtasks.filter(s => s.status === 'done').length}/${task.subtasks.length})\n\n`;
                            
                            task.subtasks.forEach(subtask => {
                                const checkmark = subtask.status === 'done' ? '✅' : '⬜';
                                output += `- ${checkmark} **${subtask.id.substring(0, 8)}**: ${subtask.description}\n`;
                            });
                        }
                        
                        // Add dependencies section if any
                        if (task.dependencies && task.dependencies.length > 0) {
                            output += `\n## Dependencies\n\n`;
                            
                            task.dependencies.forEach(depId => {
                                const depTask = allTasks.find(t => t.id === depId);
                                if (!depTask) {
                                    output += `- ⚠️ **${depId.substring(0, 8)}**: Not found\n`;
                                    return;
                                }
                                
                                const checkmark = depTask.status === 'done' ? '✅' : depTask.status === 'in-progress' ? '🚧' : '⬜';
                                output += `- ${checkmark} **${depId.substring(0, 8)}**: ${depTask.description.split('\n')[0]}\n`;
                            });
                        }
                        
                        // Add dependents section if any
                        const dependentTaskIds = findDependentTasks(task.id, allTasks);
                        const dependentTasks = dependentTaskIds.map(id => allTasks.find(t => t.id === id)).filter(Boolean) as Task[];
                        
                        if (dependentTasks.length > 0) {
                            output += `\n## Required By\n\n`;
                            
                            dependentTasks.forEach(depTask => {
                                const checkmark = depTask.status === 'done' ? '✅' : depTask.status === 'in-progress' ? '🚧' : '⬜';
                                output += `- ${checkmark} **${depTask.id.substring(0, 8)}**: ${depTask.description.split('\n')[0]}\n`;
                            });
                        }
                        
                        // Add files section if any and verbosity is full
                        if (verbosity === "full" && task.files && task.files.length > 0) {
                            output += `\n## Related Files\n\n`;
                            
                            task.files.forEach((file: TaskFile) => {
                                output += `- 📄 **${file.filePath}**${file.description ? `: ${file.description}` : ''}\n`;
                            });
                        }
                        
                        // Add diagrams if requested and available
                        if (params.includeDiagrams && verbosity === "full") {
                            // TaskFlow diagram
                            output += `\n## Task Flow Diagram\n\n`;
                            output += "```mermaid\ngraph TD;\n";
                            
                            // Add the current task
                            output += `  ${task.id.substring(0, 8)}["${task.status === 'done' ? '✅ ' : ''}${task.description.split('\n')[0]}"];\n`;
                            
                            // Add dependencies
                            if (task.dependencies && task.dependencies.length > 0) {
                                task.dependencies.forEach(depId => {
                                    const depTask = allTasks.find(t => t.id === depId);
                                    if (depTask) {
                                        output += `  ${depId.substring(0, 8)}["${depTask.status === 'done' ? '✅ ' : ''}${depTask.description.split('\n')[0]}"];\n`;
                                        output += `  ${depId.substring(0, 8)} --> ${task.id.substring(0, 8)};\n`;
                                    }
                                });
                            }
                            
                            // Add dependents
                            if (dependentTasks.length > 0) {
                                dependentTasks.forEach(depTask => {
                                    output += `  ${depTask.id.substring(0, 8)}["${depTask.status === 'done' ? '✅ ' : ''}${depTask.description.split('\n')[0]}"];\n`;
                                    output += `  ${task.id.substring(0, 8)} --> ${depTask.id.substring(0, 8)};\n`;
                                });
                            }
                            
                            output += "```\n";
                        }

                        return { content: [{ type: "text", text: output }] };
                    } // End case 'fullOverview'

                    case 'verify': {
                         if (!taskId) {
                            return { content: [{ type: "text", text: `Error: taskId is required for mode '${mode}'.` }], isError: true };
                        }
                        const task = getTaskById(taskId);
                        if (!task) return { content: [{ type: "text", text: `Error: Task ${taskId} not found.` }], isError: true };
                        
                        // Logic from old analyzeTask verify mode
                        let acceptanceCriteria: string[] = [];
                        let inAcceptanceCriteriaSection = false;
                        task.description.split('\n').forEach(line => {
                            const trimmedLine = line.trim();
                            if (trimmedLine.toLowerCase() === '## acceptance criteria') {
                                inAcceptanceCriteriaSection = true;
                            } else if (inAcceptanceCriteriaSection) {
                                if (trimmedLine.startsWith('##')) {
                                    inAcceptanceCriteriaSection = false;
                                } else if (trimmedLine.startsWith('-') || trimmedLine.startsWith('*') || /^[0-9]+\./.test(trimmedLine)) {
                                    acceptanceCriteria.push(trimmedLine.substring(trimmedLine.indexOf(' ') + 1).trim());
                                }
                            }
                        });

                        const totalSubtasks = task.subtasks.length;
                        const completedSubtasks = task.subtasks.filter(st => st.status === 'done').length;
                        const allSubtasksDone = totalSubtasks === 0 || totalSubtasks === completedSubtasks;

                        let report = `Verification Report for Task ${taskId.substring(0, 8)}:\n\n`;
                        report += `Subtasks: ${completedSubtasks}/${totalSubtasks} completed. ${allSubtasksDone ? '✅ All subtasks done.' : '❌ Not all subtasks are done.'}\n`;
                        
                        if (acceptanceCriteria.length > 0) {
                            report += `Acceptance Criteria Found (${acceptanceCriteria.length}):\n`;
                            acceptanceCriteria.forEach((criterion, index) => { report += `${index + 1}. ${criterion}\n`; });
                            report += `\nRecommendation: Manually verify if criteria are met by the completed work.`;
                        } else {
                            report += `Acceptance Criteria: None explicitly found in description.\nRecommendation: ${allSubtasksDone ? 'Mark task done if functionally complete.' : 'Complete remaining subtasks.'}`; 
                        }
                        
                        // Simple overall status based on findings
                        if (!allSubtasksDone) {
                             report += ` \n\nOverall Status: Needs Subtask Completion.`;
                        } else if (acceptanceCriteria.length > 0) {
                            report += ` \n\nOverall Status: Subtasks Done, Verify Criteria.`;
                        } else { // All done, no explicit criteria
                            report += ` \n\nOverall Status: Subtasks Done, Ready for Closure.`;
                        }

                        return { content: [{ type: "text", text: report }] };
                    } // End case 'verify'

                    default:
                        // Should not happen
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
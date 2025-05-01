import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { descriptionSchema } from "../schemas/commonSchemas.js";

const planEpicSchema = z.object({
    description: descriptionSchema.describe("High-level description of what needs to be implemented"),
    basePath: z.string().optional().describe("Base path for the implementation (optional)"),
    includeSubtasks: z.boolean().optional().describe("Whether to include creation of subtasks (default: true)"),
    maxDepth: z.number().optional().describe("Maximum depth of subtask hierarchy (optional, default: 3)"),
    includeTestStrategy: z.boolean().optional().describe("Whether to include test strategy planning (optional, default: true)"),
    additionalContext: z.string().optional().describe("Additional context or requirements for the implementation (optional)"),
    currentStep: z.number().optional().describe("Current step in the sequential thinking process (internal use)"),
    planSummary: z.string().optional().describe("Brief summary of planning progress so far (internal use)")
});

type PlanEpicParams = z.infer<typeof planEpicSchema>;

export function registerPlanEpicTool(server: McpServer): void {
    server.tool(
        "planEpic",
        "Interactively creates a detailed implementation plan with hierarchical tasks and subtasks through sequential thinking, guiding the agent through multiple steps of refinement. Must be called BEFORE using the createEpic tool to ensure a comprehensive plan.",
        {
            description: descriptionSchema.describe("High-level description of what needs to be implemented"),
            basePath: z.string().optional().describe("Base path for the implementation (optional)"),
            includeSubtasks: z.boolean().optional().describe("Whether to include creation of subtasks (default: true)"),
            maxDepth: z.number().optional().describe("Maximum depth of subtask hierarchy (optional, default: 3)"),
            includeTestStrategy: z.boolean().optional().describe("Whether to include test strategy planning (optional, default: true)"),
            additionalContext: z.string().optional().describe("Additional context or requirements for the implementation (optional)"),
            currentStep: z.number().optional().describe("Current step in the sequential thinking process (internal use)"),
            planSummary: z.string().optional().describe("Brief summary of planning progress so far (internal use)")
        },
        async (params: PlanEpicParams) => {
            const { 
                description, 
                basePath, 
                includeSubtasks = true, 
                maxDepth = 3, 
                includeTestStrategy = true, 
                additionalContext,
                currentStep = 0,
                planSummary = ""
            } = params;
            
            try {
                // Sequential thinking steps
                const steps = [
                    "initialization",
                    "requirement_analysis",
                    "component_breakdown",
                    "task_detailing",
                    "dependency_mapping",
                    "implementation_details",
                    "test_strategy",
                    "finalization"
                ];
                
                const currentStepName = steps[currentStep] || "initialization";
                let prompt = "";
                let nextStep = currentStep;
                
                // STEP 0: Initialization - First call, provide overview
                if (currentStepName === "initialization") {
                    prompt = generateInitializationPrompt(description, basePath, additionalContext, maxDepth, includeTestStrategy);
                    nextStep = 1;
                }
                // STEP 1: Requirements Analysis - Identify and categorize requirements
                else if (currentStepName === "requirement_analysis") {
                    prompt = generateRequirementsAnalysisPrompt(description, planSummary, additionalContext);
                    nextStep = 2;
                }
                // STEP 2: Component Breakdown - Break down into major components
                else if (currentStepName === "component_breakdown") {
                    prompt = generateComponentBreakdownPrompt(description, planSummary);
                    nextStep = 3;
                }
                // STEP 3: Task Detailing - Create specific tasks for each component
                else if (currentStepName === "task_detailing") {
                    prompt = generateTaskDetailingPrompt(description, planSummary, maxDepth);
                    nextStep = 4;
                }
                // STEP 4: Dependency Mapping - Identify dependencies between tasks
                else if (currentStepName === "dependency_mapping") {
                    prompt = generateDependencyMappingPrompt(description, planSummary);
                    nextStep = 5;
                }
                // STEP 5: Implementation Details - Add implementation guidance
                else if (currentStepName === "implementation_details") {
                    prompt = generateImplementationDetailsPrompt(description, planSummary);
                    nextStep = includeTestStrategy ? 6 : 7;
                }
                // STEP 6: Test Strategy - Develop testing approach
                else if (currentStepName === "test_strategy" && includeTestStrategy) {
                    prompt = generateTestStrategyPrompt(description, planSummary);
                    nextStep = 7;
                }
                // STEP 7: Finalization - Complete the planning process
                else if (currentStepName === "finalization") {
                    prompt = generateFinalizationPrompt(description, planSummary, basePath);
                    nextStep = -1; // End of process
                }
                
                // Metadata to guide the agent's next actions
                const metadata: any = {
                    planType: "implementation",
                    includesSubtasks: includeSubtasks,
                    includesTestStrategy: includeTestStrategy,
                    currentStep: currentStep,
                    nextStep: nextStep,
                    stepName: currentStepName,
                    isComplete: nextStep === -1
                };
                
                if (nextStep !== -1) {
                    metadata.nextAction = "Call planEpic with updated planSummary and currentStep";
                    metadata.nextStepName = steps[nextStep];
                } else {
                    metadata.nextAction = "Create Epic structure using batchEpic tool";
                }
                
                return {
                    content: [{ type: "text", text: prompt }],
                    metadata: metadata
                };
            } catch (error: any) {
                return { 
                    content: [{ type: "text", text: `Error creating implementation plan: ${error.message}` }],
                    isError: true 
                };
            }
        }
    );
}

// Helper functions for generating step-specific prompts

function generateInitializationPrompt(description: string, basePath?: string, additionalContext?: string, maxDepth: number = 3, includeTestStrategy: boolean = true): string {
    let prompt = `# Sequential Epic Planning: Step 1 - Getting Started\n\n`;
    
    prompt += `**Project**: ${description}\n`;
    if (basePath) prompt += `**Path**: ${basePath}\n`;
    if (additionalContext) prompt += `**Context**: ${additionalContext}\n\n`;
    
    prompt += `**Planning Process**:\n`;
    prompt += `1. Requirements Analysis\n`;
    prompt += `2. Component Breakdown\n`;
    prompt += `3. Task Detailing (max ${maxDepth} levels)\n`;
    prompt += `4. Dependency Mapping\n`;
    prompt += `5. Implementation Details\n`;
    if (includeTestStrategy) prompt += `6. Test Strategy\n`;
    prompt += `7. Finalization\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic again with:\n`;
    prompt += `- currentStep = 1\n`;
    prompt += `- planSummary = "Starting requirements analysis"\n`;
    
    return prompt;
}

function generateRequirementsAnalysisPrompt(description: string, planSummary: string, additionalContext?: string): string {
    let prompt = `# Sequential Epic Planning: Step 2 - Requirements Analysis\n\n`;
    
    prompt += `**Project**: ${description}\n`;
    if (additionalContext) prompt += `**Additional Context**: ${additionalContext}\n\n`;
    
    prompt += `**Instructions**:\n`;
    prompt += `1. Analyze project requirements thoroughly\n`;
    prompt += `2. Identify functional requirements\n`;
    prompt += `3. Identify non-functional requirements\n`;
    prompt += `4. Note constraints/assumptions\n`;
    prompt += `5. Prioritize requirements\n\n`;
    
    prompt += `**Think About**: What does this project need to accomplish? What are the technical constraints?\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic with:\n`;
    prompt += `- currentStep = 2\n`;
    prompt += `- planSummary = "Requirements analyzed: [key requirements]"\n\n`;
    
    prompt += `Provide a 2-3 sentence summary of requirements in planSummary. Think thoroughly about all requirements before submitting.`;
    
    return prompt;
}

function generateComponentBreakdownPrompt(description: string, planSummary: string): string {
    let prompt = `# Sequential Epic Planning: Step 3 - Component Breakdown\n\n`;
    
    prompt += `**Project**: ${description}\n`;
    prompt += `**Previous Step**: ${planSummary}\n\n`;
    
    prompt += `**Instructions**:\n`;
    prompt += `1. Think through all major components needed\n`;
    prompt += `2. Determine purpose and responsibility of each component\n`;
    prompt += `3. Consider how components interact with each other\n`;
    prompt += `4. Consider technical architecture where relevant\n\n`;
    
    prompt += `**Think About**: What logical parts make up this system? How do they connect?\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic with:\n`;
    prompt += `- currentStep = 3\n`;
    prompt += `- planSummary = "Components identified: [list main components]"\n\n`;
    
    prompt += `Provide a 2-3 sentence summary of key components in planSummary. Think thoroughly about the component architecture before submitting.`;
    
    return prompt;
}

function generateTaskDetailingPrompt(description: string, planSummary: string, maxDepth: number): string {
    let prompt = `# Sequential Epic Planning: Step 4 - Task Detailing\n\n`;
    
    prompt += `**Project**: ${description}\n`;
    prompt += `**Previous Step**: ${planSummary}\n\n`;
    
    prompt += `**Instructions**:\n`;
    prompt += `1. For each component from the previous step, define concrete tasks\n`;
    prompt += `2. Break down complex tasks into hierarchical subtasks (max ${maxDepth} levels)\n`;
    prompt += `3. Make tasks specific and actionable\n`;
    prompt += `4. Assign complexity (1-10) to each task\n\n`;
    
    prompt += `**Think About**: What work needs to be done for each component? How can this be broken down?\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic with:\n`;
    prompt += `- currentStep = 4\n`;
    prompt += `- planSummary = "Tasks defined: [X] tasks across [Y] components"\n\n`;
    
    prompt += `Provide a 2-3 sentence task summary in planSummary. Think thoroughly about all necessary tasks before submitting.`;
    
    return prompt;
}

function generateDependencyMappingPrompt(description: string, planSummary: string): string {
    let prompt = `# Sequential Epic Planning: Step 5 - Dependency Mapping\n\n`;
    
    prompt += `**Project**: ${description}\n`;
    prompt += `**Previous Step**: ${planSummary}\n\n`;
    
    prompt += `**Instructions**:\n`;
    prompt += `1. Identify task dependencies - which tasks must be completed before others\n`;
    prompt += `2. Map out dependencies between components and tasks\n`;
    prompt += `3. Identify critical path tasks\n`;
    prompt += `4. Consider external dependencies (APIs, services, etc.)\n\n`;
    
    prompt += `**Think About**: What is the logical order of implementation? What are the blockers?\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic with:\n`;
    prompt += `- currentStep = 5\n`;
    prompt += `- planSummary = "Dependencies mapped: [key dependencies]"\n\n`;
    
    prompt += `Provide a 2-3 sentence dependency summary in planSummary. Think thoroughly about all dependencies before submitting.`;
    
    return prompt;
}

function generateImplementationDetailsPrompt(description: string, planSummary: string): string {
    let prompt = `# Sequential Epic Planning: Step 6 - Implementation Details\n\n`;
    
    prompt += `**Project**: ${description}\n`;
    prompt += `**Previous Step**: ${planSummary}\n\n`;
    
    prompt += `**Instructions**:\n`;
    prompt += `1. For important tasks, provide technical implementation guidance\n`;
    prompt += `2. Identify recommended approaches, patterns, or algorithms\n`;
    prompt += `3. Note potential challenges and considerations\n`;
    prompt += `4. Think about performance, security, and maintainability\n\n`;
    
    prompt += `**Think About**: How should these components be built? What technical challenges might arise?\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic with:\n`;
    prompt += `- currentStep = 6\n`;
    prompt += `- planSummary = "Implementation approaches defined: [key approaches]"\n\n`;
    
    prompt += `Provide a 2-3 sentence implementation approach summary in planSummary. Think thoroughly about technical implementation before submitting.`;
    
    return prompt;
}

function generateTestStrategyPrompt(description: string, planSummary: string): string {
    let prompt = `# Sequential Epic Planning: Step 7 - Test Strategy\n\n`;
    
    prompt += `**Project**: ${description}\n`;
    prompt += `**Previous Step**: ${planSummary}\n\n`;
    
    prompt += `**Instructions**:\n`;
    prompt += `1. Define appropriate testing levels (unit, integration, system)\n`;
    prompt += `2. Specify testing approaches for different components\n`;
    prompt += `3. Identify test automation opportunities\n`;
    prompt += `4. Consider edge cases and error scenarios\n\n`;
    
    prompt += `**Think About**: How will you verify correctness? What edge cases need testing?\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic with:\n`;
    prompt += `- currentStep = 7\n`;
    prompt += `- planSummary = "Test strategy defined: [testing approach]"\n\n`;
    
    prompt += `Provide a 2-3 sentence test strategy summary in planSummary. Think thoroughly about testing approaches before submitting.`;
    
    return prompt;
}

function generateFinalizationPrompt(description: string, planSummary: string, basePath?: string): string {
    let prompt = `# Sequential Epic Planning: Complete\n\n`;
    
    prompt += `**Project**: ${description}\n`;
    prompt += `**Planning Summary**: ${planSummary}\n\n`;
    
    prompt += `**Planning Completed!**\n\n`;
    
    prompt += `**Next Steps**:\n`;
    prompt += `1. Use the batchEpic tool to create the Epic\n`;
    prompt += `2. Create tasks and subtasks with proper hierarchy\n`;
    prompt += `3. Include dependencies between tasks\n`;
    if (basePath) prompt += `4. Use basePath: "${basePath}"\n\n`;
    
    prompt += `When creating the Epic, rely on your detailed understanding of the requirements, components, tasks, dependencies, implementation details, and test strategy that you've developed during this planning process.\n\n`;
    
    prompt += `Now call the batchEpic tool to create the Epic.`;
    
    return prompt;
} 
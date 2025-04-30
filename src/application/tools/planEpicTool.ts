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
    planContext: z.string().optional().describe("Accumulated context from previous steps (internal use)")
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
            planContext: z.string().optional().describe("Accumulated context from previous steps (internal use)")
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
                planContext = ""
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
                let updatedContext = planContext;
                
                // STEP 0: Initialization - First call, provide overview
                if (currentStepName === "initialization") {
                    prompt = generateInitializationPrompt(description, basePath, additionalContext, maxDepth, includeTestStrategy);
                    nextStep = 1;
                }
                // STEP 1: Requirements Analysis - Identify and categorize requirements
                else if (currentStepName === "requirement_analysis") {
                    prompt = generateRequirementsAnalysisPrompt(description, planContext);
                    nextStep = 2;
                }
                // STEP 2: Component Breakdown - Break down into major components
                else if (currentStepName === "component_breakdown") {
                    prompt = generateComponentBreakdownPrompt(planContext);
                    nextStep = 3;
                }
                // STEP 3: Task Detailing - Create specific tasks for each component
                else if (currentStepName === "task_detailing") {
                    prompt = generateTaskDetailingPrompt(planContext, maxDepth);
                    nextStep = 4;
                }
                // STEP 4: Dependency Mapping - Identify dependencies between tasks
                else if (currentStepName === "dependency_mapping") {
                    prompt = generateDependencyMappingPrompt(planContext);
                    nextStep = 5;
                }
                // STEP 5: Implementation Details - Add implementation guidance
                else if (currentStepName === "implementation_details") {
                    prompt = generateImplementationDetailsPrompt(planContext);
                    nextStep = includeTestStrategy ? 6 : 7;
                }
                // STEP 6: Test Strategy - Develop testing approach
                else if (currentStepName === "test_strategy" && includeTestStrategy) {
                    prompt = generateTestStrategyPrompt(planContext);
                    nextStep = 7;
                }
                // STEP 7: Finalization - Complete the planning process
                else if (currentStepName === "finalization") {
                    prompt = generateFinalizationPrompt(planContext, basePath);
                    nextStep = -1; // End of process
                }
                
                // Update context with new information
                if (currentStep > 0) {
                    updatedContext = `${planContext}\n\n--- STEP ${currentStep}: ${currentStepName.toUpperCase().replace("_", " ")} ---\n\n`;
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
                    metadata.nextAction = "Call planEpic again with updated planContext and currentStep";
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
    prompt += `- planContext = "READY"\n`;
    
    return prompt;
}

function generateRequirementsAnalysisPrompt(description: string, planContext: string): string {
    let prompt = `# Sequential Epic Planning: Step 2 - Requirements Analysis\n\n`;
    
    prompt += `**Instructions**:\n`;
    prompt += `1. Identify functional requirements\n`;
    prompt += `2. Identify non-functional requirements\n`;
    prompt += `3. Note constraints/assumptions\n`;
    prompt += `4. Prioritize requirements\n\n`;
    
    prompt += `**Format Your Response As**:\n`;
    prompt += `REQUIREMENTS ANALYSIS:\n`;
    prompt += `- Functional Requirements: [list]\n`;
    prompt += `- Non-Functional Requirements: [list]\n`;
    prompt += `- Constraints/Assumptions: [list]\n`;
    prompt += `- Prioritization: [high/medium/low]\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic with currentStep = 2 and include your analysis in planContext.`;
    
    return prompt;
}

function generateComponentBreakdownPrompt(planContext: string): string {
    let prompt = `# Sequential Epic Planning: Step 3 - Component Breakdown\n\n`;
    
    prompt += `**Instructions**:\n`;
    prompt += `1. Identify major components needed\n`;
    prompt += `2. Describe each component's purpose\n`;
    prompt += `3. Consider component interactions\n\n`;
    
    prompt += `**Format Your Response As**:\n`;
    prompt += `COMPONENT BREAKDOWN:\n`;
    prompt += `1. [Component Name]:\n   - Purpose: [description]\n   - Responsibilities: [list]\n   - Technical Considerations: [details]\n\n`;
    prompt += `Component Interactions: [description]\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic with currentStep = 3 and include your component breakdown in planContext.`;
    
    return prompt;
}

function generateTaskDetailingPrompt(planContext: string, maxDepth: number): string {
    let prompt = `# Sequential Epic Planning: Step 4 - Task Detailing\n\n`;
    
    prompt += `**Instructions**:\n`;
    prompt += `1. For each component, define main tasks\n`;
    prompt += `2. Break down into subtasks (max ${maxDepth} levels)\n`;
    prompt += `3. Assign complexity (1-10) to each task\n\n`;
    
    prompt += `**Format Your Response As**:\n`;
    prompt += `TASK BREAKDOWN:\n`;
    prompt += `Component: [Name]\n`;
    prompt += `- Task 1: [description] (Complexity: [1-10])\n`;
    prompt += `  - Subtask 1.1: [description] (Complexity: [1-10])\n`;
    prompt += `    - Subtask 1.1.1: [description] (Complexity: [1-10])\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic with currentStep = 4 and include your task breakdown in planContext.`;
    
    return prompt;
}

function generateDependencyMappingPrompt(planContext: string): string {
    let prompt = `# Sequential Epic Planning: Step 5 - Dependency Mapping\n\n`;
    
    prompt += `**Instructions**:\n`;
    prompt += `1. Identify which tasks depend on others\n`;
    prompt += `2. Map dependencies between tasks\n`;
    prompt += `3. Identify critical path and external dependencies\n\n`;
    
    prompt += `**Format Your Response As**:\n`;
    prompt += `DEPENDENCY MAPPING:\n`;
    prompt += `Task Dependencies:\n`;
    prompt += `- [Task] depends on: [dependencies]\n`;
    prompt += `Critical Path: [list]\n`;
    prompt += `External Dependencies: [list]\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic with currentStep = 5 and include your dependency mapping in planContext.`;
    
    return prompt;
}

function generateImplementationDetailsPrompt(planContext: string): string {
    let prompt = `# Sequential Epic Planning: Step 6 - Implementation Details\n\n`;
    
    prompt += `**Instructions**:\n`;
    prompt += `1. Provide technical approach for key tasks\n`;
    prompt += `2. Note potential challenges\n`;
    prompt += `3. Include performance, security considerations\n\n`;
    
    prompt += `**Format Your Response As**:\n`;
    prompt += `IMPLEMENTATION DETAILS:\n`;
    prompt += `Task: [description]\n`;
    prompt += `- Technical Approach: [approach]\n`;
    prompt += `- Considerations: [list]\n`;
    prompt += `- Potential Challenges: [list]\n\n`;
    prompt += `General Guidelines: [list]\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic with currentStep = 6 and include your implementation details in planContext.`;
    
    return prompt;
}

function generateTestStrategyPrompt(planContext: string): string {
    let prompt = `# Sequential Epic Planning: Step 7 - Test Strategy\n\n`;
    
    prompt += `**Instructions**:\n`;
    prompt += `1. Define testing levels (unit, integration, etc.)\n`;
    prompt += `2. Specify approaches for key components\n`;
    prompt += `3. Identify test automation opportunities\n\n`;
    
    prompt += `**Format Your Response As**:\n`;
    prompt += `TEST STRATEGY:\n`;
    prompt += `Overall Approach: [description]\n`;
    prompt += `Testing Levels: [unit/integration/system approaches]\n`;
    prompt += `Component-Specific Testing: [list by component]\n`;
    prompt += `Test Automation: [approach]\n`;
    prompt += `Edge Cases: [list]\n\n`;
    
    prompt += `**Next Step**:\n`;
    prompt += `Call planEpic with currentStep = 7 and include your test strategy in planContext.`;
    
    return prompt;
}

function generateFinalizationPrompt(planContext: string, basePath?: string): string {
    let prompt = `# Sequential Epic Planning: Complete\n\n`;
    
    prompt += `**Next Steps**:\n`;
    prompt += `1. Use batchEpic tool to create the Epic with all tasks\n`;
    prompt += `2. Include task hierarchy, subtasks, and dependencies\n`;
    if (basePath) prompt += `3. Use basePath: "${basePath}"\n`;
    prompt += `4. Review with getEpicOverview after creation\n\n`;
    
    prompt += `Planning complete. Proceed to Epic creation.`;
    
    return prompt;
} 
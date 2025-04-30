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
    let prompt = `# Sequential Epic Planning: Getting Started\n\n`;
    prompt += `## About This Process\n`;
    prompt += `We'll work through a structured, step-by-step approach to create a detailed Epic plan. This sequential thinking process will help break down complex problems into manageable parts. You must complete this planning process BEFORE using the createEpic tool.\n\n`;
    
    prompt += `## Project Overview\n`;
    prompt += `- **Goal**: ${description}\n`;
    if (basePath) prompt += `- **Base Path**: ${basePath}\n`;
    if (additionalContext) prompt += `- **Additional Context**: ${additionalContext}\n\n`;
    
    prompt += `## Our Process\n`;
    prompt += `1. **Requirements Analysis**: Identify and categorize all requirements\n`;
    prompt += `2. **Component Breakdown**: Break requirements into major components\n`;
    prompt += `3. **Task Detailing**: Create specific tasks for each component (up to ${maxDepth} levels deep)\n`;
    prompt += `4. **Dependency Mapping**: Identify dependencies between tasks\n`;
    prompt += `5. **Implementation Details**: Add detailed implementation guidance\n`;
    if (includeTestStrategy) prompt += `6. **Test Strategy**: Develop a comprehensive testing approach\n`;
    prompt += `7. **Finalization**: Complete the plan and prepare for creation\n\n`;
    
    prompt += `## What To Do Now\n`;
    prompt += `Review the project details above and think about the requirements. In the next step, I'll ask you to analyze these requirements in detail.\n\n`;
    prompt += `When you're ready, call this tool again with:\n`;
    prompt += `- The same parameters as before\n`;
    prompt += `- currentStep = 1 (for Requirements Analysis)\n`;
    prompt += `- planContext = "READY" (or add any initial thoughts)\n\n`;
    
    prompt += `Remember: You must complete ALL steps of this planning process BEFORE calling the createEpic tool.\n\n`;
    prompt += `Let's start building a comprehensive Epic plan!`;
    
    return prompt;
}

function generateRequirementsAnalysisPrompt(description: string, planContext: string): string {
    let prompt = `# Sequential Epic Planning: Requirements Analysis\n\n`;
    prompt += `## Current Task\n`;
    prompt += `Analyze the requirements for: "${description}"\n\n`;
    
    prompt += `## What To Do\n`;
    prompt += `1. Identify all functional requirements\n`;
    prompt += `2. Identify all non-functional requirements (performance, security, etc.)\n`;
    prompt += `3. Note any constraints or assumptions\n`;
    prompt += `4. Prioritize requirements if possible\n\n`;
    
    prompt += `## Your Analysis\n`;
    prompt += `Think deeply about what this implementation needs. Break down the high-level description into specific, actionable requirements.\n\n`;
    prompt += `When done, call this tool again with:\n`;
    prompt += `- currentStep = 2 (for Component Breakdown)\n`;
    prompt += `- planContext = your requirements analysis (preserve the format below)\n\n`;
    
    prompt += `## Format For Your Response\n`;
    prompt += `REQUIREMENTS ANALYSIS:\n`;
    prompt += `- Functional Requirements:\n  - [List each requirement]\n`;
    prompt += `- Non-Functional Requirements:\n  - [List each requirement]\n`;
    prompt += `- Constraints/Assumptions:\n  - [List any constraints]\n`;
    prompt += `- Prioritization:\n  - [High priority requirements]\n  - [Medium priority requirements]\n  - [Low priority requirements]\n`;
    
    return prompt;
}

function generateComponentBreakdownPrompt(planContext: string): string {
    let prompt = `# Sequential Epic Planning: Component Breakdown\n\n`;
    prompt += `## Previous Analysis\n`;
    prompt += `${planContext}\n\n`;
    
    prompt += `## Current Task\n`;
    prompt += `Break down the requirements into major logical components or modules.\n\n`;
    
    prompt += `## What To Do\n`;
    prompt += `1. Identify the major components needed to fulfill all requirements\n`;
    prompt += `2. Describe each component's purpose and responsibility\n`;
    prompt += `3. Consider interactions between components\n`;
    prompt += `4. Think about technical architecture where relevant\n\n`;
    
    prompt += `## Your Analysis\n`;
    prompt += `Based on the requirements, what are the logical building blocks for this implementation?\n\n`;
    prompt += `When done, call this tool again with:\n`;
    prompt += `- currentStep = 3 (for Task Detailing)\n`;
    prompt += `- planContext = previous context + your component breakdown (preserve the format below)\n\n`;
    
    prompt += `## Format For Your Response\n`;
    prompt += `COMPONENT BREAKDOWN:\n`;
    prompt += `1. [Component Name]:\n   - Purpose: [brief description]\n   - Responsibilities: [list main responsibilities]\n   - Technical Considerations: [any relevant technical details]\n\n`;
    prompt += `2. [Component Name]:\n   - Purpose: [brief description]\n   - Responsibilities: [list main responsibilities]\n   - Technical Considerations: [any relevant technical details]\n\n`;
    prompt += `[Continue for all identified components]\n\n`;
    prompt += `Component Interactions:\n- [Describe how components interact with each other]\n`;
    
    return prompt;
}

function generateTaskDetailingPrompt(planContext: string, maxDepth: number): string {
    let prompt = `# Sequential Epic Planning: Task Detailing\n\n`;
    prompt += `## Previous Analysis\n`;
    prompt += `${planContext}\n\n`;
    
    prompt += `## Current Task\n`;
    prompt += `Create specific tasks for each component, creating a hierarchical structure up to ${maxDepth} levels deep.\n\n`;
    
    prompt += `## What To Do\n`;
    prompt += `1. For each component, define main tasks\n`;
    prompt += `2. Break down each main task into subtasks where appropriate\n`;
    prompt += `3. Continue breaking down to appropriate detail level (up to ${maxDepth} levels)\n`;
    prompt += `4. Assign a rough complexity to each task (1-10)\n\n`;
    
    prompt += `## Your Analysis\n`;
    prompt += `Create a hierarchical task breakdown, ensuring each task is specific and actionable.\n\n`;
    prompt += `When done, call this tool again with:\n`;
    prompt += `- currentStep = 4 (for Dependency Mapping)\n`;
    prompt += `- planContext = previous context + your task breakdown (preserve the format below)\n\n`;
    
    prompt += `## Format For Your Response\n`;
    prompt += `TASK BREAKDOWN:\n\n`;
    prompt += `Component: [Component Name]\n`;
    prompt += `- Task 1: [Task description] (Complexity: [1-10])\n`;
    prompt += `  - Subtask 1.1: [Subtask description] (Complexity: [1-10])\n`;
    prompt += `    - Subtask 1.1.1: [Subtask description] (Complexity: [1-10])\n`;
    prompt += `  - Subtask 1.2: [Subtask description] (Complexity: [1-10])\n`;
    prompt += `- Task 2: [Task description] (Complexity: [1-10])\n`;
    prompt += `  [Continue with subtasks as needed]\n\n`;
    prompt += `[Repeat for each component]\n`;
    
    return prompt;
}

function generateDependencyMappingPrompt(planContext: string): string {
    let prompt = `# Sequential Epic Planning: Dependency Mapping\n\n`;
    prompt += `## Previous Analysis\n`;
    prompt += `${planContext}\n\n`;
    
    prompt += `## Current Task\n`;
    prompt += `Identify dependencies between tasks across all components.\n\n`;
    
    prompt += `## What To Do\n`;
    prompt += `1. Review the task breakdown from the previous step\n`;
    prompt += `2. Identify which tasks must be completed before others can start\n`;
    prompt += `3. Create a dependency map showing these relationships\n`;
    prompt += `4. Consider any external dependencies as well\n\n`;
    
    prompt += `## Your Analysis\n`;
    prompt += `Map out task dependencies, focusing on critical path items and potential bottlenecks.\n\n`;
    prompt += `When done, call this tool again with:\n`;
    prompt += `- currentStep = 5 (for Implementation Details)\n`;
    prompt += `- planContext = previous context + your dependency analysis (preserve the format below)\n\n`;
    
    prompt += `## Format For Your Response\n`;
    prompt += `DEPENDENCY MAPPING:\n\n`;
    prompt += `Task Dependencies:\n`;
    prompt += `- [Task/Subtask ID or description] depends on: [List of dependencies]\n`;
    prompt += `- [Task/Subtask ID or description] depends on: [List of dependencies]\n`;
    prompt += `[Continue for all relevant dependencies]\n\n`;
    
    prompt += `Critical Path:\n`;
    prompt += `- [List tasks on the critical path]\n\n`;
    
    prompt += `External Dependencies:\n`;
    prompt += `- [List any external systems, APIs, or resources needed]\n`;
    
    return prompt;
}

function generateImplementationDetailsPrompt(planContext: string): string {
    let prompt = `# Sequential Epic Planning: Implementation Details\n\n`;
    prompt += `## Previous Analysis\n`;
    prompt += `${planContext}\n\n`;
    
    prompt += `## Current Task\n`;
    prompt += `Add detailed implementation guidance for the identified tasks.\n\n`;
    
    prompt += `## What To Do\n`;
    prompt += `1. For each significant task, provide implementation details\n`;
    prompt += `2. Include technical approaches, patterns, or algorithms to consider\n`;
    prompt += `3. Note any potential challenges or areas requiring special attention\n`;
    prompt += `4. Consider performance, security, and maintainability aspects\n\n`;
    
    prompt += `## Your Analysis\n`;
    prompt += `Provide practical guidance that would help someone implementing each task.\n\n`;
    prompt += `When done, call this tool again with:\n`;
    prompt += `- currentStep = 6 (for Test Strategy) or 7 (for Finalization, if test strategy is not included)\n`;
    prompt += `- planContext = previous context + your implementation details (preserve the format below)\n\n`;
    
    prompt += `## Format For Your Response\n`;
    prompt += `IMPLEMENTATION DETAILS:\n\n`;
    prompt += `Task: [Task/Subtask description]\n`;
    prompt += `- Technical Approach: [Describe the recommended approach]\n`;
    prompt += `- Considerations: [List important considerations]\n`;
    prompt += `- Potential Challenges: [Describe any challenges]\n\n`;
    prompt += `[Repeat for significant tasks]\n\n`;
    
    prompt += `General Implementation Guidelines:\n`;
    prompt += `- [List any overall guidelines, coding standards, etc.]\n`;
    
    return prompt;
}

function generateTestStrategyPrompt(planContext: string): string {
    let prompt = `# Sequential Epic Planning: Test Strategy\n\n`;
    prompt += `## Previous Analysis\n`;
    prompt += `${planContext}\n\n`;
    
    prompt += `## Current Task\n`;
    prompt += `Develop a comprehensive testing approach for the implementation.\n\n`;
    
    prompt += `## What To Do\n`;
    prompt += `1. Define testing levels (unit, integration, system, etc.)\n`;
    prompt += `2. Specify testing approaches for key components\n`;
    prompt += `3. Identify test automation opportunities\n`;
    prompt += `4. Consider edge cases and error scenarios\n\n`;
    
    prompt += `## Your Analysis\n`;
    prompt += `Create a testing strategy that ensures quality implementation.\n\n`;
    prompt += `When done, call this tool again with:\n`;
    prompt += `- currentStep = 7 (for Finalization)\n`;
    prompt += `- planContext = previous context + your test strategy (preserve the format below)\n\n`;
    
    prompt += `## Format For Your Response\n`;
    prompt += `TEST STRATEGY:\n\n`;
    prompt += `Overall Approach:\n`;
    prompt += `- [Describe the overall testing philosophy/approach]\n\n`;
    
    prompt += `Testing Levels:\n`;
    prompt += `- Unit Testing: [Approach and coverage]\n`;
    prompt += `- Integration Testing: [Approach and focus areas]\n`;
    prompt += `- System Testing: [Approach and scenarios]\n`;
    prompt += `- [Other relevant testing types]\n\n`;
    
    prompt += `Component-Specific Testing:\n`;
    prompt += `- [Component]: [Specific testing considerations]\n`;
    prompt += `[Repeat for key components]\n\n`;
    
    prompt += `Test Automation:\n`;
    prompt += `- [Automation approach and tools]\n`;
    prompt += `- [Areas prioritized for automation]\n\n`;
    
    prompt += `Edge Cases and Error Handling:\n`;
    prompt += `- [List important edge cases to test]\n`;
    prompt += `- [Error scenarios to verify]\n`;
    
    return prompt;
}

function generateFinalizationPrompt(planContext: string, basePath?: string): string {
    let prompt = `# Sequential Epic Planning: Finalization\n\n`;
    prompt += `## Complete Plan\n`;
    prompt += `${planContext}\n\n`;
    
    prompt += `## Next Steps\n`;
    prompt += `We've completed our sequential thinking process and created a comprehensive Epic plan. Now it's time to formalize this plan by creating an Epic with Tasks and Subtasks.\n\n`;
    
    prompt += `## Action Items\n`;
    prompt += `1. Review the complete plan above to ensure it covers all requirements and has appropriate detail\n`;
    prompt += `2. Use the \`batchEpic\` tool to create the complete Epic structure in a single operation:\n`;
    prompt += `   - Include all tasks with proper hierarchy\n`;
    prompt += `   - Include all subtasks for each task\n`;
    prompt += `   - Include dependencies as defined\n`;
    prompt += `   - Set appropriate complexity values\n\n`;
    
    if (basePath) {
        prompt += `3. When calling batchEpic, use basePath: "${basePath}"\n\n`;
    }
    
    prompt += `4. After creating the Epic, use the \`getEpicOverview\` tool to review the created structure\n\n`;
    
    prompt += `## Important\n`;
    prompt += `- You've now completed the planEpic process. The next step is to call the batchEpic tool\n`;
    prompt += `- The batchEpic tool allows you to create the complete Epic with all tasks and subtasks in a single operation\n`;
    prompt += `- Ensure the Epic captures the hierarchical structure we've developed\n`;
    prompt += `- Include all the implementation details and test strategy in the appropriate descriptions\n`;
    prompt += `- Set up the dependencies correctly based on our dependency mapping\n\n`;
    
    prompt += `You now have a comprehensive Epic plan ready to be created with the batchEpic tool!`;
    
    return prompt;
} 
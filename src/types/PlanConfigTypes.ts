/**
 * Configuration for a planning step
 */
export interface PlanStep {
    id: string;                  // Unique identifier for the step
    name: string;                // Display name for the step
    description: string;         // Description of what this step accomplishes
    order: number;               // Order in the planning process (0-based)
    instructions: string[];      // List of instructions to show for this step
    thinkingPrompts: string[];   // Thinking prompts to guide reflection
    nextStepPrompt: string;      // Template for suggesting the next step
    requiresPreviousStepData: boolean; // If true, this step requires data from previous step
}

/**
 * Complete planning configuration
 */
export interface PlanConfiguration {
    id: string;                  // Unique identifier for this configuration
    name: string;                // Name of this planning configuration
    description: string;         // Description of what this planning process does
    version: string;             // Version of the configuration
    steps: PlanStep[];           // Ordered steps in the planning process
    defaultMaxDepth?: number;    // Default maximum task hierarchy depth
    includeTestStrategy?: boolean; // Whether test strategy is included by default
}

/**
 * Result from loading a plan configuration
 */
export interface LoadPlanConfigResult {
    success: boolean;
    configuration?: PlanConfiguration;
    error?: string;
} 
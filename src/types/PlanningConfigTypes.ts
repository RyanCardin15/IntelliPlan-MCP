/**
 * Types for the createPlanningConfig tool
 */

/**
 * Parameters for creating a planning configuration
 */
export interface CreatePlanningConfigParams {
    name: string;                // Name of the planning configuration
    description: string;         // Description of what this planning process does
    steps: PlanningStep[];       // Steps to include in the planning process
    outputPath: string;          // FULL path where the config should be saved (e.g., '/path/to/config/myconfig.json')
    defaultMaxDepth?: number;    // Default maximum task hierarchy depth
    includeTestStrategy?: boolean; // Whether test strategy is included by default
}

/**
 * A step in the planning process
 */
export interface PlanningStep {
    id: string;                  // Unique identifier for this step
    name: string;                // Display name for this step
    description: string;         // Description of what this step accomplishes
    order: number;               // Order in the planning sequence (0-based)
    instructions: string[];      // Instructions for this planning step
    thinkingPrompts: string[];   // Thinking prompts to aid reflection
    nextStepPrompt: string;      // Prompt for moving to the next step
    requiresPreviousStepData: boolean; // Whether this step requires data from previous steps
}

/**
 * Response from creating a planning configuration
 */
export interface CreatePlanningConfigResponse {
    success: boolean;
    configPath?: string;         // Path to the created config file
    error?: string;              // Error message if creation failed
}

/**
 * Parameters for progressive planning configuration building
 */
export interface ProgressivePlanningConfigParams {
    currentStep: number;         // Current step in the configuration building process
    configId?: string;           // ID of the configuration being built
    stepsCompleted?: string[];   // IDs of steps that have been completed
    partialConfig?: Partial<CreatePlanningConfigParams>; // Partial configuration built so far
} 
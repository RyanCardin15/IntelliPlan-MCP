import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Epic, EpicStore, Task, Subtask } from '../../domain/task/entities/Task.js';

// Use home directory for storage to ensure consistent location regardless of execution directory
const HOME_DIR = os.homedir();

// Storage configurations
const DEFAULT_BASE_DIR = 'intelliplan';
const EPICS_DIR_NAME = 'epics';

// Storage paths - initialized to empty, must be set with configureStorage
let BASE_DIR = '';
let EPICS_DIR = '';
let EPICS_STORE_FILE = '';

// Internal store, not exported directly
let epicStore: EpicStore = {};

/**
 * Configure the storage location for Epics
 * @param basePath Base path where IntelliPlan directory will be created (required)
 * @returns Current epics storage directory path
 */
export function configureStorage(basePath: string): string {
    if (!basePath) {
        throw new Error('Base path is required for storage configuration');
    }
    
    BASE_DIR = path.join(basePath, DEFAULT_BASE_DIR);
    EPICS_DIR = path.join(BASE_DIR, EPICS_DIR_NAME);
    EPICS_STORE_FILE = path.join(EPICS_DIR, 'epics.json');
    return EPICS_DIR;
}

/**
 * Get current storage directory path for Epics
 */
export function getStoragePath(): string {
    if (!EPICS_DIR) {
        throw new Error('Storage not configured. Call configureStorage first.');
    }
    return EPICS_DIR;
}

/**
 * Get base intelliplan directory
 */
export function getBaseDir(): string {
    if (!BASE_DIR) {
        throw new Error('Storage not configured. Call configureStorage first.');
    }
    return BASE_DIR;
}

/**
 * Get path to a specific Epic folder
 * @param epicId The Epic ID
 */
export function getEpicFolder(epicId: string): string {
    if (!EPICS_DIR) {
        throw new Error('Storage not configured. Call configureStorage first.');
    }
    return path.join(EPICS_DIR, epicId);
}

/**
 * Helper to check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Ensures the main epics storage directory exists
 */
async function ensureEpicsStorageDir(): Promise<void> {
    if (!EPICS_DIR) {
        throw new Error('Storage not configured. Call configureStorage first.');
    }
    
    try {
        await fs.mkdir(EPICS_DIR, { recursive: true });
    } catch (error) {
        throw error; // Re-throw to handle higher up
    }
}

/**
 * Ensures the specific epic directory exists
 */
async function ensureEpicDir(epicId: string): Promise<void> {
    if (!EPICS_DIR) {
        throw new Error('Storage not configured. Call configureStorage first.');
    }
    
    try {
        const epicDir = getEpicFolder(epicId);
        await fs.mkdir(epicDir, { recursive: true });
    } catch (error) {
        throw error;
    }
}

/**
 * Loads Epics for the current workspace
 */
export async function loadEpics(): Promise<void> {
    if (!EPICS_STORE_FILE) {
        throw new Error('Storage not configured. Call configureStorage first.');
    }
    
    try {
        await ensureEpicsStorageDir(); // Ensure main epics directory exists
        
        try {
            const data = await fs.readFile(EPICS_STORE_FILE, 'utf-8');
            epicStore = JSON.parse(data);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                epicStore = {};
                // Create an initial empty file
                await saveEpics();
            } else {
                console.error("Error parsing epics.json, starting fresh:", error);
                epicStore = {}; // Start fresh on load error
                await saveEpics();
            }
        }
    } catch (error) {
        console.error("Failed to load epics:", error);
        throw error;
    }
}

/**
 * Saves Epics for the current workspace
 */
export async function saveEpics(): Promise<void> {
    if (!EPICS_STORE_FILE) {
        // If not configured, we cannot save. Log an error or throw?
        // For now, let's log and return, assuming configuration should happen first.
        console.error('Storage not configured. Cannot save epics. Call configureStorage first.');
        return; 
        // Alternatively: throw new Error('Storage not configured. Call configureStorage first.');
    }
    
    try {
        await ensureEpicsStorageDir();
        // Save the main epics index file
        await fs.writeFile(EPICS_STORE_FILE, JSON.stringify(epicStore, null, 2), 'utf-8');
        
        // Save individual epic files (containing their tasks and subtasks)
        for (const epicId in epicStore) {
            await ensureEpicDir(epicId);
            const epicFile = path.join(getEpicFolder(epicId), 'epic.json');
            await fs.writeFile(epicFile, JSON.stringify(epicStore[epicId], null, 2), 'utf-8');
        }
    } catch (error) {
        console.error("Failed to save epics:", error);
        throw error;
    }
}

/**
 * Get all Epics as an array
 */
export function getEpics(): Epic[] {
    return Object.values(epicStore);
}

/**
 * Get a specific Epic by ID
 */
export function getEpicById(epicId: string): Epic | undefined {
    return epicStore[epicId];
}

/**
 * Get a specific Task by its ID (searches within all Epics)
 */
export function getTaskById(taskId: string): { epic: Epic; task: Task } | undefined {
    for (const epic of Object.values(epicStore)) {
        const task = epic.tasks.find(t => t.id === taskId);
        if (task) {
            return { epic, task };
        }
    }
    return undefined;
}

/**
 * Get a specific Subtask by its ID (searches within all Tasks in all Epics)
 */
export function getSubtaskById(subtaskId: string): { epic: Epic; task: Task; subtask: Subtask } | undefined {
    for (const epic of Object.values(epicStore)) {
        for (const task of epic.tasks) {
            const subtask = task.subtasks.find(s => s.id === subtaskId);
            if (subtask) {
                return { epic, task, subtask };
            }
        }
    }
    return undefined;
}

/**
 * Add a new Epic to the store
 * @returns {boolean} True if successful
 */
export function addEpic(epic: Epic): boolean {
    if (!epic || !epic.id || epicStore[epic.id]) {
        return false; // Prevent adding null/duplicate IDs
    }
    epicStore[epic.id] = epic;
    return true;
}

/**
 * Update an existing Epic in the store
 * @returns {boolean} True if Epic was found and updated
 */
export function updateEpicStore(epicId: string, updatedEpic: Epic): boolean {
    if (!epicStore[epicId]) {
        return false;
    }
    epicStore[epicId] = updatedEpic;
    return true;
}

/**
 * Delete an Epic from the store
 * @returns {boolean} True if Epic was found and deleted
 */
export function deleteEpicFromStore(epicId: string): boolean {
    if (!epicStore[epicId]) {
        return false;
    }
    
    delete epicStore[epicId];
    
    // Also delete the epic directory asynchronously
    try {
        const epicDir = getEpicFolder(epicId);
        fs.rm(epicDir, { recursive: true, force: true }).catch(err => {
            console.error(`Failed to delete directory for epic ${epicId}:`, err);
        });
    } catch (error) {
        console.error(`Error initiating deletion of directory for epic ${epicId}:`, error);
    }
    
    return true;
}

// Example: Add a Task to an Epic
export function addTaskToEpic(epicId: string, task: Task): boolean {
    const epic = epicStore[epicId];
    if (!epic || !task || !task.id) {
        return false;
    }
    // Check if task ID already exists within this epic
    if (epic.tasks.some(t => t.id === task.id)) {
        return false; // Or handle as update?
    }
    epic.tasks.push(task);
    return true;
}

// ... Add similar functions for updateTaskInEpic, deleteTaskFromEpic, 
//     addSubtaskToTask, updateSubtaskInTask, deleteSubtaskFromTask ...
// These will require finding the parent Epic/Task first. 
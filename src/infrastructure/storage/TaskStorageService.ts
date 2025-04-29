import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Task, TaskStore } from '../../types/TaskTypes.js';

// Use home directory for storage to ensure consistent location regardless of execution directory
const HOME_DIR = os.homedir();

// Storage configurations
const DEFAULT_HIDDEN_DIR = '.intelliplan'; // Hidden by default (with dot prefix)
const DEFAULT_VISIBLE_DIR = 'intelliplan'; // Visible alternative
let USE_HIDDEN_STORAGE = true; // Default to hidden storage

// Storage paths
let STORAGE_DIR = path.join(HOME_DIR, USE_HIDDEN_STORAGE ? DEFAULT_HIDDEN_DIR : DEFAULT_VISIBLE_DIR);
let STORAGE_FILE = path.join(STORAGE_DIR, 'tasks.json');

// Internal store, not exported directly
let taskStore: TaskStore = {};

/**
 * Configure the storage location
 * @param useHidden Whether to use hidden storage (true) or visible storage (false)
 * @returns Current storage path
 */
export function configureStorage(useHidden: boolean): string {
    USE_HIDDEN_STORAGE = useHidden;
    STORAGE_DIR = path.join(HOME_DIR, USE_HIDDEN_STORAGE ? DEFAULT_HIDDEN_DIR : DEFAULT_VISIBLE_DIR);
    STORAGE_FILE = path.join(STORAGE_DIR, 'tasks.json');
    return STORAGE_DIR;
}

/**
 * Get current storage path
 */
export function getStoragePath(): string {
    return STORAGE_DIR;
}

/**
 * Check if current storage is hidden
 */
export function isStorageHidden(): boolean {
    return USE_HIDDEN_STORAGE;
}

/**
 * Toggle between hidden and visible storage
 * Will move existing data to the new location
 * @returns New storage path
 */
export async function toggleStorageVisibility(): Promise<string> {
    // Determine current and new paths
    const currentDir = STORAGE_DIR;
    const newUseHidden = !USE_HIDDEN_STORAGE;
    const newDir = path.join(HOME_DIR, newUseHidden ? DEFAULT_HIDDEN_DIR : DEFAULT_VISIBLE_DIR);
    const newFile = path.join(newDir, 'tasks.json');
    
    try {
        // Save current data if it exists
        const hasExistingData = await fileExists(STORAGE_FILE);
        
        // Update configuration
        USE_HIDDEN_STORAGE = newUseHidden;
        STORAGE_DIR = newDir;
        STORAGE_FILE = newFile;
        
        // Ensure new directory exists
        await ensureStorageDir();
        
        // If we have data, migrate it
        if (hasExistingData) {
            try {
                // Read from old location
                const data = await fs.readFile(path.join(currentDir, 'tasks.json'), 'utf-8');
                // Write to new location
                await fs.writeFile(STORAGE_FILE, data, 'utf-8');
            } catch (error: any) {
                // If we can't migrate, at least save current in-memory data
                if (Object.keys(taskStore).length > 0) {
                    await saveTasks();
                }
            }
        } else if (Object.keys(taskStore).length > 0) {
            // No existing file but we have in-memory data
            await saveTasks();
        }
        
        return STORAGE_DIR;
    } catch (error) {
        throw error;
    }
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
 * Ensures the storage directory exists
 */
async function ensureStorageDir(): Promise<void> {
    try {
        await fs.mkdir(STORAGE_DIR, { recursive: true });
    } catch (error) {
        throw error; // Re-throw to handle higher up
    }
}

/**
 * Loads tasks for the current workspace
 */
export async function loadTasks(): Promise<void> {
    try {
        await ensureStorageDir(); // Ensure storage directory exists
        
        try {
            const data = await fs.readFile(STORAGE_FILE, 'utf-8');
            taskStore = JSON.parse(data);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                taskStore = {};
                // Create an initial empty file
                await saveTasks();
            } else {
                taskStore = {}; // Start fresh on load error
                await saveTasks();
            }
        }
    } catch (error) {
        throw error;
    }
}

/**
 * Saves tasks for the current workspace
 */
export async function saveTasks(): Promise<void> {
    try {
        await ensureStorageDir();
        await fs.writeFile(STORAGE_FILE, JSON.stringify(taskStore, null, 2), 'utf-8');
    } catch (error) {
        throw error;
    }
}

/**
 * Get all tasks as an array
 */
export function getTasks(): Task[] {
    return Object.values(taskStore);
}

/**
 * Get a specific task by ID
 */
export function getTaskById(taskId: string): Task | undefined {
    return taskStore[taskId];
}

/**
 * Add a new task to the store
 * 
 * @returns {boolean} True if successful
 */
export function addTask(task: Task): boolean {
    try {
        if (!task.id) {
            return false;
        }
        
        taskStore[task.id] = task;
        return true;
    } catch (error) {
        return false;
    }
    // Note: saveTasks needs to be called explicitly after modifications
}

/**
 * Update an existing task
 * 
 * @returns {boolean} True if task was found and updated
 */
export function updateTaskStore(taskId: string, updatedTask: Task): boolean {
    if (!taskStore[taskId]) {
        return false;
    }
    
    taskStore[taskId] = updatedTask;
    return true;
}

/**
 * Delete a task from the store
 * 
 * @returns {boolean} True if task was found and deleted
 */
export function deleteTaskFromStore(taskId: string): boolean {
    if (!taskStore[taskId]) {
        return false;
    }
    
    delete taskStore[taskId];
    return true;
} 
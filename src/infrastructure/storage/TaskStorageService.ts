import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Task, TaskStore } from '../../types/TaskTypes.js';

// Use home directory for storage to ensure consistent location regardless of execution directory
const HOME_DIR = os.homedir();

// Storage configurations
const DEFAULT_BASE_DIR = 'intelliplan';
const TASKS_DIR = 'tasks';

// Storage paths - initialized to empty, must be set with configureStorage
let BASE_DIR = '';
let STORAGE_DIR = '';
let STORAGE_FILE = '';

// Internal store, not exported directly
let taskStore: TaskStore = {};

/**
 * Configure the storage location
 * @param basePath Base path where IntelliPlan directory will be created (required)
 * @returns Current storage path
 */
export function configureStorage(basePath: string): string {
    if (!basePath) {
        throw new Error('Base path is required for storage configuration');
    }
    
    BASE_DIR = path.join(basePath, DEFAULT_BASE_DIR);
    STORAGE_DIR = path.join(BASE_DIR, TASKS_DIR);
    STORAGE_FILE = path.join(STORAGE_DIR, 'tasks.json');
    return STORAGE_DIR;
}

/**
 * Get current storage path
 */
export function getStoragePath(): string {
    if (!STORAGE_DIR) {
        throw new Error('Storage not configured. Call configureStorage first.');
    }
    return STORAGE_DIR;
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
 * Get path to a specific task folder
 * @param taskId The task ID
 */
export function getTaskFolder(taskId: string): string {
    if (!STORAGE_DIR) {
        throw new Error('Storage not configured. Call configureStorage first.');
    }
    return path.join(STORAGE_DIR, taskId);
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
    if (!STORAGE_DIR) {
        throw new Error('Storage not configured. Call configureStorage first.');
    }
    
    try {
        await fs.mkdir(STORAGE_DIR, { recursive: true });
    } catch (error) {
        throw error; // Re-throw to handle higher up
    }
}

/**
 * Ensures the task directory exists
 */
async function ensureTaskDir(taskId: string): Promise<void> {
    if (!STORAGE_DIR) {
        throw new Error('Storage not configured. Call configureStorage first.');
    }
    
    try {
        const taskDir = getTaskFolder(taskId);
        await fs.mkdir(taskDir, { recursive: true });
    } catch (error) {
        throw error;
    }
}

/**
 * Loads tasks for the current workspace
 */
export async function loadTasks(): Promise<void> {
    if (!STORAGE_FILE) {
        throw new Error('Storage not configured. Call configureStorage first.');
    }
    
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
    if (!STORAGE_FILE) {
        throw new Error('Storage not configured. Call configureStorage first.');
    }
    
    try {
        await ensureStorageDir();
        await fs.writeFile(STORAGE_FILE, JSON.stringify(taskStore, null, 2), 'utf-8');
        
        // Create individual task files
        for (const taskId in taskStore) {
            await ensureTaskDir(taskId);
            const taskFile = path.join(getTaskFolder(taskId), 'task.json');
            await fs.writeFile(taskFile, JSON.stringify(taskStore[taskId], null, 2), 'utf-8');
        }
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
    
    // Also delete the task directory
    try {
        const taskDir = getTaskFolder(taskId);
        fs.rm(taskDir, { recursive: true, force: true });
    } catch (error) {
        // Log but don't throw - task is still removed from memory store
        console.error('Error deleting task directory:', error);
    }
    
    return true;
} 
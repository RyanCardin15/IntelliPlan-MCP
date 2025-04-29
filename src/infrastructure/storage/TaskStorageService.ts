import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { Task, TaskStore } from '../../types/TaskTypes.js';

// Get dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Storage configurations - use absolute path based on project root
const TASKS_DIR = 'tasks';
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const STORAGE_DIR = PROJECT_ROOT;

// Internal store, not exported directly
let taskStore: TaskStore = {};

/**
 * Get the tasks directory path
 */
export function getTasksDir(): string {
    return path.join(STORAGE_DIR, TASKS_DIR);
}

/**
 * Get the path for a specific task folder
 */
export function getTaskDir(taskId: string): string {
    return path.join(getTasksDir(), taskId);
}

/**
 * Get the path for a task data file
 */
export function getTaskFilePath(taskId: string): string {
    return path.join(getTaskDir(taskId), 'task.json');
}

/**
 * Get the current storage path
 */
export function getStoragePath(): string {
    return STORAGE_DIR;
}

/**
 * Check if a file exists
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
 * Ensure the tasks directory exists
 */
async function ensureTasksDir(): Promise<void> {
    try {
        const tasksDir = getTasksDir();
        await fs.mkdir(tasksDir, { recursive: true });
    } catch (error: any) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
}

/**
 * Ensure a specific task directory exists
 */
async function ensureTaskDir(taskId: string): Promise<void> {
    try {
        const taskDir = getTaskDir(taskId);
        await fs.mkdir(taskDir, { recursive: true });
    } catch (error: any) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
}

/**
 * Loads all tasks from the file system
 */
export async function loadTasks(): Promise<void> {
    try {
        // Only read the tasks directory if it exists
        const tasksDir = getTasksDir();
        
        // Clear the current store
        taskStore = {};
        
        // Check if directory exists before reading
        const exists = await fileExists(tasksDir);
        if (!exists) {
            return; // Just return with empty store if no tasks directory exists
        }
        
        // Read the tasks directory
        const taskFolders = await fs.readdir(tasksDir);
        
        // Load each task
        for (const taskId of taskFolders) {
            const taskFilePath = getTaskFilePath(taskId);
            
            try {
                if (await fileExists(taskFilePath)) {
                    const taskData = await fs.readFile(taskFilePath, 'utf-8');
                    const task = JSON.parse(taskData);
                    
                    if (task && task.id) {
                        taskStore[task.id] = task;
                    }
                }
            } catch (error) {
                console.error(`Error loading task ${taskId}:`, error);
                // Continue to next task if one fails
            }
        }
    } catch (error) {
        console.error('Error loading tasks:', error);
        taskStore = {}; // Start fresh on load error
    }
}

/**
 * Saves a specific task to its file
 */
async function saveTask(task: Task): Promise<void> {
    try {
        await ensureTaskDir(task.id);
        await fs.writeFile(
            getTaskFilePath(task.id),
            JSON.stringify(task, null, 2),
            'utf-8'
        );
    } catch (error) {
        throw error;
    }
}

/**
 * Saves all tasks to the file system
 */
export async function saveTasks(): Promise<void> {
    try {
        await ensureTasksDir();
        
        // Save each task to its own file
        const savePromises = Object.values(taskStore).map(task => saveTask(task));
        await Promise.all(savePromises);
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
    
    // Also delete the task file and directory
    try {
        const taskDir = getTaskDir(taskId);
        fs.rm(taskDir, { recursive: true, force: true }).catch(error => {
            console.error(`Error deleting task directory for ${taskId}:`, error);
        });
    } catch (error) {
        console.error(`Error deleting task directory for ${taskId}:`, error);
        // Continue even if directory deletion fails
    }
    
    return true;
} 
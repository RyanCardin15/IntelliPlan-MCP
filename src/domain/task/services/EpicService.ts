import type { EpicRepository } from '../repositories/EpicRepository.js';
import type { Epic, Task, Subtask, Priority, Status, AssociatedFile } from '../entities/Task.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Service layer for managing Epics, Tasks, and Subtasks
 */
export class EpicService {
  constructor(private epicRepository: EpicRepository) {}

  // --- Epic Operations --- 

  getAllEpics(): Epic[] {
    return this.epicRepository.getAllEpics();
  }

  getEpicById(epicId: string): Epic | undefined {
    return this.epicRepository.getEpicById(epicId);
  }

  createEpic(params: { 
    description: string, 
    priority?: Priority,
    // Add other Epic fields as needed
  }): Epic {
    const now = new Date().toISOString();
    const newEpic: Epic = {
      id: uuidv4(),
      description: params.description,
      status: 'todo',
      priority: params.priority,
      createdAt: now,
      updatedAt: now,
      files: [],
      tasks: [],
      // ... initialize other fields
    };
    this.epicRepository.addEpic(newEpic);
    // Note: saveEpics() needs to be called separately
    return newEpic;
  }

  updateEpic(epicId: string, updates: Partial<Epic>): Epic | undefined {
    const epic = this.epicRepository.getEpicById(epicId);
    if (!epic) {
      return undefined;
    }
    // Create updated epic, ensuring arrays/objects are handled correctly
    const updatedEpic = { 
      ...epic, 
      ...updates,
      // Ensure nested arrays aren't overwritten if not provided in updates
      tasks: updates.tasks || epic.tasks,
      files: updates.files || epic.files,
      dependencies: updates.dependencies || epic.dependencies,
      updatedAt: new Date().toISOString() 
    };
    
    const success = this.epicRepository.updateEpic(epicId, updatedEpic);
    return success ? updatedEpic : undefined;
  }

  async deleteEpic(epicId: string): Promise<boolean> {
    const result = await Promise.resolve(this.epicRepository.deleteEpic(epicId));
    return result;
  }
  
  async saveAll(): Promise<void> {
      await this.epicRepository.saveEpics();
  }

  // --- Task Operations --- 

  getTaskById(taskId: string): { epic: Epic; task: Task } | undefined {
      // This requires searching through all epics
      for (const epic of this.getAllEpics()) {
          const task = epic.tasks.find(t => t.id === taskId);
          if (task) {
              return { epic, task };
          }
      }
      return undefined;
  }
  
  addTaskToEpic(epicId: string, params: { 
      description: string, 
      priority?: Priority,
      // Add other Task fields as needed
  }): Task | undefined {
    const epic = this.getEpicById(epicId);
    if (!epic) {
      return undefined;
    }
    
    const now = new Date().toISOString();
    const newTask: Task = {
      id: uuidv4(),
      description: params.description,
      status: 'todo',
      priority: params.priority,
      createdAt: now,
      updatedAt: now,
      files: [],
      subtasks: [],
      // ... initialize other Task fields
    };
    
    // Add task to the epic's task list
    epic.tasks.push(newTask);
    
    // Update the epic in the repository
    const updated = this.updateEpic(epicId, epic);
    
    return updated ? newTask : undefined;
  }

  updateTaskInEpic(epicId: string, taskId: string, updates: Partial<Task>): Task | undefined {
    const epic = this.getEpicById(epicId);
    if (!epic) return undefined;
    
    const taskIndex = epic.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return undefined;
    
    const existingTask = epic.tasks[taskIndex];
    const updatedTask = {
      ...existingTask,
      ...updates,
      // Ensure nested arrays aren't overwritten if not provided in updates
      subtasks: updates.subtasks || existingTask.subtasks,
      files: updates.files || existingTask.files,
      dependencies: updates.dependencies || existingTask.dependencies,
      updatedAt: new Date().toISOString()
    };
    
    epic.tasks[taskIndex] = updatedTask;
    const updated = this.updateEpic(epicId, epic);
    
    return updated ? updatedTask : undefined;
  }

  deleteTaskFromEpic(epicId: string, taskId: string): boolean {
    const epic = this.getEpicById(epicId);
    if (!epic) return false;
    
    const initialLength = epic.tasks.length;
    epic.tasks = epic.tasks.filter(t => t.id !== taskId);
    
    if (epic.tasks.length === initialLength) return false; // Task not found
        
    return this.updateEpic(epicId, epic) !== undefined;
  }

  // --- Subtask Operations --- 
  
  addSubtaskToTask(epicId: string, taskId: string, params: { description: string }): Subtask | undefined {
      const epic = this.getEpicById(epicId);
      if (!epic) return undefined;
      
      const task = epic.tasks.find(t => t.id === taskId);
      if (!task) return undefined;
      
      const now = new Date().toISOString();
      const newSubtask: Subtask = {
          id: uuidv4(),
          description: params.description,
          status: 'todo',
          createdAt: now,
      };
      
      task.subtasks.push(newSubtask);
      const updated = this.updateEpic(epicId, epic);
      
      return updated ? newSubtask : undefined;
  }
  
  updateSubtaskInTask(epicId: string, taskId: string, subtaskId: string, updates: Partial<Subtask>): Subtask | undefined {
      const epic = this.getEpicById(epicId);
      if (!epic) return undefined;
      
      const task = epic.tasks.find(t => t.id === taskId);
      if (!task) return undefined;
      
      const subtaskIndex = task.subtasks.findIndex(s => s.id === subtaskId);
      if (subtaskIndex === -1) return undefined;
      
      const existingSubtask = task.subtasks[subtaskIndex];
      const updatedSubtask = {
          ...existingSubtask,
          ...updates,
          // No nested arrays in Subtask currently
      };
      
      task.subtasks[subtaskIndex] = updatedSubtask;
      const updated = this.updateEpic(epicId, epic);
      
      return updated ? updatedSubtask : undefined;
  }
  
  deleteSubtaskFromTask(epicId: string, taskId: string, subtaskId: string): boolean {
      const epic = this.getEpicById(epicId);
      if (!epic) return false;
      
      const task = epic.tasks.find(t => t.id === taskId);
      if (!task) return false;
      
      const initialLength = task.subtasks.length;
      task.subtasks = task.subtasks.filter(s => s.id !== subtaskId);
      
      if (task.subtasks.length === initialLength) return false; // Subtask not found
          
      return this.updateEpic(epicId, epic) !== undefined;
  }
  
  // --- File Operations (Example for Epic) --- 
  
  // Need similar functions for adding/removing files from Tasks
  
  async addFileToEpic(epicId: string, filePath: string, description?: string): Promise<{ success: boolean, message: string }> {
      const epic = this.getEpicById(epicId);
      if (!epic) {
          return { success: false, message: `Error: Epic ${epicId} not found.` };
      }
      
      if (epic.files.some(f => f.filePath === filePath)) {
          return { success: true, message: `File ${filePath} already attached to epic ${epicId}.` };
      }
      
      const newFile: AssociatedFile = {
          filePath,
          description,
          addedAt: new Date().toISOString()
      };
      
      epic.files.push(newFile);
      const updated = this.updateEpic(epicId, epic);
      
      if (!updated) {
          return { success: false, message: `Error adding file to epic ${epicId}.` };
      }
      
      await this.saveAll(); // Persist change
      return { success: true, message: `File ${filePath} added to epic ${epicId}.` };
  }

  async removeFileFromEpic(epicId: string, filePath: string): Promise<{ success: boolean, message: string }> {
      const epic = this.getEpicById(epicId);
      if (!epic) {
          return { success: false, message: `Error: Epic ${epicId} not found.` };
      }
      
      const initialFileCount = epic.files.length;
      epic.files = epic.files.filter(f => f.filePath !== filePath);
      
      if (epic.files.length === initialFileCount) {
          return { success: true, message: `File ${filePath} not found in epic ${epicId}.` };
      }
      
      const updated = this.updateEpic(epicId, epic);
      
      if (!updated) {
          return { success: false, message: `Error removing file from epic ${epicId}.` };
      }
      
      await this.saveAll(); // Persist change
      return { success: true, message: `File ${filePath} removed from epic ${epicId}.` };
  }

  // --- Dependency Operations (Example for Epic) --- 
  
  // Need similar functions for Task dependencies

  async addEpicDependency(epicId: string, dependsOnEpicId: string): Promise<{ success: boolean, message: string }> {
      const epic = this.getEpicById(epicId);
      const dependsOnEpic = this.getEpicById(dependsOnEpicId);

      if (!epic) return { success: false, message: `Error: Epic ${epicId} not found.` };
      if (!dependsOnEpic) return { success: false, message: `Error: Dependency Epic ${dependsOnEpicId} not found.` };
      if (epicId === dependsOnEpicId) return { success: false, message: `Error: Epic cannot depend on itself.` };

      if (!epic.dependencies) epic.dependencies = [];
      if (epic.dependencies.includes(dependsOnEpicId)) {
          return { success: true, message: `Epic ${epicId} already depends on ${dependsOnEpicId}.` };
      }

      epic.dependencies.push(dependsOnEpicId);
      const updated = this.updateEpic(epicId, epic);

      if (!updated) {
          return { success: false, message: `Error adding dependency to epic ${epicId}.` };
      }
      
      await this.saveAll();
      return { success: true, message: `Epic ${dependsOnEpicId} added as dependency to epic ${epicId}.` };
  }

  async removeEpicDependency(epicId: string, dependsOnEpicId: string): Promise<{ success: boolean, message: string }> {
      const epic = this.getEpicById(epicId);
      if (!epic) return { success: false, message: `Error: Epic ${epicId} not found.` };
      if (!epic.dependencies || !epic.dependencies.includes(dependsOnEpicId)) {
          return { success: true, message: `Epic ${epicId} does not depend on ${dependsOnEpicId}.` };
      }

      epic.dependencies = epic.dependencies.filter(depId => depId !== dependsOnEpicId);
      const updated = this.updateEpic(epicId, epic);

      if (!updated) {
          return { success: false, message: `Error removing dependency from epic ${epicId}.` };
      }
      
      await this.saveAll();
      return { success: true, message: `Dependency ${dependsOnEpicId} removed from epic ${epicId}.` };
  }
}

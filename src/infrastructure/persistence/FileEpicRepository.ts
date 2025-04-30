import * as fs from 'fs/promises';
import * as path from 'path';
import type { Epic, EpicStore } from '../../domain/task/entities/Task.js';
import type { EpicRepository } from '../../domain/task/repositories/EpicRepository.js';

import { 
    configureStorage, 
    loadEpics as loadEpicsFromService, 
    saveEpics as saveEpicsToService,
    getEpics as getEpicsFromService,
    getEpicById as getEpicByIdFromService,
    addEpic as addEpicToService,
    updateEpicStore as updateEpicInService,
    deleteEpicFromStore as deleteEpicFromService,
    getStoragePath, 
    getBaseDir, 
    getEpicFolder
} from '../../infrastructure/storage/TaskStorageService.js';

/**
 * File-based implementation of the EpicRepository
 * Handles persistence of Epics (and their nested Tasks/Subtasks) to the filesystem
 */
export class FileEpicRepository implements EpicRepository {
  
  // Note: The storage service now manages the in-memory store (`epicStore`).
  // This repository acts as a bridge and ensures the correct storage service functions are called.

  /**
   * Creates a new FileEpicRepository instance
   * @param basePath Base directory path where intelliplan directory will be created (required)
   */
  constructor(private basePath: string) {
    if (!basePath) {
      throw new Error('Base path is required for storage configuration');
    }
    // Configuration happens via the storage service, typically called by a tool or app init.
    // We might store basePath here if needed for repository-specific logic, but configuration
    // primarily lives in the TaskStorageService.
    configureStorage(basePath);
  }
  
  /**
   * Loads Epics from storage using the service
   */
  async loadEpics(): Promise<void> {
    await loadEpicsFromService();
  }
  
  /**
   * Saves Epics to storage using the service
   */
  async saveEpics(): Promise<void> {
    await saveEpicsToService();
  }
  
  /**
   * Get all Epics using the service
   */
  getAllEpics(): Epic[] {
    return getEpicsFromService();
  }
  
  /**
   * Get Epic by ID using the service
   */
  getEpicById(id: string): Epic | undefined {
    return getEpicByIdFromService(id);
  }
  
  /**
   * Add a new Epic using the service
   */
  addEpic(epic: Epic): boolean {
    const success = addEpicToService(epic);
    // Consider immediate save or rely on explicit save call?
    // For now, rely on explicit save call like before.
    return success;
  }
  
  /**
   * Update an existing Epic using the service
   */
  updateEpic(id: string, epic: Epic): boolean {
    const success = updateEpicInService(id, epic);
    return success;
  }
  
  /**
   * Delete an Epic using the service
   */
  deleteEpic(id: string): boolean {
    const success = deleteEpicFromService(id);
    return success;
  }

  // --- Methods specific to this implementation (if any) or potentially deprecated ---

  /**
   * Configure storage settings (delegated to service)
   */
  configureStorage(basePath: string): string {
     // Re-configure if needed, though usually done once at start
    return configureStorage(basePath);
  }
  
  /**
   * Get path to a specific Epic folder (delegated to service)
   */
  getEpicFolder(epicId: string): string {
    return getEpicFolder(epicId);
  }
  
  /**
   * Get current storage path (delegated to service)
   */
  getStoragePath(): string {
    return getStoragePath();
  }
  
  /**
   * Get base directory (delegated to service)
   */
  getBaseDir(): string {
    return getBaseDir();
  }
} 
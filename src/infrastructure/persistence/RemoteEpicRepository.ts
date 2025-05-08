import type { Epic, EpicStore } from '../../domain/task/entities/Task.js';
import type { EpicRepository } from '../../domain/task/repositories/EpicRepository.js';
import fetch from 'node-fetch';

/**
 * Remote server-based implementation of the EpicRepository
 * Handles persistence of Epics (and their nested Tasks/Subtasks) via REST API calls
 */
export class RemoteEpicRepository implements EpicRepository {
  private apiUrl: string;
  private apiKey?: string;
  private epicCache: EpicStore = {};
  
  /**
   * Creates a new RemoteEpicRepository instance
   * @param apiUrl Base URL for the REST API (e.g., 'https://api.intelliplan.com/v1')
   * @param apiKey Optional API key for authentication
   */
  constructor(apiUrl: string, apiKey?: string) {
    if (!apiUrl) {
      throw new Error('API URL is required for remote repository configuration');
    }
    
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }
  
  /**
   * Creates headers for API requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    
    return headers;
  }
  
  /**
   * Loads Epics from the remote server
   */
  async loadEpics(): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/epics`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to load epics: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Convert array to object with ID keys
      this.epicCache = {};
      if (Array.isArray(data)) {
        data.forEach((epic: Epic) => {
          this.epicCache[epic.id] = epic;
        });
      } else {
        console.error('Unexpected data format from server, expected array of Epics');
      }
    } catch (error) {
      console.error('Error loading epics from remote server:', error);
      throw error;
    }
  }
  
  /**
   * Saves all Epics to the remote server
   * Note: This is a bulk operation - in practice, individual CRUD operations
   * are preferred for production systems
   */
  async saveEpics(): Promise<void> {
    try {
      const epicsArray = Object.values(this.epicCache);
      
      const response = await fetch(`${this.apiUrl}/epics/batch`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(epicsArray),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save epics: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error saving epics to remote server:', error);
      throw error;
    }
  }
  
  /**
   * Get all Epics
   */
  getAllEpics(): Epic[] {
    return Object.values(this.epicCache);
  }
  
  /**
   * Get Epic by ID
   */
  getEpicById(id: string): Epic | undefined {
    return this.epicCache[id];
  }
  
  /**
   * Add a new Epic
   */
  async addEpic(epic: Epic): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/epics`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(epic),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to add epic: ${response.statusText}`);
      }
      
      // Update local cache
      this.epicCache[epic.id] = epic;
      return true;
    } catch (error) {
      console.error('Error adding epic to remote server:', error);
      return false;
    }
  }
  
  /**
   * Update an existing Epic
   */
  async updateEpic(id: string, epic: Epic): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/epics/${id}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(epic),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update epic: ${response.statusText}`);
      }
      
      // Update local cache
      this.epicCache[id] = epic;
      return true;
    } catch (error) {
      console.error('Error updating epic on remote server:', error);
      return false;
    }
  }
  
  /**
   * Delete an Epic
   */
  async deleteEpic(id: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/epics/${id}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete epic: ${response.statusText}`);
      }
      
      // Update local cache
      delete this.epicCache[id];
      return true;
    } catch (error) {
      console.error('Error deleting epic from remote server:', error);
      return false;
    }
  }
  
  /**
   * Get API URL
   */
  getApiUrl(): string {
    return this.apiUrl;
  }
} 
import * as path from 'path';
import * as fs from 'fs/promises';

async function main() {
  console.log('Debug MCP Paths');
  
  // Where are we?
  console.log('Current working directory:', process.cwd());
  
  // What files exist?
  try {
    const files = await fs.readdir('.');
    console.log('Files in current directory:', files);
  } catch (error) {
    console.error('Error reading current directory:', error);
  }
  
  // Check relative paths
  const relativePath = './tasks';
  console.log('Relative path resolved:', path.resolve(relativePath));
  
  // Attempt to create tasks directory
  try {
    await fs.mkdir(relativePath, { recursive: true });
    console.log('Successfully created tasks directory at:', path.resolve(relativePath));
    
    // Create a test file
    const testFilePath = path.join(relativePath, 'test-file.json');
    await fs.writeFile(testFilePath, JSON.stringify({ test: true }), 'utf-8');
    console.log('Successfully created test file at:', path.resolve(testFilePath));
    
    // List contents of tasks directory
    const tasksFiles = await fs.readdir(relativePath);
    console.log('Files in tasks directory:', tasksFiles);
  } catch (error) {
    console.error('Error creating tasks directory or file:', error);
  }
}

main().catch(console.error); 
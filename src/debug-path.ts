import * as path from 'path';
import * as fs from 'fs/promises';

async function main() {
  const cwd = process.cwd();
  console.log('Current working directory:', cwd);
  
  const relativePath = './tasks';
  console.log('Relative path:', relativePath);
  
  const resolvedPath = path.resolve(relativePath);
  console.log('Resolved path:', resolvedPath);
  
  try {
    await fs.mkdir(resolvedPath, { recursive: true });
    console.log('Directory created successfully');
    
    const testTaskDir = path.resolve(resolvedPath, 'test-task');
    await fs.mkdir(testTaskDir, { recursive: true });
    console.log('Test task directory created at:', testTaskDir);
    
    await fs.writeFile(path.resolve(testTaskDir, 'test.json'), JSON.stringify({ test: true }));
    console.log('Test file written successfully');
  } catch (error) {
    console.error('Error creating directory:', error);
  }
}

main().catch(console.error); 
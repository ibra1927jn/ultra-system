import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Pure saveFile logic extracted from ocr.js.
 * Saves a buffer to a timestamped file in a given directory.
 */
function saveFile(buffer, originalName, uploadDir) {
  const timestamp = Date.now();
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `${timestamp}_${safeName}`;
  const filePath = path.join(uploadDir, fileName);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * Pure listFiles logic extracted from ocr.js.
 */
function listFiles(uploadDir) {
  if (!fs.existsSync(uploadDir)) return [];
  return fs.readdirSync(uploadDir).map((name) => {
    const filePath = path.join(uploadDir, name);
    const stats = fs.statSync(filePath);
    return {
      name,
      size: stats.size,
      created: stats.birthtime,
      path: filePath,
    };
  });
}

describe('OCR saveFile', () => {
  let tmpDir;

  function setup() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-test-'));
  }

  function cleanup() {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  }

  it('saves a buffer to disk and returns the path', () => {
    setup();
    try {
      const buf = Buffer.from('hello pdf content');
      const result = saveFile(buf, 'test.pdf', tmpDir);
      expect(fs.existsSync(result)).toBe(true);
      expect(fs.readFileSync(result).toString()).toBe('hello pdf content');
    } finally {
      cleanup();
    }
  });

  it('sanitizes dangerous characters in filename', () => {
    setup();
    try {
      const buf = Buffer.from('data');
      const result = saveFile(buf, '../../../etc/passwd', tmpDir);
      const fileName = path.basename(result);
      // slashes are replaced with underscores, file stays in upload dir
      expect(fileName).not.toContain('/');
      expect(result.startsWith(tmpDir)).toBe(true);
      expect(fileName).toContain('etc_passwd');
    } finally {
      cleanup();
    }
  });

  it('sanitizes spaces and special chars in filename', () => {
    setup();
    try {
      const buf = Buffer.from('data');
      const result = saveFile(buf, 'my file (2).pdf', tmpDir);
      const fileName = path.basename(result);
      expect(fileName).not.toContain(' ');
      expect(fileName).not.toContain('(');
      expect(fileName).toContain('my_file__2_.pdf');
    } finally {
      cleanup();
    }
  });

  it('preserves allowed characters in filename', () => {
    setup();
    try {
      const buf = Buffer.from('data');
      const result = saveFile(buf, 'report-2024.01.pdf', tmpDir);
      const fileName = path.basename(result);
      expect(fileName).toContain('report-2024.01.pdf');
    } finally {
      cleanup();
    }
  });
});

describe('OCR listFiles', () => {
  let tmpDir;

  function setup() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-list-'));
  }

  function cleanup() {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  }

  it('returns empty array for non-existent directory', () => {
    expect(listFiles('/tmp/nonexistent-dir-' + Date.now())).toEqual([]);
  });

  it('returns empty array for empty directory', () => {
    setup();
    try {
      expect(listFiles(tmpDir)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('lists files with correct metadata', () => {
    setup();
    try {
      fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'hello');
      const files = listFiles(tmpDir);
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('test.txt');
      expect(files[0].size).toBe(5);
      expect(files[0].path).toBe(path.join(tmpDir, 'test.txt'));
      expect(files[0].created).toBeInstanceOf(Date);
    } finally {
      cleanup();
    }
  });

  it('lists multiple files', () => {
    setup();
    try {
      fs.writeFileSync(path.join(tmpDir, 'a.pdf'), 'aaa');
      fs.writeFileSync(path.join(tmpDir, 'b.png'), 'bbbb');
      const files = listFiles(tmpDir);
      expect(files).toHaveLength(2);
      const names = files.map(f => f.name).sort();
      expect(names).toEqual(['a.pdf', 'b.png']);
    } finally {
      cleanup();
    }
  });
});

const Client = require('ssh2-sftp-client');
const { Client: SSHClient } = require('ssh2');
const path = require('path');
const fs = require('fs');

// Cargar variables de entorno desde .env
require('dotenv').config();

const config = {
  host: process.env.DEPLOY_HOST,
  port: parseInt(process.env.DEPLOY_PORT || '22', 10),
  username: process.env.DEPLOY_USER || 'root',
  // Preferir SSH key, fallback a password
  ...(process.env.DEPLOY_SSH_KEY
    ? { privateKey: fs.readFileSync(process.env.DEPLOY_SSH_KEY) }
    : { password: process.env.DEPLOY_PASS }),
  readyTimeout: 30000,
  keepaliveInterval: 10000, // Keep connection alive
};

if (!config.host) {
  console.error('ERROR: DEPLOY_HOST not set in .env');
  process.exit(1);
}

const sftp = new Client();

async function deploy() {
  try {
    console.log('Conectando a Hetzner via SFTP...');
    await sftp.connect(config);

    console.log('Subiendo archivos a /root/ultra-system...');
    const localPath = __dirname;
    const remotePath = '/root/ultra-system';

    const exists = await sftp.exists(remotePath);
    if (!exists) {
      await sftp.mkdir(remotePath, true);
    }

    // Filtro estricto para ignorar dependencias pesadas
    const filter = (f, isDir) => {
      // Ignore node_modules directory entirely
      if (f.includes('node_modules') || f.includes('.git') || f.includes('deploy.tar.gz')) return false;
      return true;
    };

    const foldersToUpload = ['db', 'docs', 'scripts', 'ultra-engine'];
    const filesToUpload = ['.env', '.env.example', '.gitignore', 'docker-compose.yml', 'README.md'];

    for (const folder of foldersToUpload) {
      console.log(`Subiendo carpeta (sin node_modules): ${folder}...`);
      await sftp.uploadDir(path.join(localPath, folder), `${remotePath}/${folder}`, filter);
    }

    for (const file of filesToUpload) {
      if (fs.existsSync(path.join(localPath, file))) {
         console.log(`Subiendo archivo: ${file}...`);
         await sftp.fastPut(path.join(localPath, file), `${remotePath}/${file}`);
      }
    }

    console.log('Archivos subidos exitosamente.');
    await sftp.end();

    console.log('Ejecutando script de despliegue en remoto...');

    const conn = new SSHClient();
    conn.on('ready', () => {
      console.log('Conexion SSH establecida');
      conn.exec('cd /root/ultra-system && dos2unix scripts/deploy.sh || true && chmod +x scripts/deploy.sh && bash scripts/deploy.sh', (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
          console.log(`\nProceso terminado con codigo: ${code}`);
          conn.end();
        }).on('data', (data) => {
          process.stdout.write(data.toString());
        }).stderr.on('data', (data) => {
          process.stderr.write(data.toString());
        });
      });
    }).on('error', (err) => {
       console.error('Error SSH:', err);
    }).connect(config);

  } catch (err) {
    console.error('Fallo el despliegue:', err.message);
  }
}

deploy();
